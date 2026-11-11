import { NextRequest, NextResponse } from "next/server";
import { desc, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { gifts, priceHistory } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";

export const dynamic = "force-dynamic";
const PAGE = 20;

export async function GET(req: NextRequest) {
  await ensureSeed();
  const sp = req.nextUrl.searchParams;
  const giftId = Number(sp.get("giftId") ?? "0") || undefined;
  const page = Math.max(0, Number(sp.get("page") ?? "0") || 0);

  const where = giftId ? eq(priceHistory.giftId, giftId) : undefined;
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(priceHistory)
    .where(where);

  const rows = await db
    .select({ h: priceHistory, name: gifts.name, slug: gifts.slug, hue: gifts.hue })
    .from(priceHistory)
    .innerJoin(gifts, eq(priceHistory.giftId, gifts.id))
    .where(where)
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(PAGE)
    .offset(page * PAGE);

  return NextResponse.json({
    total: Number(total),
    pages: Math.max(1, Math.ceil(Number(total) / PAGE)),
    items: rows.map((r) => ({
      id: r.h.id,
      giftId: r.h.giftId,
      giftName: r.name,
      giftSlug: r.slug,
      hue: r.hue,
      oldPrice: Number(r.h.oldPrice),
      newPrice: Number(r.h.newPrice),
      delta: Number(r.h.delta),
      pct: Number(r.h.pct),
      source: r.h.source,
      createdAt: r.h.createdAt,
    })),
  });
}
