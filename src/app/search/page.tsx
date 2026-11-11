"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SearchIcon, ScanSearch, ArrowRight } from "lucide-react";
import { GiftArt } from "@/components/gift-art";
import { DeltaPill, PageShell } from "@/components/ui";
import { fmtTon } from "@/lib/util/format";

interface GiftRow {
  id: number;
  slug: string;
  name: string;
  hue: number;
  floorTon: number;
  lastChangePct: number;
  offersCount: number;
}

const SUGGESTIONS = ["bear", "cake", "watch", "rose", "ring", "heart", "snow", "candle"];

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<GiftRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setItems([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const d = await r.json();
        setItems(d.items ?? []);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 240);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <PageShell title="Поиск подарков" subtitle="Нечёткий поиск по всем отслеживаемым коллекциям NFT-подарков">
      <div className="glass mx-auto max-w-2xl rounded-2xl p-2">
        <div className="flex items-center gap-3 px-3">
          <SearchIcon size={16} className="shrink-0 text-[color:var(--color-faint)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Начните вводить название — например, «Toy Bear»"
            className="input-dark w-full rounded-xl border-0 bg-transparent py-3 text-sm placeholder:text-[color:var(--color-faint)] focus:shadow-none"
          />
          {loading && (
            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-300/30 border-t-sky-300" />
          )}
        </div>
      </div>

      {!searched && (
        <div className="mx-auto mt-6 max-w-2xl">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            быстрый выбор
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                className="glass glass-hover rounded-full px-3.5 py-1.5 text-xs text-[color:var(--color-dim)]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && items.length === 0 && (
        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 text-center">
          <ScanSearch size={26} className="text-[color:var(--color-faint)]" />
          <p className="text-sm text-[color:var(--color-dim)]">По запросу «{q}» ничего не найдено.</p>
          <p className="text-xs text-[color:var(--color-faint)]">Попробуйте более короткий фрагмент названия.</p>
        </div>
      )}

      <div className="mx-auto mt-6 max-w-2xl space-y-2">
        {items.map((g, i) => (
          <Link
            key={g.id}
            href={`/gift/${g.slug}`}
            className="glass glass-hover rise group flex items-center gap-3 rounded-2xl p-3.5"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <GiftArt name={g.name} hue={g.hue} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{g.name}</div>
              <div className="font-mono text-[10px] text-[color:var(--color-faint)]">
                {g.offersCount || "—"} офферов на рынке
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-bold tabular-nums">{fmtTon(g.floorTon)} TON</div>
            </div>
            <DeltaPill pct={g.lastChangePct} />
            <ArrowRight size={14} className="text-[color:var(--color-faint)] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
