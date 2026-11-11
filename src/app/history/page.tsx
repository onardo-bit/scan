"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import { GiftArt } from "@/components/gift-art";
import { DeltaPill, PageShell } from "@/components/ui";
import { fmtTon, fmtDelta, fmtDateTime, timeAgo } from "@/lib/util/format";

interface HistRow {
  id: number;
  giftId: number;
  giftName: string;
  giftSlug: string;
  hue: number;
  oldPrice: number;
  newPrice: number;
  delta: number;
  pct: number;
  source: string;
  createdAt: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistRow[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/history?page=${p}`, { cache: "no-store" });
      const d = await r.json();
      setItems(d.items ?? []);
      setPages(d.pages ?? 1);
      setTotal(d.total ?? 0);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
    const t = setInterval(() => void load(0), 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <PageShell
      title="История изменений"
      subtitle={`${total} движений флора зафиксировано по всему рынку`}
    >
      <div className="glass overflow-hidden rounded-2xl">
        {items.length === 0 && !loading && (
          <p className="px-5 py-10 text-center font-mono text-xs text-[color:var(--color-faint)]">
            движений пока не зафиксировано — движок пишет сюда каждое изменение
          </p>
        )}
        {items.map((h) => {
          const up = h.pct >= 0;
          return (
            <Link
              key={h.id}
              href={`/gift/${h.giftSlug}`}
              className="flex items-center gap-3 border-b border-[color:var(--color-line)] px-4 py-3 transition-colors last:border-0 hover:bg-white/4"
            >
              <GiftArt name={h.giftName} hue={h.hue} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{h.giftName}</div>
                <div className="font-mono text-[10px] text-[color:var(--color-faint)]">
                  {fmtDateTime(h.createdAt)} · {timeAgo(h.createdAt)} · {h.source}
                </div>
              </div>
              <div className="hidden font-mono text-xs text-[color:var(--color-dim)] md:block">
                {fmtTon(h.oldPrice)} → {fmtTon(h.newPrice)} TON
              </div>
              <span
                className={`flex items-center gap-0.5 font-mono text-xs tabular-nums ${
                  up ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                {fmtDelta(h.delta)} TON
              </span>
              <DeltaPill pct={h.pct} />
            </Link>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="font-mono text-[11px] text-[color:var(--color-faint)]">
          стр. {page + 1} / {pages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 0 || loading}
            onClick={() => void load(page - 1)}
            className="glass glass-hover flex items-center gap-1 rounded-full px-4 py-2 text-xs font-medium text-[color:var(--color-dim)] disabled:opacity-35"
          >
            <ChevronLeft size={14} /> Назад
          </button>
          <button
            disabled={page >= pages - 1 || loading}
            onClick={() => void load(page + 1)}
            className="glass glass-hover flex items-center gap-1 rounded-full px-4 py-2 text-xs font-medium text-[color:var(--color-dim)] disabled:opacity-35"
          >
            Вперёд <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </PageShell>
  );
}
