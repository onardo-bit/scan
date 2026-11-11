import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  profiles,
  gifts,
  priceHistory,
  events,
  watches,
  favorites,
  notifications,
  priceTargets,
  portfolio,
} from "@/db/schema";
import { ensureSeed, logEvent } from "@/lib/market/ensure";
import { getMonitorState, getSetting, setSetting } from "@/lib/market/settings";
import { runMonitorTick } from "@/lib/market/monitor";
import { sendMessage, telegramToken } from "@/lib/telegram/api";
import type { SourcePreference } from "@/lib/market/providers";
import { extendUntil, resolvePlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

function adminCode(): string {
  return process.env.ADMIN_CODE || "demo-admin";
}

function authorized(req: NextRequest): boolean {
  return req.headers.get("x-admin-code") === adminCode();
}

export async function GET(req: NextRequest) {
  await ensureSeed();
  if (!authorized(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  /* Полный JSON-экспорт для резервной копии / аналитики. */
  if (req.nextUrl.searchParams.get("export") === "json") {
    const [userRows, giftRows, historyRows, targetRows, portfolioRows] = await Promise.all([
      db.select().from(profiles).orderBy(desc(profiles.createdAt)),
      db.select().from(gifts).orderBy(gifts.id),
      db.select().from(priceHistory).orderBy(desc(priceHistory.createdAt)).limit(10_000),
      db.select().from(priceTargets).orderBy(desc(priceTargets.id)),
      db.select().from(portfolio).orderBy(desc(portfolio.id)),
    ]);
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      users: userRows,
      gifts: giftRows,
      priceHistory: historyRows,
      targets: targetRows,
      portfolio: portfolioRows,
    });
  }

  const [
    [{ value: users }],
    [{ value: collections }],
    [{ value: subs }],
    [{ value: favs }],
    [{ value: targetCount }],
    [{ value: positionCount }],
    [{ value: linked }],
    [{ value: blocked }],
    [{ value: premiumCount }],
    [{ value: active24h }],
  ] = await Promise.all([
    db.select({ value: count() }).from(profiles),
    db.select({ value: count() }).from(gifts),
    db.select({ value: count() }).from(watches),
    db.select({ value: count() }).from(favorites),
    db.select({ value: count() }).from(priceTargets).where(eq(priceTargets.active, true)),
    db.select({ value: count() }).from(portfolio),
    db
      .select({ value: count() })
      .from(profiles)
      .where(sql`${profiles.telegramChatId} is not null`),
    db.select({ value: count() }).from(profiles).where(eq(profiles.blocked, true)),
    db
      .select({ value: count() })
      .from(profiles)
      .where(sql`${profiles.plan} = 'premium' and ${profiles.planUntil} > now()`),
    db
      .select({ value: count() })
      .from(profiles)
      .where(sql`${profiles.lastSeenAt} > now() - interval '24 hours'`),
  ]);

  const [[{ value: changes24h }], [{ value: alerts24h }]] = await Promise.all([
    db
      .select({ value: count() })
      .from(priceHistory)
      .where(sql`${priceHistory.createdAt} > now() - interval '24 hours'`),
    db
      .select({ value: count() })
      .from(notifications)
      .where(sql`${notifications.createdAt} > now() - interval '24 hours'`),
  ]);

  const [recentEvents, userBase, watchAgg, favAgg, targetAgg, positionAgg] =
    await Promise.all([
      db.select().from(events).orderBy(desc(events.createdAt), desc(events.id)).limit(60),
      db.select().from(profiles).orderBy(desc(profiles.lastSeenAt)).limit(100),
      db
        .select({ profileId: watches.profileId, value: count() })
        .from(watches)
        .groupBy(watches.profileId),
      db
        .select({ profileId: favorites.profileId, value: count() })
        .from(favorites)
        .groupBy(favorites.profileId),
      db
        .select({ profileId: priceTargets.profileId, value: count() })
        .from(priceTargets)
        .where(eq(priceTargets.active, true))
        .groupBy(priceTargets.profileId),
      db
        .select({ profileId: portfolio.profileId, value: count() })
        .from(portfolio)
        .groupBy(portfolio.profileId),
    ]);

  const toMap = (rows: Array<{ profileId: string; value: number }>) =>
    new Map(rows.map((r) => [r.profileId, Number(r.value)]));
  const watchMap = toMap(watchAgg);
  const favMap = toMap(favAgg);
  const targetMap = toMap(targetAgg);
  const positionMap = toMap(positionAgg);
  const userRows = userBase.map((u) => ({
    ...u,
    planView: resolvePlan(u),
    watches: watchMap.get(u.id) ?? 0,
    favorites: favMap.get(u.id) ?? 0,
    targets: targetMap.get(u.id) ?? 0,
    positions: positionMap.get(u.id) ?? 0,
  }));

  const monitor = await getMonitorState();
  const source = await getSetting<unknown>("source");
  const sourcePreference =
    (await getSetting<SourcePreference>("source_preference")) ?? "auto";

  return NextResponse.json({
    stats: {
      users: Number(users),
      active24h: Number(active24h),
      linkedTelegram: Number(linked),
      blocked: Number(blocked),
      premium: Number(premiumCount),
      collections: Number(collections),
      subscriptions: Number(subs),
      favorites: Number(favs),
      targets: Number(targetCount),
      positions: Number(positionCount),
      changes24h: Number(changes24h),
      alerts24h: Number(alerts24h),
    },
    monitor,
    source,
    sourcePreference,
    users: userRows,
    events: recentEvents,
    telegram: {
      tokenConfigured: Boolean(telegramToken()),
      adminChat: Boolean(process.env.ADMIN_CHAT_ID),
      polling: process.env.TELEGRAM_POLLING === "true",
    },
  });
}

export async function POST(req: NextRequest) {
  await ensureSeed();
  if (!authorized(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    intervalSec?: number;
    enabled?: boolean;
    source?: SourcePreference;
    profileId?: string;
    blocked?: boolean;
    role?: "user" | "admin";
    notificationsEnabled?: boolean;
    digestEnabled?: boolean;
    text?: string;
    audience?: "all" | "active" | "admins";
    days?: number;
    months?: number;
  };

  switch (body.action) {
    case "set_interval": {
      const sec = Math.max(60, Math.min(3600, Math.round(body.intervalSec ?? 120)));
      const state = await getMonitorState();
      await setSetting("monitor", { ...state, intervalSec: sec });
      await logEvent("info", "admin", `интервал сканирования изменён на ${sec}с`);
      return NextResponse.json({ ok: true, intervalSec: sec });
    }

    case "toggle_monitor": {
      const state = await getMonitorState();
      const enabled = typeof body.enabled === "boolean" ? body.enabled : !state.enabled;
      await setSetting("monitor", { ...state, enabled });
      await logEvent("warn", "admin", `автоматический мониторинг ${enabled ? "запущен" : "остановлен"}`);
      return NextResponse.json({ ok: true, enabled });
    }

    case "set_source": {
      const allowed: SourcePreference[] = ["auto", "tonnel", "portals", "simulator"];
      const source = allowed.includes(body.source as SourcePreference)
        ? (body.source as SourcePreference)
        : "auto";
      await setSetting("source_preference", source);
      await logEvent("warn", "admin", `предпочтительный источник: ${source}`);
      return NextResponse.json({ ok: true, source });
    }

    case "run_tick": {
      const summary = await runMonitorTick("admin");
      return NextResponse.json({ ok: true, summary });
    }

    case "grant_premium": {
      if (!body.profileId)
        return NextResponse.json({ error: "profileId required" }, { status: 400 });
      const months = Math.max(1, Math.min(24, Math.round(body.months ?? 1)));
      const [row] = await db
        .select({ planUntil: profiles.planUntil })
        .from(profiles)
        .where(eq(profiles.id, body.profileId))
        .limit(1);
      const until = extendUntil(row?.planUntil ?? null, months);
      await db
        .update(profiles)
        .set({ plan: "premium", planUntil: until })
        .where(eq(profiles.id, body.profileId));
      await logEvent("info", "billing", `админ выдал Premium на ${months} мес.`, {
        profileId: body.profileId,
      });
      return NextResponse.json({ ok: true, until });
    }

    case "revoke_premium": {
      if (!body.profileId)
        return NextResponse.json({ error: "profileId required" }, { status: 400 });
      await db
        .update(profiles)
        .set({ plan: "free", planUntil: null })
        .where(eq(profiles.id, body.profileId));
      await logEvent("warn", "billing", "админ отозвал Premium", { profileId: body.profileId });
      return NextResponse.json({ ok: true });
    }

    case "update_user": {
      if (!body.profileId)
        return NextResponse.json({ error: "profileId required" }, { status: 400 });
      const patch: Partial<typeof profiles.$inferInsert> = {};
      if (typeof body.blocked === "boolean") patch.blocked = body.blocked;
      if (body.role === "admin" || body.role === "user") patch.role = body.role;
      if (typeof body.notificationsEnabled === "boolean")
        patch.notificationsEnabled = body.notificationsEnabled;
      if (typeof body.digestEnabled === "boolean") patch.digestEnabled = body.digestEnabled;
      await db.update(profiles).set(patch).where(eq(profiles.id, body.profileId));
      await logEvent("warn", "admin", `профиль ${body.profileId.slice(0, 8)} обновлён`, patch);
      return NextResponse.json({ ok: true });
    }

    case "broadcast": {
      const text = (body.text ?? "").trim().slice(0, 3500);
      if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
      const token = telegramToken();
      if (!token)
        return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 409 });

      const conditions = [
        sql`${profiles.telegramChatId} is not null`,
        eq(profiles.blocked, false),
      ];
      if (body.audience === "active")
        conditions.push(sql`${profiles.lastSeenAt} > now() - interval '7 days'`);
      if (body.audience === "admins") conditions.push(eq(profiles.role, "admin"));

      const recipients = await db
        .select({ id: profiles.id, chat: profiles.telegramChatId })
        .from(profiles)
        .where(and(...conditions))
        .limit(2_000);

      let sent = 0;
      let failed = 0;
      for (let i = 0; i < recipients.length; i += 20) {
        const batch = recipients.slice(i, i + 20);
        const result = await Promise.all(
          batch.map((p) =>
            sendMessage(token, p.chat!, {
              text: `*СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА*\n\n${text}`,
              keyboard: [[{ text: "Открыть меню", callback_data: "nav:menu" }]],
            }),
          ),
        );
        sent += result.filter(Boolean).length;
        failed += result.filter((x) => !x).length;
        if (i + 20 < recipients.length)
          await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      await logEvent("info", "broadcast", `рассылка: ${sent} доставлено, ${failed} ошибок`, {
        audience: body.audience ?? "all",
      });
      return NextResponse.json({ ok: true, total: recipients.length, sent, failed });
    }

    case "test_message": {
      const token = telegramToken();
      const chat = process.env.ADMIN_CHAT_ID;
      if (!token || !chat)
        return NextResponse.json({ error: "token or ADMIN_CHAT_ID missing" }, { status: 409 });
      const ok = await sendMessage(token, chat, {
        text: `*ТЕСТ АДМИН-КАНАЛА*\n\nБот на связи. Время: ${new Date().toLocaleString("ru-RU")}`,
      });
      return NextResponse.json({ ok });
    }

    case "purge_history": {
      const days = Math.max(1, Math.min(3650, Math.round(body.days ?? 90)));
      const removed = await db
        .delete(priceHistory)
        .where(sql`${priceHistory.createdAt} < now() - (${days} || ' days')::interval`)
        .returning({ id: priceHistory.id });
      await logEvent("warn", "admin", `удалено ${removed.length} записей истории старше ${days} дней`);
      return NextResponse.json({ ok: true, removed: removed.length });
    }

    case "clear_errors": {
      const bad = await db
        .select({ id: events.id })
        .from(events)
        .where(inArray(events.level, ["error", "warn"]));
      if (bad.length)
        await db.delete(events).where(inArray(events.id, bad.map((b) => b.id)));
      await logEvent("info", "admin", `очищено событий ошибок: ${bad.length}`);
      return NextResponse.json({ ok: true, cleared: bad.length });
    }

    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
