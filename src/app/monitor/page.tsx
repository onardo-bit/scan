"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radar, Bell, BellOff, Trash2, Settings2, EyeOff } from "lucide-react";
import { useProfile } from "@/components/profile";
import { GiftArt } from "@/components/gift-art";
import { DeltaPill, EmptyState, PageShell, Chip } from "@/components/ui";
import { fmtTon, plural } from "@/lib/util/format";

interface GiftRow {
  id: number;
  slug: string;
  name: string;
  hue: number;
  floorTon: number;
  lastChangePct: number;
  offersCount: number;
}

export default function MonitorPage() {
  const { profile, patch } = useProfile();
  const [items, setItems] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const r = await fetch(`/api/watches?profileId=${profile.id}`, { cache: "no-store" });
      const d = await r.json();
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    const on = () => void load();
    window.addEventListener("scanner:refresh", on);
    return () => {
      clearInterval(t);
      window.removeEventListener("scanner:refresh", on);
    };
  }, [load]);

  const untrack = async (giftId: number) => {
    if (!profile) return;
    setItems((xs) => xs.filter((x) => x.id !== giftId));
    await fetch("/api/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id, giftId }),
    }).catch(() => undefined);
  };

  const enabled = profile?.notificationsEnabled ?? true;

  return (
    <PageShell
      title="Мониторинг цен"
      subtitle="Отслеживаемые коллекции получают мгновенные алерты при каждом значимом движении флора"
      actions={
        <Link
          href="/settings"
          className="glass glass-hover flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium text-[color:var(--color-dim)]"
        >
          <Settings2 size={13} /> Порог {Number(profile?.thresholdPct ?? 1)}%
        </Link>
      }
    >
      <div className="glass mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400/25 to-emerald-300/15 text-sky-300">
            <Radar size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold">
              Алерт-движок {enabled ? "активен" : "на паузе"}
            </div>
            <div className="text-[11px] text-[color:var(--color-faint)]">
              {items.length} {plural(items.length, "коллекция", "коллекции", "коллекций")} под наблюдением · срабатывает при изменении от {Number(profile?.thresholdPct ?? 1)}%
            </div>
          </div>
        </div>
        <button
          onClick={() => void patch({ notificationsEnabled: !enabled })}
          className={
            enabled
              ? "glass glass-hover flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[color:var(--color-dim)]"
              : "btn-glow flex items-center gap-2 rounded-full px-4 py-2 text-xs"
          }
        >
          {enabled ? <BellOff size={13} /> : <Bell size={13} />}
          {enabled ? "Пауза" : "Возобновить"}
        </button>
      </div>

      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<EyeOff size={28} />}
          title="Пока ничего не отслеживается"
          hint="Откройте любой подарок в каталоге и нажмите «Отслеживать флор» — алерты будут приходить сюда и в Telegram."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((g) => (
            <div key={g.id} className="glass glass-hover rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/gift/${g.slug}`} className="flex min-w-0 items-center gap-3">
                  <GiftArt name={g.name} hue={g.hue} />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">{g.name}</div>
                    <div className="font-mono text-[10px] text-[color:var(--color-faint)]">
                      {g.offersCount || "—"} офферов
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => void untrack(g.id)}
                  className="rounded-lg p-1.5 text-[color:var(--color-faint)] transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                  title="Прекратить трекинг"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div className="font-mono text-xl font-bold tabular-nums">
                  {fmtTon(g.floorTon)}
                  <span className="ml-1 text-[10px] text-[color:var(--color-faint)]">TON</span>
                </div>
                <DeltaPill pct={g.lastChangePct} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Chip tone="dim">алерты дедуплицируются по событию</Chip>
        <Chip tone="dim">доставка: в приложение + Telegram</Chip>
      </div>
    </PageShell>
  );
}
