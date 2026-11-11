import { cn, fmtPct } from "@/lib/util/format";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

export function DeltaPill({ pct, className }: { pct: number; className?: string }) {
  const up = pct > 0.0001;
  const down = pct < -0.0001;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums",
        up && "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
        down && "border-rose-400/25 bg-rose-400/10 text-rose-300",
        !up && !down && "border-white/10 bg-white/5 text-[color:var(--color-dim)]",
        className,
      )}
    >
      <Icon size={12} strokeWidth={2.4} />
      {fmtPct(pct)}
    </span>
  );
}

export function Chip({
  children,
  tone = "dim",
  className,
}: {
  children: React.ReactNode;
  tone?: "dim" | "ton" | "mint" | "rose" | "amber";
  className?: string;
}) {
  const tones: Record<string, string> = {
    dim: "border-white/10 bg-white/5 text-[color:var(--color-dim)]",
    ton: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    mint: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    rose: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    amber: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-[color:var(--color-faint)]">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
      <div className="text-[color:var(--color-faint)]">{icon}</div>
      <p className="text-sm font-medium text-[color:var(--color-dim)]">{title}</p>
      {hint && <p className="max-w-xs text-xs text-[color:var(--color-faint)]">{hint}</p>}
    </div>
  );
}

export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rise mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 lg:pb-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-[color:var(--color-dim)]">{subtitle}</p>
          )}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}
