import { NextRequest, NextResponse } from "next/server";
import { getMonitorState, getSetting, setSetting } from "@/lib/market/settings";
import { ensureSeed } from "@/lib/market/ensure";
import { runMonitorTick } from "@/lib/market/monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const monitor = await getMonitorState();
  const source = await getSetting<unknown>("source");
  return NextResponse.json({
    monitor,
    source,
    telegramLinked: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.length > 10),
  });
}

/** Manual scan trigger (rate-guarded to one tick every 20s). */
export async function POST(_req: NextRequest) {
  await ensureSeed();
  const state = await getMonitorState();
  const last = state.lastTickAt ? new Date(state.lastTickAt).getTime() : 0;
  if (Date.now() - last < 20_000 && state.lastTickSummary) {
    return NextResponse.json({ skipped: true, summary: state.lastTickSummary });
  }
  const summary = await runMonitorTick("manual");
  return NextResponse.json({ skipped: false, summary });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { intervalSec?: number };
  const state = await getMonitorState();
  if (typeof body.intervalSec === "number" && Number.isFinite(body.intervalSec)) {
    state.intervalSec = Math.max(60, Math.min(3600, Math.round(body.intervalSec)));
    await setSetting("monitor", state);
  }
  return NextResponse.json({ monitor: state });
}
