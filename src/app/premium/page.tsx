"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Check,
  Star,
  Infinity as InfinityIcon,
  Bot,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { useProfile } from "@/components/profile";
import { PageShell, Chip } from "@/components/ui";
import { cn, fmtDateTime } from "@/lib/util/format";

interface Offer {
  code: string;
  title: string;
  months: number;
  stars: number;
  approxUsd: number;
  badge?: string;
  savePct?: number;
}

interface UsageItem {
  used: number;
  limit: number;
}

interface PremiumData {
  offers: Offer[];
  features: string[];
  botConfigured: boolean;
  linkedTelegram?: boolean;
  plan: { plan: string; isPremium: boolean; until: string | null; daysLeft: number | null } | null;
  usage: Record<string, UsageItem> | null;
  payments?: Array<{
    id: number;
    offerCode: string;
    months: number;
    stars: number;
    createdAt: string;
  }>;
}

const USAGE_LABELS: Record<string, string> = {
  watches: "Отслеживаемые подарки",
  favorites: "Избранное",
  targets: "Ценовые цели",
  portfolio: "Позиции портфеля",
};

export default function PremiumPage() {
  const { profile } = useProfile();
  const [data, setData] = useState<PremiumData | null>(null);

  const load = useCallback(async () => {
    const q = profile ? `?profileId=${profile.id}` : "";
    const r = await fetch(`/api/premium${q}`, { cache: "no-store" });
    setData(await r.json());
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <PageShell title="Premium">
        <p className="font-mono text-xs text-[color:var(--color-faint)]">загрузка тарифов…</p>
      </PageShell>
    );
  }

  const isPremium = data.plan?.isPremium ?? false;

  return (
    <PageShell
      title="GiftScope Premium"
      subtitle="Снимите лимиты бесплатного тарифа. Оплата — звёздами Telegram, прямо в боте"
      actions={
        isPremium ? (
          <Chip tone="mint">
            <Sparkles size={11} /> активен ещё {data.plan?.daysLeft} дн.
          </Chip>
        ) : (
          <Chip tone="dim">текущий тариф: Free</Chip>
        )
      }
    >
      {/* usage */}
      {data.usage && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(data.usage).map(([key, u]) => {
            const unlimited = !Number.isFinite(u.limit);
            const pct = unlimited ? 0 : Math.min(100, (u.used / Math.max(1, u.limit)) * 100);
            const full = !unlimited && u.used >= u.limit;
            return (
              <div key={key} className="glass rounded-2xl p-4">
                <div className="font-mono text-[9px] uppercase tracking-widest text-[color:var(--color-faint)]">
                  {USAGE_LABELS[key] ?? key}
                </div>
                <div className="mt-2 flex items-baseline gap-1 font-mono text-xl font-bold tabular-nums">
                  {u.used}
                  <span className="text-xs font-normal text-[color:var(--color-faint)]">
                    / {unlimited ? "∞" : u.limit}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      unlimited ? "bg-emerald-400/70" : full ? "bg-rose-400" : "bg-sky-400",
                    )}
                    style={{ width: unlimited ? "100%" : `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* offers */}
      <div className="grid gap-3 md:grid-cols-3">
        {data.offers.map((o) => (
          <div
            key={o.code}
            className={cn(
              "glass glass-hover relative flex flex-col rounded-2xl p-5",
              o.badge === "Популярный" && "border-sky-400/35 shadow-[0_0_40px_-18px_rgba(85,184,255,.6)]",
            )}
          >
            {o.badge && (
              <span className="absolute -top-2.5 left-5 rounded-full bg-gradient-to-r from-sky-400 to-emerald-300 px-2.5 py-0.5 text-[10px] font-bold text-[#04121f]">
                {o.badge}
              </span>
            )}
            <div className="text-sm font-semibold">{o.title}</div>
            <div className="mt-3 flex items-end gap-1.5">
              <Star size={18} className="mb-1 text-amber-300" fill="currentColor" />
              <span className="font-mono text-3xl font-bold tabular-nums">{o.stars}</span>
              <span className="mb-1 text-xs text-[color:var(--color-faint)]">Stars</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-[color:var(--color-faint)]">
              ≈ ${o.approxUsd} · {(o.stars / o.months).toFixed(0)} ⭐/мес
              {o.savePct ? ` · выгода ${o.savePct}%` : ""}
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-white/12 px-3 py-2.5 text-[11px] leading-relaxed text-[color:var(--color-dim)]">
              Оплата открывается в боте командой{" "}
              <code className="font-mono text-[10px] text-emerald-200">/premium</code> — счёт Telegram
              Stars, подписка включается автоматически.
            </div>
          </div>
        ))}
      </div>

      {/* features */}
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <InfinityIcon size={15} className="text-emerald-300" /> Что даёт Premium
          </div>
          <ul className="space-y-2">
            {data.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-xs text-[color:var(--color-dim)]">
                <Check size={13} className="mt-0.5 shrink-0 text-emerald-300" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Bot size={15} className="text-sky-300" /> Как оплатить
          </div>
          <ol className="space-y-2.5 text-xs leading-relaxed text-[color:var(--color-dim)]">
            <li className="flex gap-2.5">
              <span className="font-mono text-sky-300">1.</span>
              Откройте бота и отправьте <code className="font-mono text-[10px] text-emerald-200">/premium</code>
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-sky-300">2.</span>
              Выберите срок — Telegram покажет счёт в ⭐
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-sky-300">3.</span>
              Подтвердите оплату в один тап — лимиты снимаются сразу
            </li>
          </ol>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-300" />
            <p className="text-[11px] leading-relaxed text-[color:var(--color-faint)]">
              Платёж проходит внутри Telegram: мы не получаем карточные данные. Повторная выдача
              исключена — каждый платёж фиксируется по уникальному charge&nbsp;id.
              {!data.botConfigured && " Сейчас токен бота не настроен — оплата появится после подключения."}
            </p>
          </div>
        </div>
      </div>

      {/* payments */}
      {data.payments && data.payments.length > 0 && (
        <div className="glass mt-6 overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-[color:var(--color-line)] px-4 py-3 text-sm font-semibold">
            <Receipt size={14} className="text-amber-300" /> История платежей
          </div>
          {data.payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 border-b border-[color:var(--color-line)] px-4 py-2.5 font-mono text-[11px] last:border-0"
            >
              <span className="text-[color:var(--color-dim)]">{p.offerCode}</span>
              <span className="text-[color:var(--color-faint)]">{p.months} мес</span>
              <span className="ml-auto text-amber-300">{p.stars} ⭐</span>
              <span className="text-[color:var(--color-faint)]">{fmtDateTime(p.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
