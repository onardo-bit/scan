/**
 * Тарифы и лимиты.
 *
 * Оплата — через Telegram Stars (currency "XTR"): официальный способ продажи
 * цифровых товаров внутри бота, без эквайринга и провайдер-токена.
 * Цена указывается целым числом звёзд (не в копейках).
 */

export interface PlanLimits {
  watches: number;
  favorites: number;
  targets: number;
  portfolio: number;
  minThresholdPct: number;
  digest: boolean;
  export: boolean;
}

export const FREE_LIMITS: PlanLimits = {
  watches: 3,
  favorites: 5,
  targets: 2,
  portfolio: 3,
  minThresholdPct: 1,
  digest: true,
  export: false,
};

export const PREMIUM_LIMITS: PlanLimits = {
  watches: Infinity,
  favorites: Infinity,
  targets: Infinity,
  portfolio: Infinity,
  minThresholdPct: 0.1,
  digest: true,
  export: true,
};

export interface PlanOffer {
  code: "m1" | "m3" | "m12";
  title: string;
  months: number;
  stars: number;
  /** Ориентировочная цена в USD для витрины (1 ⭐ ≈ $0.02 в розницу). */
  approxUsd: number;
  badge?: string;
  savePct?: number;
}

export const OFFERS: PlanOffer[] = [
  { code: "m1", title: "Premium · 1 месяц", months: 1, stars: 150, approxUsd: 3 },
  {
    code: "m3",
    title: "Premium · 3 месяца",
    months: 3,
    stars: 350,
    approxUsd: 7,
    badge: "Популярный",
    savePct: 22,
  },
  {
    code: "m12",
    title: "Premium · 12 месяцев",
    months: 12,
    stars: 1000,
    approxUsd: 20,
    badge: "Выгодный",
    savePct: 44,
  },
];

export function offerByCode(code: string): PlanOffer | undefined {
  return OFFERS.find((o) => o.code === code);
}

export const PREMIUM_FEATURES: string[] = [
  "Безлимит отслеживаемых подарков (на Free — 3)",
  "Безлимит ценовых целей (на Free — 2)",
  "Безлимит позиций портфеля (на Free — 3)",
  "Безлимит избранного (на Free — 5)",
  "Чувствительность алертов от 0.1% (на Free — от 1%)",
  "Экспорт истории и портфеля в JSON",
  "Значок PRO и приоритет в очереди уведомлений",
];

export interface PlanView {
  plan: "free" | "premium";
  isPremium: boolean;
  until: string | null;
  daysLeft: number | null;
  limits: PlanLimits;
}

/** Единая точка истины: премиум активен, пока не истёк срок. */
export function resolvePlan(profile: {
  plan: string;
  planUntil: Date | string | null;
}): PlanView {
  const until = profile.planUntil ? new Date(profile.planUntil) : null;
  const isPremium = profile.plan === "premium" && until !== null && until.getTime() > Date.now();
  return {
    plan: isPremium ? "premium" : "free",
    isPremium,
    until: until ? until.toISOString() : null,
    daysLeft: isPremium && until
      ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86_400_000))
      : null,
    limits: isPremium ? PREMIUM_LIMITS : FREE_LIMITS,
  };
}

/** Продление: от текущей даты окончания, если подписка ещё активна. */
export function extendUntil(current: Date | string | null, months: number): Date {
  const now = Date.now();
  const base = current && new Date(current).getTime() > now ? new Date(current) : new Date();
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}
