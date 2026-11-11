import { asc, desc, ilike, eq, sql, and, count, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  gifts,
  profiles,
  favorites,
  watches,
  priceHistory,
  priceTargets,
  portfolio,
  events,
  type Gift,
  type Profile,
} from "@/db/schema";
import { ensureSeed, logEvent } from "@/lib/market/ensure";
import { getMonitorState, getSetting, setSetting } from "@/lib/market/settings";
import { runMonitorTick } from "@/lib/market/monitor";
import {
  mainMenu,
  catalogMessage,
  giftMessage,
  searchPromptMessage,
  searchResultsMessage,
  monitorMessage,
  favoritesMessage,
  historyMessage,
  settingsMessage,
  helpMessage,
  adminMessage,
  sparkline,
  SORT_LABELS,
  portfolioMessage,
  targetsMessage,
  targetDirectionPrompt,
  targetPricePrompt,
  portfolioQtyPrompt,
  premiumMessage,
  limitReachedMessage,
  paymentSuccessMessage,
  type PortfolioLine,
  type TargetLine,
} from "./render";
import {
  OFFERS,
  PREMIUM_FEATURES,
  offerByCode,
  resolvePlan,
  extendUntil,
} from "@/lib/billing/plans";
import { checkLimit } from "@/lib/billing/limits";
import {
  sendMessage,
  editMessage,
  answerCallback,
  sendStarsInvoice,
  answerPreCheckout,
  telegramToken,
  type TgMessage,
} from "./api";
import { payments } from "@/db/schema";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

export interface BotUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type?: string };
    text?: string;
    successful_payment?: SuccessfulPayment;
  };
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
}

export interface BotOutput {
  mode: "send" | "edit";
  chatId: string;
  messageId?: number;
  msg: TgMessage;
}

const PAGE_SIZE = 8;
const HIST_SIZE = 8;

/* ------------------------------------------------------------------ */
/*  Profile helpers                                                    */
/* ------------------------------------------------------------------ */

export async function getOrCreateProfile(chatId: string, label?: string): Promise<Profile> {
  const found = await db
    .select()
    .from(profiles)
    .where(eq(profiles.telegramChatId, chatId))
    .limit(1);
  if (found.length) {
    const owner =
      process.env.ADMIN_CHAT_ID !== undefined && process.env.ADMIN_CHAT_ID === chatId;
    const role = owner ? "admin" : found[0].role;
    await db
      .update(profiles)
      .set({ lastSeenAt: new Date(), role })
      .where(eq(profiles.id, found[0].id));
    return { ...found[0], lastSeenAt: new Date(), role };
  }

  const isAdmin =
    process.env.ADMIN_CHAT_ID !== undefined && process.env.ADMIN_CHAT_ID === chatId;
  const id = crypto.randomUUID();
  await db.insert(profiles).values({
    id,
    telegramChatId: chatId,
    label: label || `Гость ${chatId.slice(-4)}`,
    role: isAdmin ? "admin" : "user",
  });
  await logEvent("info", "bot", `new user: ${label ?? chatId}`);
  const created = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return created[0];
}

/* ------------------------------------------------------------------ */
/*  FSM (tiny finite-state layer for search input)                     */
/* ------------------------------------------------------------------ */

interface FsmState {
  flow?: string;
  gift?: number;
  dir?: "below" | "above";
}

async function getState(chatId: string): Promise<FsmState | null> {
  return getSetting<FsmState>(`fsm:${chatId}`);
}
async function setState(chatId: string, value: FsmState | null) {
  if (value === null) {
    await setSetting(`fsm:${chatId}`, {});
  } else {
    await setSetting(`fsm:${chatId}`, value);
  }
}

/* ------------------------------------------------------------------ */
/*  Data queries                                                       */
/* ------------------------------------------------------------------ */

function sortClause(sort: string) {
  switch (sort) {
    case "price_desc":
      return desc(gifts.floorTon);
    case "offers_desc":
      return desc(gifts.offersCount);
    case "name":
      return asc(gifts.name);
    case "price_asc":
    default:
      return asc(gifts.floorTon);
  }
}

