import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, watches, favorites, priceTargets, portfolio } from "@/db/schema";
import { resolvePlan, type PlanView } from "./plans";

export type LimitKind = "watches" | "favorites" | "targets" | "portfolio";

const LABEL: Record<LimitKind, string> = {
  watches: "отслеживаемых подарков",
  favorites: "подарков в избранном",
  targets: "ценовых целей",
  portfolio: "позиций портфеля",
};

export interface LimitCheck {
  allowed: boolean;
  used: number;
  limit: number;
  plan: PlanView;
  message?: string;
}

export async function getPlanFor(profileId: string): Promise<PlanView | null> {
  const rows = await db
    .select({ plan: profiles.plan, planUntil: profiles.planUntil })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!rows.length) return null;
  return resolvePlan(rows[0]);
}

async function usedCount(kind: LimitKind, profileId: string): Promise<number> {
  if (kind === "watches") {
    const [r] = await db
      .select({ v: count() })
      .from(watches)
      .where(eq(watches.profileId, profileId));
    return Number(r.v);
  }
  if (kind === "favorites") {
    const [r] = await db
      .select({ v: count() })
      .from(favorites)
      .where(eq(favorites.profileId, profileId));
    return Number(r.v);
  }
  if (kind === "targets") {
    const [r] = await db
      .select({ v: count() })
      .from(priceTargets)
      .where(and(eq(priceTargets.profileId, profileId), eq(priceTargets.active, true)));
    return Number(r.v);
  }
  const [r] = await db
    .select({ v: count() })
    .from(portfolio)
    .where(eq(portfolio.profileId, profileId));
  return Number(r.v);
}

/**
 * Проверка лимита перед созданием записи.
 * Вызывается и из бота, и из веб-API — обойти через прямой запрос нельзя.
 */
export async function checkLimit(profileId: string, kind: LimitKind): Promise<LimitCheck> {
  const plan = (await getPlanFor(profileId)) ?? resolvePlan({ plan: "free", planUntil: null });
  const limit = plan.limits[kind];
  if (!Number.isFinite(limit)) {
    return { allowed: true, used: 0, limit, plan };
  }
  const used = await usedCount(kind, profileId);
  const allowed = used < limit;
  return {
    allowed,
    used,
    limit,
    plan,
    message: allowed
      ? undefined
      : `Лимит бесплатного тарифа: ${limit} ${LABEL[kind]}. Оформите Premium, чтобы снять ограничение.`,
  };
}

/** Минимально допустимый порог алерта для тарифа пользователя. */
export async function clampThreshold(profileId: string, value: number): Promise<number> {
  const plan = (await getPlanFor(profileId)) ?? resolvePlan({ plan: "free", planUntil: null });
  return Math.max(plan.limits.minThresholdPct, Math.min(50, value));
}
