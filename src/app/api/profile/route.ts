import { NextRequest, NextResponse } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "@/db";
import { profiles, favorites, watches, notifications } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";
import { clampThreshold } from "@/lib/billing/limits";
import { resolvePlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const profile = (await db.select().from(profiles).where(eq(profiles.id, id)).limit(1))[0];
  if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [{ value: favCount }] = await db
    .select({ value: count() })
    .from(favorites)
    .where(eq(favorites.profileId, id));
  const [{ value: watchCount }] = await db
    .select({ value: count() })
    .from(watches)
    .where(eq(watches.profileId, id));
  const unreadRows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.profileId, id));

  return NextResponse.json({
    profile,
    plan: resolvePlan(profile),
    stats: {
      favorites: Number(favCount),
      watched: Number(watchCount),
      notifications: unreadRows.length,
    },
  });
}

export async function POST(req: NextRequest) {
  await ensureSeed();
  const body = (await req.json().catch(() => ({}))) as { id?: string; label?: string };

  if (body.id) {
    const found = await db.select().from(profiles).where(eq(profiles.id, body.id)).limit(1);
    if (found.length) return NextResponse.json({ profile: found[0] });
  }

  const id = crypto.randomUUID();
  await db.insert(profiles).values({
    id,
    label: body.label?.slice(0, 32) || `Трейдер ${id.slice(0, 4).toUpperCase()}`,
    role: "user",
  });
  const profile = (await db.select().from(profiles).where(eq(profiles.id, id)).limit(1))[0];
  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    label?: string;
    notificationsEnabled?: boolean;
    digestEnabled?: boolean;
    thresholdPct?: number;
    unlinkTelegram?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const set: Partial<typeof profiles.$inferInsert> = {};
  if (typeof body.label === "string" && body.label.trim())
    set.label = body.label.trim().slice(0, 32);
  if (typeof body.notificationsEnabled === "boolean")
    set.notificationsEnabled = body.notificationsEnabled;
  if (typeof body.thresholdPct === "number" && Number.isFinite(body.thresholdPct))
    set.thresholdPct = await clampThreshold(body.id, body.thresholdPct);
  if (body.unlinkTelegram) set.telegramChatId = null;

  await db.update(profiles).set(set).where(eq(profiles.id, body.id));
  const profile = (
    await db.select().from(profiles).where(eq(profiles.id, body.id)).limit(1)
  )[0];
  return NextResponse.json({ profile });
}
