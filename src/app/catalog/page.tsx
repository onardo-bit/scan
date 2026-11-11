"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Package,
  PackageOpen,
} from "lucide-react";
import { GiftArt } from "@/components/gift-art";
import { DeltaPill, EmptyState, PageShell } from "@/components/ui";
import { cn, fmtTon } from "@/lib/util/format";

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
  starsPrice: number;
}

const SORTS: Array<{ key: string; label: string }> = [
  { key: "price_asc", label: "Цена ↑" },
  { key: "price_desc", label: "Цена ↓" },
  { key: "offers_desc", label: "Офферы" },
  { key: "change_desc", label: "Рост" },
  { key: "change_asc", label: "Падение" },
  { key: "name", label: "А–Я" },
];

export default function CatalogPage() {
  const [items, setItems] = useState<GiftRow[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState("price_asc");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/catalog?page=${p}&sort=${s}`, { cache: "no-store" });
      const d = await r.json();
      setItems(d.items ?? []);
      setPages(d.pages ?? 1);
      setTotal(d.total ?? 0);
      setPage(d.page ?? p);
    } catch {
      /* keep stale */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0, sort);
  }, [sort, load]);

  useEffect(() => {
    const onRefresh = () => void load(page, sort);
    window.addEventListener("scanner:refresh", onRefresh);
    const t = setInterval(() => void load(page, sort), 45_000);
    return () => {
      window.removeEventListener("scanner:refresh", onRefresh);
      clearInterval(t);
    };
  }, [page, sort, load]);

  return (
    <PageShell
      title="NFT-флоры"
      subtitle={`${total} коллекций · актуальные флоры в TON`}
      actions={
        <button
          onClick={() => void load(page, sort)}
          className="glass glass-hover flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium text-[color:var(--color-dim)]"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Обновить
        </button>
      }
    >
      {/* sort bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
          <ArrowUpDown size={11} /> сорт.
        </span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
              sort === s.key
                ? "border-sky-400/40 bg-sky-400/12 text-sky-200"
                : "border-white/10 bg-white/4 text-[color:var(--color-dim)] hover:text-ink",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* grid */}
      {items.length === 0 && !loading ? (
        <EmptyState icon={<PackageOpen size={28} />} title="Каталог пуст" hint="Рыночный фид ещё не прислал данные." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((g, i) => (
            <Link
              key={g.id}
              href={`/gift/${g.slug}`}
              className="glass glass-hover group rounded-2xl p-4"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <GiftArt name={g.name} hue={g.hue} />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold tracking-tight">
                      {g.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-[color:var(--color-faint)]">
                      <Package size={10} />
                      {g.supply.toLocaleString("ru-RU")} выпуск · {g.offersCount || "—"} офферов
                    </div>
                  </div>
                </div>
                <DeltaPill pct={g.lastChangePct} />
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-faint)]">
                    Флор
                  </div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight text-ink">
                    {fmtTon(g.floorTon)}
                    <span className="ml-1 text-xs font-medium text-[color:var(--color-faint)]">TON</span>
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] text-[color:var(--color-faint)]">
                  минт {g.starsPrice.toLocaleString("ru-RU")} ★
                  <div className="mt-0.5">было {fmtTon(g.prevFloorTon)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* pagination */}
      <div className="mt-6 flex items-center justify-between">
        <span className="font-mono text-[11px] text-[color:var(--color-faint)]">
          стр. {page + 1} / {pages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 0}
            onClick={() => void load(page - 1, sort)}
            className="glass glass-hover flex items-center gap-1 rounded-full px-4 py-2 text-xs font-medium text-[color:var(--color-dim)] disabled:opacity-35"
          >
            <ChevronLeft size={14} /> Назад
          </button>
          <button
            disabled={page >= pages - 1}
            onClick={() => void load(page + 1, sort)}
            className="glass glass-hover flex items-center gap-1 rounded-full px-4 py-2 text-xs font-medium text-[color:var(--color-dim)] disabled:opacity-35"
          >
            Вперёд <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </PageShell>
  );
}
