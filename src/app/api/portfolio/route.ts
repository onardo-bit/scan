import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolio, gifts } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";
import { checkLimit } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const rows = await db
    .select({
      id: portfolio.id,
      giftId: portfolio.giftId,
      qty: portfolio.qty,
      entryTon: portfolio.entryTon,
      createdAt: portfolio.createdAt,
      name: gifts.name,
      slug: gifts.slug,
      hue: gifts.hue,
      floorTon: gifts.floorTon,
      lastChangePct: gifts.lastChangePct,
    })
    .from(portfolio)
    .innerJoin(gifts, eq(portfolio.giftId, gifts.id))
    .where(eq(portfolio.profileId, profileId))
    .orderBy(desc(gifts.floorTon));

  const items = rows.map((r) => {
    const entry = Number(r.entryTon);
    const floor = Number(r.floorTon);
    const value = r.qty * floor;
    const cost = r.qty * entry;
    return {
      id: r.id,
      giftId: r.giftId,
      name: r.name,
      slug: r.slug,
      hue: r.hue,
      qty: r.qty,
      entry,
      floor,
      value,
      cost,
      pnl: value - cost,
      pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      lastChangePct: Number(r.lastChangePct),
    };
  });

  const value = items.reduce((s, i) => s + i.value, 0);
  const cost = items.reduce((s, i) => s + i.cost, 0);

  return NextResponse.json({
    items,
    totals: {
      value,
      cost,
      pnl: value - cost,
      pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    profileId?: string;
    giftId?: number;
    qty?: number;
  };
  if (!body.profileId || !body.giftId)
    return NextResponse.json({ error: "profileId and giftId required" }, { status: 400 });

  const qty = Math.max(1, Math.min(10_000, Math.round(Number(body.qty) || 1)));
  const [g] = await db.select().from(gifts).where(eq(gifts.id, Number(body.giftId))).limit(1);
  if (!g) return NextResponse.json({ error: "gift not found" }, { status: 404 });

  const existing = await db
    .select()
    .from(portfolio)
    .where(
      and(eq(portfolio.profileId, body.profileId), eq(portfolio.giftId, g.id)),
    )
    .limit(1);

  if (!existing.length) {
    const limit = await checkLimit(body.profileId, "portfolio");
    if (!limit.allowed)
      return NextResponse.json(
        { error: limit.message, limit: limit.limit, used: limit.used, upgrade: true },
        { status: 402 },
      );
  }

  if (existing.length) {
    const cur = existing[0];
    const newQty = cur.qty + qty;
    const newEntry =
      (cur.qty * Number(cur.entryTon) + qty * Number(g.floorTon)) / newQty;
    await db
      .update(portfolio)
      .set({ qty: newQty, entryTon: Math.round(newEntry * 1000) / 1000 })
      .where(eq(portfolio.id, cur.id));
    return NextResponse.json({ ok: true, qty: newQty });
  }

  await db.insert(portfolio).values({
    profileId: body.profileId,
    giftId: g.id,
    qty,
    entryTon: Number(g.floorTon),
  });
  return NextResponse.json({ ok: true, qty });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    profileId?: string;
    giftId?: number;
  };
  if (!body.profileId || !body.giftId)
    return NextResponse.json({ error: "profileId and giftId required" }, { status: 400 });

  await db
    .delete(portfolio)
    .where(
      and(eq(portfolio.profileId, body.profileId), eq(portfolio.giftId, Number(body.giftId))),
    );
  return NextResponse.json({ ok: true });
}
