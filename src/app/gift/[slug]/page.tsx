import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gifts, priceHistory } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";
import { GiftArt } from "@/components/gift-art";
import { DeltaPill, Chip } from "@/components/ui";
import { PriceChart } from "@/components/chart";
import { GiftActions } from "./actions";
import { fmtTon, fmtDelta, fmtDateTime, timeAgo } from "@/lib/util/format";
import { Package, Layers, Coins, RefreshCcw } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GiftPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureSeed();
  const { slug } = await params;

  const gift = /^\d+$/.test(slug)
    ? (await db.select().from(gifts).where(eq(gifts.id, Number(slug))).limit(1))[0]
    : (await db.select().from(gifts).where(eq(gifts.slug, slug)).limit(1))[0];

  if (!gift) notFound();

  const histDesc = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.giftId, gift.id))
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(200);

  const chart = [
    { t: gift.createdAt, p: Number(gift.prevFloorTon) || Number(gift.floorTon) },
    ...histDesc.map((h) => ({ t: h.createdAt, p: Number(h.newPrice) })).reverse().slice(-160),
  ];

  const [dayAgo] = await db
    .select({ p: priceHistory.newPrice })
    .from(priceHistory)
    .where(
      sql`${priceHistory.giftId} = ${gift.id} and ${priceHistory.createdAt} <= now() - interval '24 hours'`,
    )
    .orderBy(asc(priceHistory.createdAt))
    .limit(1);
  const dayPct = dayAgo
    ? ((gift.floorTon - Number(dayAgo.p)) / Number(dayAgo.p)) * 100
    : null;

  const feed = histDesc.slice(0, 15);

  return (
    <div className="rise mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 lg:pb-10">
      {/* header */}
      <div className="glass overflow-hidden rounded-3xl">
        <div
          className="h-24 w-full opacity-70"
          style={{
            background: `linear-gradient(100deg, hsl(${gift.hue} 85% 30% / 0.55), hsl(${(gift.hue + 60) % 360} 85% 24% / 0.35), transparent)`,
          }}
        />
        <div className="-mt-10 flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div className="flex items-end gap-4">
            <GiftArt name={gift.name} hue={gift.hue} size="lg" className="ring-4 ring-[#0a101c]" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{gift.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Chip tone="ton">
                  <Package size={11} /> выпуск {gift.supply.toLocaleString("ru-RU")}
                </Chip>
                <Chip tone="dim">
                  <Layers size={11} /> {gift.offersCount || "—"} офферов
                </Chip>
                <Chip tone="amber">
                  <Coins size={11} /> минт {gift.starsPrice.toLocaleString("ru-RU")} ★
                </Chip>
              </div>
            </div>
          </div>
          <GiftActions giftId={gift.id} />
        </div>
      </div>

      {/* price row */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="glass rounded-2xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            Флор
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
            {fmtTon(gift.floorTon)}
            <span className="ml-1 text-xs text-[color:var(--color-faint)]">TON</span>
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            Последний скачок
          </div>
          <div className="mt-2">
            <DeltaPill pct={gift.lastChangePct} className="text-xs" />
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            За 24 часа
          </div>
          <div className="mt-2">
            {dayPct === null ? (
              <span className="font-mono text-xs text-[color:var(--color-faint)]">собираю данные…</span>
            ) : (
              <DeltaPill pct={dayPct} className="text-xs" />
            )}
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            Последний скан
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 font-mono text-sm text-[color:var(--color-dim)]">
            <RefreshCcw size={12} /> {timeAgo(gift.lastScanAt)}
          </div>
        </div>
      </div>

      {/* chart */}
      <div className="glass mt-4 rounded-2xl p-4 md:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">История цены флора</h3>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-faint)]">
            TON · все сканы
          </span>
        </div>
        <PriceChart data={chart} hue={gift.hue} />
      </div>

      {/* history table */}
      <div className="glass mt-4 overflow-hidden rounded-2xl">
        <div className="border-b border-[color:var(--color-line)] px-4 py-3 text-sm font-semibold">
          Журнал изменений
        </div>
        {feed.length === 0 && (
          <p className="px-4 py-8 font-mono text-xs text-[color:var(--color-faint)]">
            движений пока нет — движок записывает сюда каждое изменение флора
          </p>
        )}
        {feed.map((h) => (
          <div
            key={h.id}
            className="flex items-center gap-3 border-b border-[color:var(--color-line)] px-4 py-2.5 font-mono text-xs last:border-0"
          >
            <DeltaPill pct={h.pct} />
            <span className="text-[color:var(--color-dim)]">
              {fmtTon(h.oldPrice)} → <span className="text-ink">{fmtTon(h.newPrice)}</span> TON
            </span>
            <span className={h.delta >= 0 ? "text-emerald-300" : "text-rose-300"}>
              {fmtDelta(h.delta)} TON
            </span>
            <span className="ml-auto hidden text-[10px] text-[color:var(--color-faint)] sm:block">
              {h.source}
            </span>
            <span className="text-[10px] text-[color:var(--color-faint)]">
              {fmtDateTime(h.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
