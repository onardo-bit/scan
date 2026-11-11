import { asc, desc, count, sql } from "drizzle-orm";
import Link from "next/link";
import {
  ArrowRight,
  Layers,
  Radar,
  Activity,
  Database,
  Bot,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { db } from "@/db";
import { gifts, priceHistory } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";
import { getMonitorState, getSetting } from "@/lib/market/settings";
import { GiftArt } from "@/components/gift-art";
import { DeltaPill, Chip } from "@/components/ui";
import { fmtTon, fmtDelta, timeAgo, fmtTime } from "@/lib/util/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await ensureSeed();

  const [[{ value: collections }], [{ value: changes24h }]] = await Promise.all([
    db.select({ value: count() }).from(gifts),
    db
      .select({ value: count() })
      .from(priceHistory)
      .where(sql`${priceHistory.createdAt} > now() - interval '24 hours'`),
  ]);

  const gainers = await db
    .select()
    .from(gifts)
    .where(sql`${gifts.lastChangePct} > 0`)
    .orderBy(desc(gifts.lastChangePct))
    .limit(4);
  const losers = await db
    .select()
    .from(gifts)
    .where(sql`${gifts.lastChangePct} < 0`)
    .orderBy(asc(gifts.lastChangePct))
    .limit(4);

  const latest = await db
    .select({ h: priceHistory, name: gifts.name, slug: gifts.slug, hue: gifts.hue })
    .from(priceHistory)
    .innerJoin(gifts, sql`${priceHistory.giftId} = ${gifts.id}`)
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(8);

  const monitor = await getMonitorState();
  const source = (await getSetting<{ name: string; ok: boolean; detail: string }>("source")) ?? {
    name: "boot",
    ok: true,
    detail: "инициализация",
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 md:px-8 lg:pb-10">
      {/* ------------------------------ hero ------------------------------ */}
      <section className="rise relative flex flex-col items-start gap-6 py-12 md:py-16">
        <Chip tone="mint">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-300" />
          ЭФИР · {source.detail || source.name}
        </Chip>
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.04] tracking-tight md:text-6xl">
          <span className="text-gradient">NFT-подарки Telegram</span>
          <br />
          под наблюдением 24/7.
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-[color:var(--color-dim)] md:text-base">
          GiftScope следит за каждой коллекцией NFT-подарков на рынке, фиксирует каждое движение
          флора и мгновенно присылает алерт в Telegram в момент изменения цены.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/catalog"
            className="btn-glow flex items-center gap-2 rounded-full px-5 py-2.5 text-sm"
          >
            Смотреть флоры <ArrowRight size={15} />
          </Link>
          <Link
            href="/bot"
            className="glass glass-hover flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-[color:var(--color-dim)]"
          >
            <Bot size={15} /> Попробовать Telegram-бота
          </Link>
        </div>
      </section>

      {/* ------------------------------ stats ------------------------------ */}
      <section className="rise grid grid-cols-2 gap-3 md:grid-cols-4" style={{ animationDelay: "80ms" }}>
        {[
          {
            icon: Layers,
            label: "Коллекций в трекинге",
            value: String(collections),
            hint: "апгрейд-подарки",
          },
          {
            icon: Activity,
            label: "Движений флора · 24ч",
            value: String(changes24h),
            hint: "зафиксировано и сохранено",
          },
          {
            icon: Radar,
            label: "Интервал скана",
            value: `${Math.round(monitor.intervalSec / 60) || 2} мин`,
            hint: monitor.lastTickAt ? `последний ${timeAgo(monitor.lastTickAt)}` : "прогрев",
          },
          {
            icon: Database,
            label: "Источник данных",
            value: source.name,
            hint: source.ok ? "в норме" : "деградация",
          },
        ].map((s) => (
          <div key={s.label} className="glass glass-hover rounded-2xl p-4">
            <div className="flex items-center gap-2 text-[color:var(--color-faint)]">
              <s.icon size={14} />
              <span className="font-mono text-[10px] uppercase tracking-widest">{s.label}</span>
            </div>
            <div className="mt-2.5 text-2xl font-bold tracking-tight">{s.value}</div>
            <div className="mt-1 text-[11px] text-[color:var(--color-faint)]">{s.hint}</div>
          </div>
        ))}
      </section>

      {/* ------------------------------ movers ------------------------------ */}
      <section className="rise mt-10 grid gap-3 md:grid-cols-2" style={{ animationDelay: "140ms" }}>
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={15} className="text-emerald-300" />
            <h3 className="text-sm font-semibold">Лидеры роста</h3>
          </div>
          <div className="space-y-1.5">
            {gainers.length === 0 && (
              <p className="py-3 font-mono text-xs text-[color:var(--color-faint)]">
                роста пока нет — собираю данные
              </p>
            )}
            {gainers.map((g) => (
              <Link
                key={g.id}
                href={`/gift/${g.slug}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/4"
              >
                <GiftArt name={g.name} hue={g.hue} size="sm" />
                <span className="flex-1 truncate text-sm font-medium">{g.name}</span>
                <span className="font-mono text-sm tabular-nums">{fmtTon(g.floorTon)} TON</span>
                <DeltaPill pct={g.lastChangePct} />
              </Link>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown size={15} className="text-rose-300" />
            <h3 className="text-sm font-semibold">Лидеры падения</h3>
          </div>
          <div className="space-y-1.5">
            {losers.length === 0 && (
              <p className="py-3 font-mono text-xs text-[color:var(--color-faint)]">
                падений пока нет — собираю данные
              </p>
            )}
            {losers.map((g) => (
              <Link
                key={g.id}
                href={`/gift/${g.slug}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/4"
              >
                <GiftArt name={g.name} hue={g.hue} size="sm" />
                <span className="flex-1 truncate text-sm font-medium">{g.name}</span>
                <span className="font-mono text-sm tabular-nums">{fmtTon(g.floorTon)} TON</span>
                <DeltaPill pct={g.lastChangePct} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ live feed ------------------------------ */}
      <section className="rise mt-10" style={{ animationDelay: "200ms" }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity size={15} className="text-sky-300" /> Последние изменения флоров
          </h3>
          <Link
            href="/history"
            className="flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200"
          >
            вся история <ArrowRight size={12} />
          </Link>
        </div>
        <div className="glass overflow-hidden rounded-2xl">
          {latest.length === 0 && (
            <p className="px-5 py-8 font-mono text-xs text-[color:var(--color-faint)]">
              ожидаю первые зафиксированные движения…
            </p>
          )}
          {latest.map((r) => (
            <Link
              key={r.h.id}
              href={`/gift/${r.slug}`}
              className="flex items-center gap-3 border-b border-[color:var(--color-line)] px-4 py-3 transition-colors last:border-0 hover:bg-white/4"
            >
              <GiftArt name={r.name} hue={r.hue} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="font-mono text-[10px] text-[color:var(--color-faint)]">
                  {fmtTime(r.h.createdAt)} · {timeAgo(r.h.createdAt)}
                </div>
              </div>
              <div className="hidden font-mono text-xs text-[color:var(--color-dim)] sm:block">
                {fmtTon(r.h.oldPrice)} → {fmtTon(r.h.newPrice)} TON
              </div>
              <DeltaPill pct={r.h.pct} />
              <span
                className={
                  r.h.delta >= 0
                    ? "font-mono text-xs tabular-nums text-emerald-300"
                    : "font-mono text-xs tabular-nums text-rose-300"
                }
              >
                {fmtDelta(r.h.delta)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
