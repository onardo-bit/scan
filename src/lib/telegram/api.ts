/**
 * Minimal typed client for the Telegram Bot API (plain HTTPS, no SDK).
 * Every call degrades gracefully so the console keeps working without a token.
 */

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export type InlineKeyboard = InlineButton[][];

export interface TgMessage {
  text: string;
  keyboard?: InlineKeyboard;
}

export function telegramToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && t.length > 10 ? t : null;
}

async function tgCall(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    return { ok: Boolean(data.ok) && res.ok, description: data.description };
  } catch (e) {
    return { ok: false, description: (e as Error).message };
  }
}

export async function sendMessage(
  token: string,
  chatId: string | number,
  msg: TgMessage,
): Promise<boolean> {
  const r = await tgCall(token, "sendMessage", {
    chat_id: chatId,
    text: msg.text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    ...(msg.keyboard ? { reply_markup: { inline_keyboard: msg.keyboard } } : {}),
  });
  if (!r.ok) console.warn("[telegram] sendMessage failed:", r.description);
  return r.ok;
}

export async function editMessage(
  token: string,
  chatId: string | number,
  messageId: number,
  msg: TgMessage,
): Promise<boolean> {
  const r = await tgCall(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: msg.text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    ...(msg.keyboard ? { reply_markup: { inline_keyboard: msg.keyboard } } : {}),
  });
  // "message is not modified" is a benign no-op
  if (!r.ok && !/not modified/i.test(r.description ?? "")) {
    console.warn("[telegram] editMessage failed:", r.description);
  }
  return r.ok;
}

export async function answerCallback(token: string, id: string, text?: string): Promise<void> {
  await tgCall(token, "answerCallbackQuery", { callback_query_id: id, text });
}

/* ------------------------------------------------------------------ */
/*  Платежи Telegram Stars                                             */
/* ------------------------------------------------------------------ */

/**
 * Счёт в звёздах. Для XTR provider_token должен быть пустым,
 * а массив prices содержать ровно один элемент с ценой в целых звёздах.
 */
export async function sendStarsInvoice(
  token: string,
  chatId: string | number,
  invoice: { title: string; description: string; payload: string; stars: number },
): Promise<boolean> {
  const r = await tgCall(token, "sendInvoice", {
    chat_id: chatId,
    title: invoice.title,
    description: invoice.description,
    payload: invoice.payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: invoice.title, amount: invoice.stars }],
  });
  if (!r.ok) console.warn("[telegram] sendInvoice failed:", r.description);
  return r.ok;
}

/** Ответить на pre_checkout_query обязательно в течение 10 секунд. */
export async function answerPreCheckout(
  token: string,
  id: string,
  ok: boolean,
  errorMessage?: string,
): Promise<void> {
  await tgCall(token, "answerPreCheckoutQuery", {
    pre_checkout_query_id: id,
    ok,
    ...(ok ? {} : { error_message: errorMessage ?? "Заказ недоступен." }),
  });
}
