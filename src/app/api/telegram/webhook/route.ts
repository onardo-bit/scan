import { NextRequest, NextResponse } from "next/server";
import { handleUpdate, type BotUpdate } from "@/lib/telegram/bot";
import { logEvent } from "@/lib/market/ensure";

export const dynamic = "force-dynamic";

/**
 * Real Telegram webhook endpoint.
 * Set it with:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/telegram/webhook&secret_token=<SECRET>"
 * Optional env: TELEGRAM_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) return NextResponse.json({ ok: false }, { status: 403 });
  }

  let update: BotUpdate;
  try {
    update = (await req.json()) as BotUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await handleUpdate(update, { send: true });
  } catch (e) {
    await logEvent("error", "webhook", `update failed: ${(e as Error).message}`, {
      updateId: update.update_id,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    service: "telegram-webhook",
    tokenConfigured: Boolean(
      process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.length > 10,
    ),
    secretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
  });
}
