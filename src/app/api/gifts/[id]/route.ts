import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gifts, priceHistory } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSeed();
  const { id } = await params;

  const gift = /^\d+$/.test(id)
    ? (await db.select().from(gifts).where(eq(gifts.id, Number(id))).limit(1))[0]
    : (await db.select().from(gifts).where(eq(gifts.slug, id)).limit(1))[0];

  if (!gift) return NextResponse.json({ error: "not found" }, { status: 404 });

  const chartRows = await db
    .select({ t: priceHistory.createdAt, p: priceHistory.newPrice })
    .from(priceHistory)
    .where(eq(priceHistory.giftId, gift.id))
    .orderBy(desc(priceHistory.createdAt))
    .limit(200);

  const history = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.giftId, gift.id))
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(25);

  const [dayAgo] = await db
    .select({ p: priceHistory.newPrice })
    .from(priceHistory)
    .where(
      sql`${priceHistory.giftId} = ${gift.id} and ${priceHistory.createdAt} <= now() - interval '24 hours'`,
    )
    .orderBy(desc(priceHistory.createdAt))
    .limit(1);

  const dayPct = dayAgo
    ? ((Number(gift.floorTon) - Number(dayAgo.p)) / Number(dayAgo.p)) * 100
    : null;

  return NextResponse.json({
    gift,
    chart: [
      { t: gift.createdAt, p: Number(gift.prevFloorTon) || Number(gift.floorTon) },
      ...chartRows.map((r) => ({ t: r.t, p: Number(r.p) })).reverse(),
    ],
    history: history.map((h) => ({
      ...h,
      oldPrice: Number(h.oldPrice),
      newPrice: Number(h.newPrice),
      delta: Number(h.delta),
      pct: Number(h.pct),
    })),
    dayPct,
  });
}