async function catalogPage(page: number, sort: string) {
  const [{ value: total }] = await db.select({ value: count() }).from(gifts);
  const totalPages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));
  const clamped = Math.min(Math.max(page, 0), totalPages - 1);
  const items = await db
    .select()
    .from(gifts)
    .orderBy(sortClause(sort), asc(gifts.id))
    .limit(PAGE_SIZE)
    .offset(clamped * PAGE_SIZE);
  return { items, page: clamped, totalPages, total: Number(total) };
}

async function searchGifts(q: string) {
  const like = `%${q.replace(/[%_]/g, "")}%`;
  return db
    .select()
    .from(gifts)
    .where(ilike(gifts.name, like))
    .orderBy(asc(gifts.floorTon))
    .limit(10);
}

async function getGift(id: number): Promise<Gift | null> {
  const rows = await db.select().from(gifts).where(eq(gifts.id, id)).limit(1);
  return rows[0] ?? null;
}

async function isFav(profileId: string, giftId: number) {
  const rows = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.profileId, profileId), eq(favorites.giftId, giftId)))
    .limit(1);
  return rows.length > 0;
}

async function isWatched(profileId: string, giftId: number) {
  const rows = await db
    .select({ id: watches.id })
    .from(watches)
    .where(and(eq(watches.profileId, profileId), eq(watches.giftId, giftId)))
    .limit(1);
  return rows.length > 0;
}

async function giftSpark(giftId: number): Promise<string> {
  const rows = await db
    .select({ p: priceHistory.newPrice })
    .from(priceHistory)
    .where(eq(priceHistory.giftId, giftId))
    .orderBy(desc(priceHistory.createdAt))
    .limit(16);
  return sparkline(rows.map((r) => Number(r.p)).reverse());
}

async function favoriteGifts(profileId: string): Promise<Gift[]> {
  const rows = await db
    .select({ gift: gifts })
    .from(favorites)
    .innerJoin(gifts, eq(favorites.giftId, gifts.id))
    .where(eq(favorites.profileId, profileId))
    .orderBy(asc(gifts.floorTon));
  return rows.map((r) => r.gift);
}

async function watchedGifts(profileId: string): Promise<Gift[]> {
  const rows = await db
    .select({ gift: gifts })
    .from(watches)
    .innerJoin(gifts, eq(watches.giftId, gifts.id))
    .where(eq(watches.profileId, profileId))
    .orderBy(asc(gifts.floorTon));
  return rows.map((r) => r.gift);
}

