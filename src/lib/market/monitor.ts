import { and, sql, inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  gifts,
  priceHistory,
  profiles,
  watches,
  favorites,
  notifications,
  priceTargets,
  portfolio,
} from "@/db/schema";
import {
  fetchMarketFloors,
  simulateFloor,
  type FetchResult,
  type SourcePreference,
} from "./providers";
import { SEED_GIFTS } from "./catalog";
import { ensureSeed, logEvent } from "./ensure";
import { getMonitorState, getSetting, setSetting, type TickSummary, type SourceStatus } from "./settings";
import { renderAlertMessage, renderTargetMessage, renderDigestMessage } from "@/lib/telegram/render";
import { sendMessage, telegramToken } from "@/lib/telegram/api";

/* In-process tick lock (single Node runtime per instance). */
const g = globalThis as typeof globalThis & { __scannerTickRunning?: boolean };

/**
 * One full monitoring cycle:
 *  1. fetch floors from the best available market source
 *  2. validate + persist floors & offers
 *  3. record history rows for every detected change
 *  4. fan-out deduplicated notifications (in-app + Telegram)
 */
export async function runMonitorTick(reason = "interval"): Promise<TickSummary> {
  if (g.__scannerTickRunning) {
    return {
      at: new Date().toISOString(),
      reason,
      source: "busy",
      scanned: 0,
      changed: 0,
      notified: 0,
      durationMs: 0,
      error: "tick already running",
    };
  }
  g.__scannerTickRunning = true;
  const started = Date.now();
  const summary: TickSummary = {
    at: new Date().toISOString(),
    reason,
    source: "?",
    scanned: 0,
    changed: 0,
    notified: 0,
    durationMs: 0,
  };

  try {
    await ensureSeed();
    const rows = await db.select().from(gifts);
    summary.scanned = rows.length;

    const preference = (await getSetting<SourcePreference>("source_preference")) ?? "auto";
    const result: FetchResult = await fetchMarketFloors(SEED_GIFTS, preference);
    summary.source = result.source;
    await setSetting("source", {
      name: result.source,
      ok: true,
      detail: result.detail,
      at: new Date().toISOString(),
    } satisfies SourceStatus);

    const token = telegramToken();

    for (const row of rows) {
      let point = result.points.get(row.slug);
      if (!point) {
        // Source lacks this collection → keep it alive with gentle synthetic drift.
        const sim = simulateFloor(row.floorTon, row.slug);
        point = { slug: row.slug, name: row.name, floorTon: sim.price, offers: sim.offers };
      }

      const oldPrice = Number(row.floorTon);
      const newPrice = Number(point.floorTon);
      if (!Number.isFinite(newPrice) || newPrice <= 0) {
        await logEvent("warn", "monitor", `Rejected invalid floor for ${row.name}`, {
          newPrice,
        });
        continue;
      }

      // Outlier guard: a single-tick move above 80% is treated as a data glitch.
      const rawPct = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
      if (Math.abs(rawPct) > 80 && oldPrice > 0) {
        await logEvent("warn", "monitor", `Outlier rejected for ${row.name}`, {
          oldPrice,
          newPrice,
          rawPct,
        });
        continue;
      }

      const changed = Math.abs(newPrice - oldPrice) > 1e-9;

      await db
        .update(gifts)
        .set({
          prevFloorTon: oldPrice,
          floorTon: newPrice,
          offersCount: Math.max(0, Math.round(point.offers)),
          lastChangePct: changed ? round3(rawPct) : row.lastChangePct,
          lastScanAt: new Date(),
        })
        .where(eq(gifts.id, row.id));

      // Ценовые цели проверяем по каждому обновлённому флору.
      summary.notified += await checkPriceTargets(row.id, row.name, newPrice, token);

      if (!changed) continue;
      summary.changed += 1;

      const [hist] = await db
        .insert(priceHistory)
        .values({
          giftId: row.id,
          oldPrice,
          newPrice,
          delta: round3(newPrice - oldPrice),
          pct: round3(rawPct),
          source: result.source,
        })
        .returning({ id: priceHistory.id });

      summary.notified += await dispatchNotifications(row.id, row.name, hist.id, {
        oldPrice,
        newPrice,
        pct: round3(rawPct),
        token,
      });
    }

    // Ежедневная утренняя сводка (UTC ≥ 09:00, один раз в сутки).
    summary.notified += await maybeSendDailyDigest(token);

    await logEvent("info", "monitor", `tick ${reason}: ${summary.changed}/${summary.scanned} changed`, {
      source: result.source,
      notified: summary.notified,
    });
  } catch (e) {
    summary.error = (e as Error).message;
    await logEvent("error", "monitor", `tick failed: ${(e as Error).message}`);
    await setSetting("source", {
      name: "simulator",
      ok: false,
      detail: (e as Error).message,
      at: new Date().toISOString(),
    } satisfies SourceStatus);
  } finally {
    summary.durationMs = Date.now() - started;
    g.__scannerTickRunning = false;

    const state = await getMonitorState();
    await setSetting("monitor", {
      ...state,
      lastTickAt: summary.at,
      lastTickSummary: summary,
      running: false,
    });
  }
  return summary;
}

