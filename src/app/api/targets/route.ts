import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { priceTargets, gifts } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";
import { checkLimit } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const rows = await db
    .select({
      id: priceTargets.id,
      giftId: priceTargets.giftId,
      direction: priceTargets.direction,
      targetTon: priceTargets.targetTon,
      active: priceTargets.active,
      hits: priceTargets.hits,
      createdAt: priceTargets.createdAt,
      name: gifts.name,
      slug: gifts.slug,
      hue: gifts.hue,
      floorTon: gifts.floorTon,
    })
    .from(priceTargets)
    .innerJoin(gifts, eq(priceTargets.giftId, gifts.id))
    .where(eq(priceTargets.profileId, profileId))
    .orderBy(desc(priceTargets.active), desc(priceTargets.id))
    .limit(40);

  const allGifts = await db
    .select({ id: gifts.id, name: gifts.name, floorTon: gifts.floorTon })
    .from(gifts)
    .orderBy(asc(gifts.name));

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      targetTon: Number(r.targetTon),
      floorTon: Number(r.floorTon),
    })),
    allGifts: allGifts.map((g) => ({ id: g.id, name: g.name, floor: Number(g.floorTon) })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    profileId?: string;
    giftId?: number;
    direction?: string;
    targetTon?: number;
  };
  const val = Number(body.targetTon);
  if (!body.profileId || !body.giftId || !Number.isFinite(val) || val <= 0)
    return NextResponse.json({ error: "profileId, giftId and positive targetTon required" }, { status: 400 });

  const limit = await checkLimit(body.profileId, "targets");
  if (!limit.allowed)
    return NextResponse.json(
      { error: limit.message, limit: limit.limit, used: limit.used, upgrade: true },
      { status: 402 },
    );

  await db.insert(priceTargets).values({
    profileId: body.profileId,
    giftId: Number(body.giftId),
    direction: body.direction === "above" ? "above" : "below",
    targetTon: Math.min(1_000_000, val),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    profileId?: string;
    id?: number;
  };
  if (!body.profileId || !body.id)
    return NextResponse.json({ error: "profileId and id required" }, { status: 400 });

  await db
    .delete(priceTargets)
    .where(and(eq(priceTargets.id, Number(body.id)), eq(priceTargets.profileId, body.profileId)));
  return NextResponse.json({ ok: true });
}