async function historyPage(page: number, giftId?: number) {
  const whereClause = giftId ? eq(priceHistory.giftId, giftId) : undefined;
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(priceHistory)
    .where(whereClause);
  const totalPages = Math.max(1, Math.ceil(Number(total) / HIST_SIZE));
  const clamped = Math.min(Math.max(page, 0), totalPages - 1);
  const rows = await db
    .select({ h: priceHistory, name: gifts.name })
    .from(priceHistory)
    .innerJoin(gifts, eq(priceHistory.giftId, gifts.id))
    .where(whereClause)
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(HIST_SIZE)
    .offset(clamped * HIST_SIZE);
  return {
    rows: rows.map((r) => ({ ...r.h, giftName: r.name })),
    page: clamped,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  Main update handler                                                */
/* ------------------------------------------------------------------ */

export async function handleUpdate(
  update: BotUpdate,
  opts: { send?: boolean } = {},
): Promise<BotOutput[]> {
  await ensureSeed();
  const outputs: BotOutput[] = [];
  const token = telegramToken();
  const live = Boolean(opts.send && token);

  const push = (o: BotOutput) => {
    outputs.push(o);
    if (live && token) {
      if (o.mode === "edit" && o.messageId) void editMessage(token, o.chatId, o.messageId, o.msg);
      else void sendMessage(token, o.chatId, o.msg);
    }
  };

  /* ---- pre_checkout_query: подтвердить заказ за 10 секунд ---- */
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const offer = offerByCode(String(q.invoice_payload).split(":")[1] ?? "");
    const valid =
      Boolean(offer) && q.currency === "XTR" && q.total_amount === offer!.stars;
    if (live && token) await answerPreCheckout(token, q.id, valid, "Тариф больше недоступен.");
    if (!valid) await logEvent("warn", "billing", `отклонён pre_checkout: ${q.invoice_payload}`);
    return outputs;
  }

  /* ---- successful_payment: выдать подписку (идемпотентно) ---- */
  if (update.message?.successful_payment) {
    const chatId = String(update.message.chat.id);
    const pay = update.message.successful_payment;
    const profile = await getOrCreateProfile(chatId, update.message.from?.first_name);
    const offer = offerByCode(String(pay.invoice_payload).split(":")[1] ?? "");

    if (!offer || pay.currency !== "XTR" || pay.total_amount !== offer.stars) {
      await logEvent("error", "billing", `несоответствие платежа: ${pay.invoice_payload}`, {
        chargeId: pay.telegram_payment_charge_id,
      });
      return outputs;
    }

    // Уникальный charge_id защищает от повторной выдачи при ретраях Telegram.
    const inserted = await db
      .insert(payments)
      .values({
        profileId: profile.id,
        telegramChargeId: pay.telegram_payment_charge_id,
        payload: pay.invoice_payload,
        offerCode: offer.code,
        months: offer.months,
        stars: pay.total_amount,
        currency: pay.currency,
      })
      .onConflictDoNothing({ target: payments.telegramChargeId })
      .returning({ id: payments.id });

    if (!inserted.length) return outputs;

    const until = extendUntil(profile.planUntil, offer.months);
    await db
      .update(profiles)
      .set({ plan: "premium", planUntil: until })
      .where(eq(profiles.id, profile.id));
    await logEvent("info", "billing", `оплачен ${offer.code}: ${offer.stars} ⭐`, {
      profileId: profile.id,
    });

    push({ mode: "send", chatId, msg: paymentSuccessMessage(offer.months, until) });
    return outputs;
  }

  /* ---- text messages ---- */
  if (update.message?.text) {
    const chatId = String(update.message.chat.id);
    const profile = await getOrCreateProfile(
      chatId,
      update.message.from?.first_name ?? update.message.from?.username,
    );
    const text = update.message.text.trim();
    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
    const arg = text.slice(cmd.length).trim();

    if (cmd === "/start" || cmd === "/menu") {
      await setState(chatId, null);
      push({ mode: "send", chatId, msg: await menuView() });
      return outputs;
    }
    if (cmd === "/catalog" || cmd === "/floors") {
      push({ mode: "send", chatId, msg: await catalogView(0, "price_asc") });
      return outputs;
    }
    if (cmd === "/search") {
      if (arg) {
        push({ mode: "send", chatId, msg: searchResultsMessage(arg, await searchGifts(arg)) });
      } else {
        await setState(chatId, { flow: "search" });
        push({ mode: "send", chatId, msg: searchPromptMessage() });
      }
      return outputs;
    }
    if (cmd === "/monitor") {
      push({ mode: "send", chatId, msg: await monitorView(profile) });
      return outputs;
    }
    if (cmd === "/favorites") {
      push({ mode: "send", chatId, msg: favoritesMessage(await favoriteGifts(profile.id)) });
      return outputs;
    }
    if (cmd === "/history") {
      const h = await historyPage(0);
      push({
        mode: "send",
        chatId,
        msg: historyMessage({ rows: h.rows, page: h.page, totalPages: h.totalPages }),
      });
      return outputs;
    }
    if (cmd === "/premium" || cmd === "/buy") {
      push({ mode: "send", chatId, msg: await premiumView(profile) });
      return outputs;
    }
    if (cmd === "/portfolio") {
      push({ mode: "send", chatId, msg: await portfolioView(profile) });
      return outputs;
    }
    if (cmd === "/targets") {
      push({ mode: "send", chatId, msg: await targetsView(profile) });
      return outputs;
    }
    if (cmd === "/settings") {
      push({ mode: "send", chatId, msg: settingsMessage(profile) });
      return outputs;
    }
    if (cmd === "/help") {
      push({ mode: "send", chatId, msg: helpMessage() });
      return outputs;
    }
    if (cmd === "/admin") {
      push({ mode: "send", chatId, msg: await adminView(profile) });
      return outputs;
    }

    // FSM-вводы: ценовая цель / количество для портфеля
    const state = await getState(chatId);

    if (state?.flow === "admin_broadcast" && profile.role === "admin") {
      const broadcastText = text.slice(0, 3500);
      const tgToken = telegramToken();
      if (!tgToken) {
        await setState(chatId, null);
        push({
          mode: "send",
          chatId,
          msg: { text: "TELEGRAM_BOT_TOKEN не настроен — рассылка невозможна." },
        });
        return outputs;
      }
      const recipients = await db
        .select({ chat: profiles.telegramChatId })
        .from(profiles)
        .where(
          and(
            sql`${profiles.telegramChatId} is not null`,
            eq(profiles.blocked, false),
          ),
        )
        .limit(2_000);
      let sent = 0;
      let failed = 0;
      for (let i = 0; i < recipients.length; i += 20) {
        const result = await Promise.all(
          recipients.slice(i, i + 20).map((p) =>
            sendMessage(tgToken, p.chat!, {
              text: `*СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА*\n\n${broadcastText}`,
              keyboard: [[{ text: "Открыть меню", callback_data: "nav:menu" }]],
            }),
          ),
        );
        sent += result.filter(Boolean).length;
        failed += result.filter((x) => !x).length;
        if (i + 20 < recipients.length)
          await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      await setState(chatId, null);
      await logEvent("info", "broadcast", `рассылка из Telegram: ${sent} / ${recipients.length}`);
      push({
        mode: "send",
        chatId,
        msg: {
          text: `Рассылка завершена.\nДоставлено: *${sent}*\nОшибок: *${failed}*`,
          keyboard: [[{ text: "← Админ-панель", callback_data: "nav:admin" }]],
        },
      });
      return outputs;
    }

    if (state?.flow === "target") {
      const val = Number(text.replace(",", ".").replace(/[^\d.]/g, ""));
      const g = await getGift(Number(state.gift));
      if (!g || !Number.isFinite(val) || val <= 0 || val > 1_000_000) {
        push({
          mode: "send",
          chatId,
          msg: {
            text: "Нужна цена в TON, например `18.5`. Попробуйте ещё раз.",
            keyboard: [[{ text: "Отмена", callback_data: "nav:menu" }]],
          },
        });
        return outputs;
      }
      await db.insert(priceTargets).values({
        profileId: profile.id,
        giftId: g.id,
        direction: state.dir ?? "below",
        targetTon: val,
      });
      await setState(chatId, null);
      await logEvent("info", "bot", `target created: ${g.name} ${state.dir} ${val}`);
      push({
        mode: "send",
        chatId,
        msg: {
          text: `◎ Цель установлена: *${g.name}* — ${state.dir === "above" ? "выше" : "ниже"} *${val} TON*.\nАлерт придёт один раз при пересечении.`,
          keyboard: [
            [{ text: "Мои цели", callback_data: "nav:targets" }],
            [{ text: `Открыть ${g.name}`, callback_data: `gift:${g.id}` }],
          ],
        },
      });
      return outputs;
    }

    if (state?.flow === "portfolio") {
      const qty = Math.round(Number(text.replace(/[^\d]/g, "")));
      const g = await getGift(Number(state.gift));
      if (!g || !Number.isFinite(qty) || qty < 1 || qty > 10_000) {
        push({
          mode: "send",
          chatId,
          msg: {
            text: "Нужно целое число штук, например `3`. Попробуйте ещё раз.",
            keyboard: [[{ text: "Отмена", callback_data: "nav:menu" }]],
          },
        });
        return outputs;
      }
      await addToPortfolio(profile.id, g.id, qty, Number(g.floorTon));
      await setState(chatId, null);
      push({
        mode: "send",
        chatId,
        msg: {
          text: `◆ В портфеле: *${g.name}* ×${qty} по ${Number(g.floorTon).toFixed(2)} TON.\nОценка и P&L обновляются вместе с рынком.`,
          keyboard: [
            [{ text: "Мой портфель", callback_data: "nav:portfolio" }],
            [{ text: `Открыть ${g.name}`, callback_data: `gift:${g.id}` }],
          ],
        },
      });
      return outputs;
    }

    // Free text → search flow (or implicit search)
    if (state?.flow === "search" || text.length >= 2) {
      if (state?.flow === "search") await setState(chatId, null);
      push({ mode: "send", chatId, msg: searchResultsMessage(text, await searchGifts(text)) });
      return outputs;
    }
    push({
      mode: "send",
      chatId,
      msg: { text: "Неизвестная команда. Отправьте /menu для главного меню." },
    });
    return outputs;
  }

  /* ---- callback queries ---- */
  if (update.callback_query?.data) {
    const cb = update.callback_query;
    const cbData = cb.data;
    if (!cbData) return outputs;
    const chatId = String(cb.message?.chat.id ?? cb.from.id);
    const messageId = cb.message?.message_id;
    const profile = await getOrCreateProfile(chatId, cb.from.first_name ?? cb.from.username);
    if (live && token) void answerCallback(token, cb.id);
    if (profile.blocked) {
      push({
        mode: messageId ? "edit" : "send",
        chatId,
        messageId,
        msg: { text: "Доступ ограничен администратором." },
      });
      return outputs;
    }

    const [verb, a1, a2] = cbData.split(":");
    const edit = (msg: TgMessage) =>
      push({ mode: messageId ? "edit" : "send", chatId, messageId, msg });

    switch (verb) {
      case "nav": {
        await setState(chatId, null);
        switch (a1) {
          case "menu":
            edit(await menuView());
            break;
          case "cat":
            edit(await catalogView(0, "price_asc"));
            break;
          case "search":
            await setState(chatId, { flow: "search" });
            edit(searchPromptMessage());
            break;
          case "monitor":
            edit(await monitorView(profile));
            break;
          case "favs":
            edit(favoritesMessage(await favoriteGifts(profile.id)));
            break;
          case "hist": {
            const h = await historyPage(0);
            edit(historyMessage({ rows: h.rows, page: h.page, totalPages: h.totalPages }));
            break;
          }
          case "premium":
            edit(await premiumView(profile));
            break;
          case "portfolio":
            edit(await portfolioView(profile));
            break;
          case "targets":
            edit(await targetsView(profile));
            break;
          case "settings":
            edit(settingsMessage(profile));
            break;
          case "help":
            edit(helpMessage());
            break;
          case "admin":
            edit(await adminView(profile));
            break;
          default:
            edit(await menuView());
        }
        break;
      }
      case "cat": {
        const page = Number(a1) || 0;
        const sort = a2 && SORT_LABELS[a2] ? a2 : "price_asc";
        edit(await catalogView(page, sort));
        break;
      }
      case "gift": {
        const g = await getGift(Number(a1));
        if (!g) {
          edit({ text: "Подарок не найден.", keyboard: [[{ text: "← Меню", callback_data: "nav:menu" }]] });
          break;
        }
        edit(
          giftMessage(g, {
            isFav: await isFav(profile.id, g.id),
            isWatch: await isWatched(profile.id, g.id),
            spark: await giftSpark(g.id),
          }),
        );
        break;
      }
      case "fav": {
        const giftId = Number(a1);
        if (await isFav(profile.id, giftId)) {
          await db
            .delete(favorites)
            .where(and(eq(favorites.profileId, profile.id), eq(favorites.giftId, giftId)));
        } else {
          const limit = await checkLimit(profile.id, "favorites");
          if (!limit.allowed) {
            edit(limitReachedMessage(limit.message!));
            break;
          }
          await db.insert(favorites).values({ profileId: profile.id, giftId }).onConflictDoNothing();
        }
        const g = await getGift(giftId);
        if (g)
          edit(
            giftMessage(g, {
              isFav: await isFav(profile.id, giftId),
              isWatch: await isWatched(profile.id, giftId),
              spark: await giftSpark(giftId),
            }),
          );
        break;
      }
      case "watch": {
        const giftId = Number(a1);
        if (await isWatched(profile.id, giftId)) {
          await db
            .delete(watches)
            .where(and(eq(watches.profileId, profile.id), eq(watches.giftId, giftId)));
        } else {
          const limit = await checkLimit(profile.id, "watches");
          if (!limit.allowed) {
            edit(limitReachedMessage(limit.message!));
            break;
          }
          await db.insert(watches).values({ profileId: profile.id, giftId }).onConflictDoNothing();
        }
        const g = await getGift(giftId);
        if (g)
          edit(
            giftMessage(g, {
              isFav: await isFav(profile.id, giftId),
              isWatch: await isWatched(profile.id, giftId),
              spark: await giftSpark(giftId),
            }),
          );
        break;
      }
      case "buy": {
        const offer = offerByCode(a1 ?? "");
        if (!offer) break;
        if (!token || !live) {
          edit({
            text: [
              "*ОПЛАТА НЕДОСТУПНА В СИМУЛЯТОРЕ*",
              "──────────────────",
              `Тариф: ${offer.title} — ${offer.stars} ⭐`,
              "",
              "В реальном боте здесь открывается счёт Telegram Stars:",
              "оплата в один тап, подписка активируется автоматически.",
            ].join("\n"),
            keyboard: [[{ text: "← Premium", callback_data: "nav:premium" }]],
          });
          break;
        }
        await sendStarsInvoice(token, chatId, {
          title: offer.title,
          description: "Безлимитный трекинг, цели, портфель и экспорт в GiftScope.",
          payload: `premium:${offer.code}:${profile.id}`,
          stars: offer.stars,
        });
        break;
      }
      case "tgt": {
        const g = await getGift(Number(a1));
        if (!g) break;
        const limit = await checkLimit(profile.id, "targets");
        if (!limit.allowed) {
          edit(limitReachedMessage(limit.message!));
          break;
        }
        edit(targetDirectionPrompt(g.name, g.id, Number(g.floorTon)));
        break;
      }
      case "tgtd": {
        const g = await getGift(Number(a1));
        if (!g) break;
        const dir = a2 === "above" ? "above" : "below";
        await setState(chatId, { flow: "target", gift: g.id, dir });
        edit(targetPricePrompt(g.name, dir));
        break;
      }
      case "tg_del": {
        await db
          .delete(priceTargets)
          .where(and(eq(priceTargets.id, Number(a1)), eq(priceTargets.profileId, profile.id)));
        edit(await targetsView(profile));
        break;
      }
      case "ptf": {
        const g = await getGift(Number(a1));
        if (!g) break;
        const inPortfolio = await db
          .select({ id: portfolio.id })
          .from(portfolio)
          .where(and(eq(portfolio.profileId, profile.id), eq(portfolio.giftId, g.id)))
          .limit(1);
        if (!inPortfolio.length) {
          const limit = await checkLimit(profile.id, "portfolio");
          if (!limit.allowed) {
            edit(limitReachedMessage(limit.message!));
            break;
          }
        }
        await setState(chatId, { flow: "portfolio", gift: g.id });
        edit(portfolioQtyPrompt(g.name, Number(g.floorTon)));
        break;
      }
      case "ptf_del": {
        await db
          .delete(portfolio)
          .where(and(eq(portfolio.profileId, profile.id), eq(portfolio.giftId, Number(a1))));
        edit(await portfolioView(profile));
        break;
      }
      case "hist": {
        const h = await historyPage(Number(a1) || 0);
        edit(historyMessage({ rows: h.rows, page: h.page, totalPages: h.totalPages }));
        break;
      }
      case "hsg": {
        const gid = Number(a1);
        const g = await getGift(gid);
        const h = await historyPage(Number(a2) || 0, gid);
        edit(
          historyMessage({
            rows: h.rows,
            page: h.page,
            totalPages: h.totalPages,
            giftName: g?.name,
            giftId: gid,
          }),
        );
        break;
      }
      case "set": {
        if (a1 === "notif") {
          await db
            .update(profiles)
            .set({ notificationsEnabled: !profile.notificationsEnabled })
            .where(eq(profiles.id, profile.id));
        } else if (a1 === "digest") {
          await db
            .update(profiles)
            .set({ digestEnabled: !profile.digestEnabled })
            .where(eq(profiles.id, profile.id));
        } else if (a1 === "th") {
          await db
            .update(profiles)
            .set({ thresholdPct: Number(a2) || 1 })
            .where(eq(profiles.id, profile.id));
        }
        const fresh = (await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, profile.id))
          .limit(1))[0];
        edit(settingsMessage(fresh));
        break;
      }
      case "adm": {
        if (profile.role !== "admin") {
          edit({ text: "Только для владельца бота.", keyboard: [[{ text: "← Меню", callback_data: "nav:menu" }]] });
          break;
        }
        if (a1 === "int") {
          const sec = Math.max(60, Math.min(3600, Number(a2) || 120));
          const m = await getMonitorState();
          await setSetting("monitor", { ...m, intervalSec: sec });
          await logEvent("info", "admin", `интервал сканирования: ${sec}с`);
        } else if (a1 === "tick") {
          await runMonitorTick("admin");
        } else if (a1 === "toggle") {
          const m = await getMonitorState();
          await setSetting("monitor", { ...m, enabled: !m.enabled });
          await logEvent("warn", "admin", `сканер ${!m.enabled ? "запущен" : "остановлен"}`);
        } else if (a1 === "src") {
          const source = ["auto", "tonnel", "portals", "simulator"].includes(a2)
            ? a2
            : "auto";
          await setSetting("source_preference", source);
          await logEvent("warn", "admin", `источник переключён: ${source}`);
        } else if (a1 === "broadcast") {
          await setState(chatId, { flow: "admin_broadcast" });
          edit({
            text: [
              "*МАССОВАЯ РАССЫЛКА*",
              "──────────────────",
              "Отправьте текст следующем сообщением.",
              "Он уйдёт всем незаблокированным пользователям с привязанным Telegram.",
              "Максимум 3500 символов.",
            ].join("\n"),
            keyboard: [[{ text: "Отмена", callback_data: "nav:admin" }]],
          });
          break;
        } else if (a1 === "users") {
          const users = await db
            .select()
            .from(profiles)
            .orderBy(desc(profiles.lastSeenAt))
            .limit(12);
          edit({
            text: [
              "*ПОСЛЕДНИЕ ПОЛЬЗОВАТЕЛИ*",
              "──────────────────",
              ...users.map(
                (u) =>
                  `${u.blocked ? "⛔" : u.telegramChatId ? "●" : "○"} ${u.label} · ${u.role} · ${u.telegramChatId ?? "только web"}\n  был: ${u.lastSeenAt.toLocaleString("ru-RU")}`,
              ),
            ].join("\n"),
            keyboard: [[{ text: "← Админ-панель", callback_data: "nav:admin" }]],
          });
          break;
        } else if (a1 === "test") {
          const tgToken = telegramToken();
          if (tgToken) {
            await sendMessage(tgToken, chatId, {
              text: `*ТЕСТ АДМИН-КАНАЛА*\n\nСвязь работает. ${new Date().toLocaleString("ru-RU")}`,
            });
          }
        }
        edit(await adminView(profile));
        break;
      }
      default:
        edit(await menuView());
    }
    return outputs;
  }

  return outputs;
}

