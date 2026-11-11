import { handleUpdate, type BotUpdate } from "./bot";
import { telegramToken } from "./api";
import { getSetting, setSetting } from "@/lib/market/settings";
import { logEvent } from "@/lib/market/ensure";

/**
 * Long-polling режим: бот работает без публичного URL и домена.
 * Достаточно любой включённой машины (домашний ПК, Raspberry Pi,
 * бесплатный VPS) с исходящим доступом в интернет.
 *
 * Включается переменной TELEGRAM_POLLING=true.
 * Смещение (offset) хранится в БД — после перезапуска сообщения
 * не теряются и не обрабатываются повторно.
 */

interface GetUpdatesResponse {
  ok: boolean;
  description?: string;
  result?: Array<BotUpdate & { update_id: number }>;
}

export async function startPolling(): Promise<void> {
  const g = globalThis as typeof globalThis & { __tgPolling?: boolean };
  if (g.__tgPolling) return;
  g.__tgPolling = true;

  const token = telegramToken();
  if (!token) {
    console.warn("[polling] TELEGRAM_BOT_TOKEN не задан — long polling отключён");
    return;
  }

  const api = `https://api.telegram.org/bot${token}`;
  let backoffMs = 2_000;
  await logEvent("info", "polling", "long polling запущен");

  // Разово сбрасываем вебхук, если он был установлен ранее,
  // иначе getUpdates будет возвращать конфликт.
  await fetch(`${api}/deleteWebhook?drop_pending_updates=false`, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);

  for (;;) {
    try {
      const saved = await getSetting<number>("tg_offset");
      const offset = typeof saved === "number" ? saved : 0;

      const res = await fetch(
        `${api}/getUpdates?offset=${offset}&timeout=25&allowed_updates=["message","callback_query"]`,
        { signal: AbortSignal.timeout(32_000), cache: "no-store" },
      );
      const data = (await res.json()) as GetUpdatesResponse;

      if (!data.ok) {
        // 409 = где-то активен другой poller/вебхук
        throw new Error(data.description ?? `getUpdates HTTP ${res.status}`);
      }
      backoffMs = 2_000;

      for (const update of data.result ?? []) {
        try {
          await handleUpdate(update, { send: true });
        } catch (e) {
          await logEvent("error", "polling", `update ${update.update_id}: ${(e as Error).message}`);
        }
        await setSetting("tg_offset", update.update_id + 1);
      }
    } catch (e) {
      const msg = (e as Error).message;
      await logEvent("warn", "polling", `цикл polling: ${msg}`);
      console.warn(`[polling] ${msg} · повтор через ${backoffMs / 1000}с`);
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }
}
