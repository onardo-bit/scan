"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Target,
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
} from "lucide-react";
import { useProfile } from "@/components/profile";
import { GiftArt } from "@/components/gift-art";
import { DeltaPill, EmptyState, PageShell, Chip } from "@/components/ui";
import { fmtTon, fmtDelta, cn } from "@/lib/util/format";

interface Position {
  id: number;
  giftId: number;
  name: string;
  slug: string;
  hue: number;
  qty: number;
  entry: number;
  floor: number;
  value: number;
  pnl: number;
  pnlPct: number;
}

interface TargetRow {
  id: number;
  giftId: number;
  name: string;
  slug: string;
  hue: number;
  direction: "below" | "above";
  targetTon: number;
  floorTon: number;
  active: boolean;
}

export default function PortfolioPage() {
  const { profile } = useProfile();
  const [positions, setPositions] = useState<Position[]>([]);
  const [totals, setTotals] = useState({ value: 0, cost: 0, pnl: 0, pnlPct: 0 });
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [allGifts, setAllGifts] = useState<Array<{ id: number; name: string; floor: number }>>([]);

  const [tGift, setTGift] = useState("");
  const [tDir, setTDir] = useState<"below" | "above">("below");
  const [tPrice, setTPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const [p, t] = await Promise.all([
      fetch(`/api/portfolio?profileId=${profile.id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/targets?profileId=${profile.id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setPositions(p.items ?? []);
    setTotals(p.totals ?? { value: 0, cost: 0, pnl: 0, pnlPct: 0 });
    setTargets(t.items ?? []);
    setAllGifts(t.allGifts ?? []);
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

  const addTarget = async () => {
    if (!profile || !tGift || !Number(tPrice)) return;
    setBusy(true);
    try {
      await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          giftId: Number(tGift),
          direction: tDir,
          targetTon: Number(tPrice.replace(",", ".")),
        }),
      });
      setTPrice("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeTarget = async (id: number) => {
    if (!profile) return;
    setTargets((xs) => xs.filter((x) => x.id !== id));
    await fetch("/api/targets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id, id }),
    }).catch(() => undefined);
  };

  const removePosition = async (giftId: number) => {
    if (!profile) return;
    setPositions((xs) => xs.filter((x) => x.giftId !== giftId));
    await fetch("/api/portfolio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id, giftId }),
    }).catch(() => undefined);
  };

  return (
    <PageShell
      title="Портфель и цели"
      subtitle="Виртуальный учёт позиций по живым флорам + одноразовые ценовые алерты"
    >
      {/* totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            <Wallet size={11} /> оценка
          </div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums md:text-2xl">
            {fmtTon(totals.value)}
            <span className="ml-1 text-[10px] text-[color:var(--color-faint)]">TON</span>
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            <Briefcase size={11} /> вложено
          </div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums md:text-2xl">
            {fmtTon(totals.cost)}
            <span className="ml-1 text-[10px] text-[color:var(--color-faint)]">TON</span>
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            P&L
          </div>
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1.5 font-mono text-xl font-bold tabular-nums md:text-2xl",
              totals.pnl >= 0 ? "text-emerald-300" : "text-rose-300",
            )}
          >
            {totals.pnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {fmtDelta(totals.pnl)}
          </div>
        </div>
      </div>

      {/* positions */}
      <h3 className="mt-6 mb-3 text-sm font-semibold">Позиции</h3>
      {positions.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={28} />}
          title="Портфель пуст"
          hint="Откройте любой подарок и нажмите «В портфель» — цена входа зафиксируется, а дальше смотрите живой P&L."
        />
      ) : (
        <div className="space-y-2">
          {positions.map((p) => (
            <div key={p.id} className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
              <GiftArt name={p.name} hue={p.hue} size="sm" />
              <div className="min-w-0 flex-1">
                <Link href={`/gift/${p.slug}`} className="block truncate text-sm font-semibold hover:text-sky-200">
                  {p.name} <span className="font-mono text-xs text-[color:var(--color-faint)]">×{p.qty}</span>
                </Link>
                <div className="font-mono text-[10px] text-[color:var(--color-faint)]">
                  вход {fmtTon(p.entry)} → флор {fmtTon(p.floor)} TON
                </div>
              </div>
              <div className="hidden font-mono text-xs text-[color:var(--color-dim)] sm:block">
                {fmtTon(p.value)} TON
              </div>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  p.pnl >= 0 ? "text-emerald-300" : "text-rose-300",
                )}
              >
                {fmtDelta(p.pnl)}
              </span>
              <DeltaPill pct={p.pnlPct} />
              <button
                onClick={() => void removePosition(p.giftId)}
                className="rounded-lg p-1.5 text-[color:var(--color-faint)] transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                title="Убрать из портфеля"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* targets */}
      <h3 className="mt-8 mb-3 flex items-center gap-2 text-sm font-semibold">
        <Target size={14} className="text-amber-300" /> Ценовые цели
      </h3>

      <div className="glass mb-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tGift}
            onChange={(e) => setTGift(e.target.value)}
            className="input-dark flex-1 rounded-xl px-3 py-2.5 text-sm min-w-44"
          >
            <option value="">— выберите подарок —</option>
            {allGifts.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({fmtTon(g.floor)} TON)
              </option>
            ))}
          </select>
          <select
            value={tDir}
            onChange={(e) => setTDir(e.target.value as "below" | "above")}
            className="input-dark rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="below">упадёт ниже</option>
            <option value="above">вырастет выше</option>
          </select>
          <input
            value={tPrice}
            onChange={(e) => setTPrice(e.target.value)}
            placeholder="цена TON"
            inputMode="decimal"
            className="input-dark w-28 rounded-xl px-3 py-2.5 text-sm font-mono"
          />
          <button
            onClick={() => void addTarget()}
            disabled={busy || !tGift || !tPrice}
            className="btn-glow flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs disabled:opacity-40"
          >
            <Plus size={13} /> Добавить цель
          </button>
        </div>
      </div>

      {targets.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title="Активных целей нет"
          hint="Например: «Toy Bear ниже 25 TON» — и бот напишет вам в момент пересечения. Срабатывает один раз, чтобы не спамить."
        />
      ) : (
        <div className="space-y-2">
          {targets.map((t) => (
            <div
              key={t.id}
              className={cn(
                "glass flex items-center gap-3 rounded-2xl px-4 py-3",
                !t.active && "opacity-55",
              )}
            >
              <GiftArt name={t.name} hue={t.hue} size="sm" />
              <div className="min-w-0 flex-1">
                <Link href={`/gift/${t.slug}`} className="block truncate text-sm font-semibold hover:text-sky-200">
                  {t.name}
                </Link>
                <div className="font-mono text-[10px] text-[color:var(--color-faint)]">
                  {t.direction === "below" ? "ниже" : "выше"} {fmtTon(t.targetTon)} TON · сейчас{" "}
                  {fmtTon(t.floorTon)} TON
                </div>
              </div>
              <Chip tone={t.active ? "amber" : "mint"}>{t.active ? "ждёт" : "сработала"}</Chip>
              <button
                onClick={() => void removeTarget(t.id)}
                className="rounded-lg p-1.5 text-[color:var(--color-faint)] transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                title="Удалить цель"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Chip tone="dim">P&L пересчитывается при каждом скане</Chip>
        <Chip tone="dim">цель срабатывает один раз — без спама</Chip>
        <Chip tone="mint">ежедневная утренняя сводка рынка</Chip>
      </div>
    </PageShell>
  );
}
