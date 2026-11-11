import { NextRequest, NextResponse } from "next/server";
import { handleUpdate, type BotUpdate } from "@/lib/telegram/bot";
import { ensureSeed } from "@/lib/market/ensure";

export const dynamic = "force-dynamic";

/**
 * Bot simulator feed — runs the exact same bot brain as the real webhook,
 * but returns rendered messages instead of sending them to Telegram.
 */
export async function POST(req: NextRequest) {
  await ensureSeed();
  const body = (await req.json().catch(() => ({}))) as {
    chatId?: string;
    update?: BotUpdate;
  };
  const chatId = body.chatId || "sim-0000";
  if (!body.update) return NextResponse.json({ outputs: [] });

  // Deterministic numeric chat id per simulator profile.
  let h = 777000;
  for (let i = 0; i < chatId.length; i++) h = (h * 31 + chatId.charCodeAt(i)) % 9_000_000_000;

  // Re-point the update at the simulated chat.
  const update = structuredClone(body.update);
  if (update.message) update.message.chat.id = h;
  if (update.callback_query?.message) update.callback_query.message.chat.id = h;

  const outputs = await handleUpdate(update, { send: false });
  return NextResponse.json({ outputs });
}