/* ------------------------------------------------------------------ */
/*  Composed views                                                     */
/* ------------------------------------------------------------------ */

async function menuView(): Promise<TgMessage> {
  const [{ value: total }] = await db.select({ value: count() }).from(gifts);
  const state = await getMonitorState();
  const source = await getSetting<{ name: string }>("source");
  const lastScan = state.lastTickAt
    ? new Date(state.lastTickAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "pending";
  return mainMenu({
    collectionCount: Number(total),
    lastScan,
    sourceName: source?.name ?? "boot",
  });
}

async function catalogView(page: number, sort: string): Promise<TgMessage> {
  const p = await catalogPage(page, sort);
  return catalogMessage({ ...p, sort });
}

async function monitorView(profile: Profile): Promise<TgMessage> {
  const items = await watchedGifts(profile.id);
  return monitorMessage(items, profile.notificationsEnabled);
}

/** Виртуальный портфель: добавление со средневзвешенной ценой входа. */
async function addToPortfolio(profileId: string, giftId: number, qty: number, entryTon: number) {
  const existing = await db
    .select()
    .from(portfolio)
    .where(and(eq(portfolio.profileId, profileId), eq(portfolio.giftId, giftId)))
    .limit(1);

  if (!existing.length) {
    await db.insert(portfolio).values({ profileId, giftId, qty, entryTon });
    return;
  }
  const cur = existing[0];
  const newQty = cur.qty + qty;
  const newEntry = (cur.qty * Number(cur.entryTon) + qty * entryTon) / newQty;
  await db
    .update(portfolio)
    .set({ qty: newQty, entryTon: Math.round(newEntry * 1000) / 1000 })
    .where(eq(portfolio.id, cur.id));
}

async function premiumView(profile: Profile): Promise<TgMessage> {
  const plan = resolvePlan(profile);
  const [w, t, p, f] = await Promise.all([
    checkLimit(profile.id, "watches"),
    checkLimit(profile.id, "targets"),
    checkLimit(profile.id, "portfolio"),
    checkLimit(profile.id, "favorites"),
  ]);
  const fmtUse = (c: { used: number; limit: number }) =>
    Number.isFinite(c.limit) ? `${c.used}/${c.limit}` : `${c.used}/∞`;

  return premiumMessage({
    isPremium: plan.isPremium,
    daysLeft: plan.daysLeft,
    offers: OFFERS,
    features: PREMIUM_FEATURES,
    usage: {
      watches: fmtUse(w),
      targets: fmtUse(t),
      portfolio: fmtUse(p),
      favorites: fmtUse(f),
    },
  });
}

async function portfolioView(profile: Profile): Promise<TgMessage> {
  const rows = await db
    .select({
      giftId: portfolio.giftId,
      qty: portfolio.qty,
      entry: portfolio.entryTon,
      name: gifts.name,
      floor: gifts.floorTon,
    })
    .from(portfolio)
    .innerJoin(gifts, eq(portfolio.giftId, gifts.id))
    .where(eq(portfolio.profileId, profile.id))
    .orderBy(desc(gifts.floorTon));

  const lines: PortfolioLine[] = rows.map((r) => ({
    giftId: r.giftId,
    name: r.name,
    qty: r.qty,
    entry: Number(r.entry),
    floor: Number(r.floor),
  }));
  return portfolioMessage(lines);
}

async function targetsView(profile: Profile): Promise<TgMessage> {
  const rows = await db
    .select({
      id: priceTargets.id,
      giftId: priceTargets.giftId,
      direction: priceTargets.direction,
      targetTon: priceTargets.targetTon,
      active: priceTargets.active,
      name: gifts.name,
      floor: gifts.floorTon,
    })
    .from(priceTargets)
    .innerJoin(gifts, eq(priceTargets.giftId, gifts.id))
    .where(eq(priceTargets.profileId, profile.id))
    .orderBy(desc(priceTargets.active), desc(priceTargets.id))
    .limit(20);

  const lines: TargetLine[] = rows.map((r) => ({
    id: r.id,
    giftId: r.giftId,
    name: r.name,
    direction: r.direction as "below" | "above",
    targetTon: Number(r.targetTon),
    floor: Number(r.floor),
    active: r.active,
  }));
  return targetsMessage(lines);
}

async function adminView(profile: Profile): Promise<TgMessage> {
  if (profile.role !== "admin") {
    return { text: "Только для владельца бота.", keyboard: [[{ text: "← Меню", callback_data: "nav:menu" }]] };
  }
  const [
    [{ value: users }],
    [{ value: active24h }],
    [{ value: linked }],
    [{ value: blocked }],
    [{ value: tracked }],
    [{ value: changes24h }],
    [{ value: errorsCount }],
  ] = await Promise.all([
    db.select({ value: count() }).from(profiles),
    db
      .select({ value: count() })
      .from(profiles)
      .where(sql`${profiles.lastSeenAt} > now() - interval '24 hours'`),
    db
      .select({ value: count() })
      .from(profiles)
      .where(sql`${profiles.telegramChatId} is not null`),
    db.select({ value: count() }).from(profiles).where(eq(profiles.blocked, true)),
    db.select({ value: count() }).from(gifts),
    db
      .select({ value: count() })
      .from(priceHistory)
      .where(sql`${priceHistory.createdAt} > now() - interval '24 hours'`),
    db
      .select({ value: count() })
      .from(events)
      .where(inArray(events.level, ["error", "warn"])),
  ]);
  const state = await getMonitorState();
  const source = await getSetting<{ name: string; ok: boolean }>("source");
  const sourcePreference = (await getSetting<string>("source_preference")) ?? "auto";
  return adminMessage({
    users: Number(users),
    active24h: Number(active24h),
    linked: Number(linked),
    blocked: Number(blocked),
    trackedGifts: Number(tracked),
    changes24h: Number(changes24h),
    errors: Number(errorsCount),
    intervalMin: Math.round(state.intervalSec / 60) || 1,
    monitorEnabled: state.enabled,
    sourceName: source?.name ?? "boot",
    sourcePreference,
    sourceOk: source?.ok ?? true,
    lastTick: state.lastTickAt
      ? new Date(state.lastTickAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
      : "никогда",
  });
}