/** Create deduplicated alerts for every interested profile. */
async function dispatchNotifications(
  giftId: number,
  giftName: string,
  historyId: number,
  info: { oldPrice: number; newPrice: number; pct: number; token: string | null },
): Promise<number> {
  const watchers = await db
    .select({ profileId: watches.profileId })
    .from(watches)
    .where(eq(watches.giftId, giftId));
  const favs = await db
    .select({ profileId: favorites.profileId })
    .from(favorites)
    .where(eq(favorites.giftId, giftId));

  const ids = new Set<string>([
    ...watchers.map((w) => w.profileId),
    ...favs.map((f) => f.profileId),
  ]);
  if (!ids.size) return 0;

  const rows = await db.select().from(profiles).where(inArray(profiles.id, [...ids]));
  let sent = 0;

  for (const p of rows) {
    if (p.blocked || !p.notificationsEnabled) continue;
    if (Math.abs(info.pct) < Number(p.thresholdPct)) continue;

    const dedupeKey = `${p.id}:${historyId}`;
    const { title, body } = renderAlertMessage({
      giftName,
      oldPrice: info.oldPrice,
      newPrice: info.newPrice,
      pct: info.pct,
      at: new Date(),
    });

    const inserted = await db
      .insert(notifications)
      .values({
        profileId: p.id,
        giftId,
        historyId,
        dedupeKey,
        kind: "floor_change",
        title,
        body,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });

    if (!inserted.length) continue; // duplicate event → no repeat alert
    sent += 1;

    if (info.token && p.telegramChatId) {
      const ok = await sendMessage(info.token, p.telegramChatId, {
        text: `${title}\n\n${body}`,
        keyboard: [
          [{ text: "Открыть подарок", callback_data: `gift:${String(giftId)}` }],
          [{ text: "Открыть мониторинг", callback_data: "nav:monitor" }],
        ],
      });
      if (ok) {
        await db
          .update(notifications)
          .set({ telegramSent: true })
          .where(eq(notifications.id, inserted[0].id));
      }
    }
  }
  return sent;
}

