import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites, gifts } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";
import { checkLimit } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const rows = await db
    .select({ gift: gifts, favId: favorites.id })
    .from(favorites)
    .innerJoin(gifts, eq(favorites.giftId, gifts.id))
    .where(eq(favorites.profileId, profileId))
    .orderBy(asc(gifts.floorTon));

  return NextResponse.json({ items: rows.map((r) => r.gift) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    profileId?: string;
    giftId?: number;
  };
  if (!body.profileId || !body.giftId)
    return NextResponse.json({ error: "profileId and giftId required" }, { status: 400 });

  const existing = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(
      and(eq(favorites.profileId, body.profileId), eq(favorites.giftId, Number(body.giftId))),
    )
    .limit(1);

  if (existing.length) {
    await db.delete(favorites).where(eq(favorites.id, existing[0].id));
    return NextResponse.json({ favored: false });
  }
  const limit = await checkLimit(body.profileId, "favorites");
  if (!limit.allowed)
    return NextResponse.json(
      { error: limit.message, limit: limit.limit, used: limit.used, upgrade: true },
      { status: 402 },
    );
  await db
    .insert(favorites)
    .values({ profileId: body.profileId, giftId: Number(body.giftId) })
    .onConflictDoNothing();
  return NextResponse.json({ favored: true });
}
