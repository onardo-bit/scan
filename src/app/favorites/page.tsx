"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Star, Trash2, StarOff } from "lucide-react";
import { useProfile } from "@/components/profile";
import { GiftArt } from "@/components/gift-art";
import { DeltaPill, EmptyState, PageShell } from "@/components/ui";
import { fmtTon } from "@/lib/util/format";

interface GiftRow {
  id: number;
  slug: string;
  name: string;
  hue: number;
  floorTon: number;
  prevFloorTon: number;
  lastChangePct: number;
  offersCount: number;
  supply: number;
}

export default function FavoritesPage() {
  const { profile } = useProfile();
  const [items, setItems] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const r = await fetch(`/api/favorites?profileId=${profile.id}`, { cache: "no-store" });
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

  const remove = async (giftId: number) => {
    if (!profile) return;
    setItems((xs) => xs.filter((x) => x.id !== giftId));
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id, giftId }),
    }).catch(() => undefined);
  };

  return (
    <PageShell
      title="Избранное"
      subtitle="Сохранённые коллекции с всегда свежими флорами"
    >
      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<StarOff size={28} />}
          title="В избранном пусто"
          hint="Откройте каталог и отметьте звёздочкой важные коллекции."
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
                      {g.supply.toLocaleString("ru-RU")} выпуск · {g.offersCount || "—"} офферов
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => void remove(g.id)}
                  className="rounded-lg p-1.5 text-amber-300/80 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                  title="Убрать из избранного"
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
              <div className="mt-2 flex items-center gap-1 font-mono text-[10px] text-amber-300/70">
                <Star size={9} fill="currentColor" /> в избранном
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