/** Одноразовые ценовые цели: срабатывают при пересечении порога и деактивируются. */
async function checkPriceTargets(
  giftId: number,
  giftName: string,
  newPrice: number,
  token: string | null,
): Promise<number> {
  if (!Number.isFinite(newPrice) || newPrice <= 0) return 0;
  const rows = await db
    .select()
    .from(priceTargets)
    .where(and(eq(priceTargets.giftId, giftId), eq(priceTargets.active, true)));

  let fired = 0;
  for (const t of rows) {
    const hit = t.direction === "below" ? newPrice <= t.targetTon : newPrice >= t.targetTon;
    if (!hit) continue;

    await db
      .update(priceTargets)
      .set({ active: false, hits: t.hits + 1 })
      .where(eq(priceTargets.id, t.id));

    const [p] = await db.select().from(profiles).where(eq(profiles.id, t.profileId)).limit(1);
    if (!p) continue;

    const { title, body } = renderTargetMessage({
      giftName,
      direction: t.direction as "below" | "above",
      targetTon: Number(t.targetTon),
      nowPrice: newPrice,
      at: new Date(),
    });
    const inserted = await db
      .insert(notifications)
      .values({
        profileId: p.id,
        giftId,
        historyId: 0,
        dedupeKey: `${p.id}:target:${t.id}:${t.hits}`,
        kind: "target_hit",
        title,
        body,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });
    if (!inserted.length) continue;
    fired += 1;

    if (token && p.telegramChatId && p.notificationsEnabled) {
      const ok = await sendMessage(token, p.telegramChatId, {
        text: `${title}\n\n${body}`,
        keyboard: [
          [{ text: "Открыть подарок", callback_data: `gift:${giftId}` }],
          [{ text: "Мои цели", callback_data: "nav:targets" }],
        ],
      });
      if (ok) {
        await db
          .update(notifications)
          .set({ telegramSent: true })
          .where(eq(notifications.id, inserted[0].id));
      }
    }
  }
  return fired;
}

/** Утренняя сводка рынка: топ-движения + личный портфель. Раз в сутки, без повторов. */
async function maybeSendDailyDigest(token: string | null): Promise<number> {
  const now = new Date();
  if (now.getUTCHours() < 9) return 0;
  const key = `digest:${now.toISOString().slice(0, 10)}`;
  if (await getSetting<boolean>(key)) return 0;
  await setSetting(key, true);

  const gainers = await db
    .select()
    .from(gifts)
    .where(sql`${gifts.lastChangePct} > 0`)
    .orderBy(sql`${gifts.lastChangePct} desc`)
    .limit(3);
  const losers = await db
    .select()
    .from(gifts)
    .where(sql`${gifts.lastChangePct} < 0`)
    .orderBy(sql`${gifts.lastChangePct} asc`)
    .limit(3);
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(priceHistory)
    .where(sql`${priceHistory.createdAt} > now() - interval '24 hours'`);

  const ps = await db.select().from(profiles).where(eq(profiles.notificationsEnabled, true));
  let sent = 0;

  for (const p of ps) {
    const pos = await db
      .select({ qty: portfolio.qty, entry: portfolio.entryTon, floor: gifts.floorTon })
      .from(portfolio)
      .innerJoin(gifts, eq(portfolio.giftId, gifts.id))
      .where(eq(portfolio.profileId, p.id));
    const pf = pos.length
      ? {
          value: pos.reduce((s, r) => s + r.qty * Number(r.floor), 0),
          cost: pos.reduce((s, r) => s + r.qty * Number(r.entry), 0),
          items: pos.reduce((s, r) => s + r.qty, 0),
        }
      : null;

    const { title, body } = renderDigestMessage({
      changes24h: Number(c),
      gainers: gainers.map((g) => ({ name: g.name, pct: Number(g.lastChangePct), floor: Number(g.floorTon) })),
      losers: losers.map((g) => ({ name: g.name, pct: Number(g.lastChangePct), floor: Number(g.floorTon) })),
      portfolio: pf,
    });

    const inserted = await db
      .insert(notifications)
      .values({
        profileId: p.id,
        giftId: gainers[0]?.id ?? 1,
        historyId: 0,
        dedupeKey: `${p.id}:${key}`,
        kind: "digest",
        title,
        body,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });
    if (!inserted.length) continue;
    sent += 1;

    if (token && p.telegramChatId) {
      const ok = await sendMessage(token, p.telegramChatId, {
        text: `${title}\n\n${body}`,
        keyboard: [
          [{ text: "Открыть каталог", callback_data: "nav:cat" }],
          [{ text: "Мой портфель", callback_data: "nav:portfolio" }],
        ],
      });
      if (ok) {
        await db
          .update(notifications)
          .set({ telegramSent: true })
          .where(eq(notifications.id, inserted[0].id));
      }
    }
  }
  return sent;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
