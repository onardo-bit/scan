import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, payments } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";
import { OFFERS, PREMIUM_FEATURES, FREE_LIMITS, resolvePlan } from "@/lib/billing/plans";
import { checkLimit } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const profileId = req.nextUrl.searchParams.get("profileId");

  const base = {
    offers: OFFERS,
    features: PREMIUM_FEATURES,
    freeLimits: FREE_LIMITS,
    botConfigured: Boolean(
      process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.length > 10,
    ),
  };

  if (!profileId) return NextResponse.json({ ...base, plan: null, usage: null });

  const rows = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!rows.length) return NextResponse.json({ ...base, plan: null, usage: null });

  const plan = resolvePlan(rows[0]);
  const [watchesC, favC, targetC, pfC] = await Promise.all([
    checkLimit(profileId, "watches"),
    checkLimit(profileId, "favorites"),
    checkLimit(profileId, "targets"),
    checkLimit(profileId, "portfolio"),
  ]);

  const history = await db
    .select()
    .from(payments)
    .where(eq(payments.profileId, profileId))
    .orderBy(desc(payments.createdAt))
    .limit(10);

  return NextResponse.json({
    ...base,
    plan,
    linkedTelegram: Boolean(rows[0].telegramChatId),
    usage: {
      watches: { used: watchesC.used, limit: watchesC.limit },
      favorites: { used: favC.used, limit: favC.limit },
      targets: { used: targetC.used, limit: targetC.limit },
      portfolio: { used: pfC.used, limit: pfC.limit },
    },
    payments: history,
  });
}
