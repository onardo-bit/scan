import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, gifts } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const rows = await db
    .select({ n: notifications, name: gifts.name, slug: gifts.slug, hue: gifts.hue })
    .from(notifications)
    .innerJoin(gifts, eq(notifications.giftId, gifts.id))
    .where(eq(notifications.profileId, profileId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(40);

  return NextResponse.json({
    unread: rows.filter((r) => !r.n.read).length,
    items: rows.map((r) => ({
      id: r.n.id,
      title: r.n.title,
      body: r.n.body,
      read: r.n.read,
      telegramSent: r.n.telegramSent,
      createdAt: r.n.createdAt,
      giftName: r.name,
      giftSlug: r.slug,
      hue: r.hue,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { profileId?: string };
  if (!body.profileId)
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.profileId, body.profileId), eq(notifications.read, false)));
  return NextResponse.json({ ok: true });
}
