"use client";

import { useMemo, useState } from "react";
import { fmtTon, fmtDateTime } from "@/lib/util/format";

export interface ChartPoint {
  t: string | Date;
  p: number;
}

export function PriceChart({ data, hue = 210 }: { data: ChartPoint[]; hue?: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 760;
  const H = 260;
  const PAD = { l: 54, r: 14, t: 16, b: 30 };

  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const xs = data.map((d) => new Date(d.t).getTime());
    const ys = data.map((d) => d.p);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    const padY = (maxY - minY) * 0.12 || maxY * 0.05 || 1;
    minY = Math.max(0, minY - padY);
    maxY += padY;
    const X = (x: number) =>
      PAD.l + ((x - minX) / Math.max(1, maxX - minX)) * (W - PAD.l - PAD.r);
    const Y = (y: number) => PAD.t + (1 - (y - minY) / (maxY - minY)) * (H - PAD.t - PAD.b);
    const pts = xs.map((x, i) => [X(x), Y(ys[i])] as const);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1][0]},${H - PAD.b} L${pts[0][0]},${H - PAD.b} Z`;
    const ticks = Array.from({ length: 4 }, (_, i) => minY + ((maxY - minY) * (i + 1)) / 5);
    return { line, area, pts, ticks, Y, minX, maxX };
  }, [data]);

  if (!geo) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-white/10 font-mono text-xs text-[color:var(--color-faint)]">
        собираю точки цены…
      </div>
    );
  }

  const active = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      {active && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-lg border border-white/10 bg-[#0a1220]/95 px-3 py-1.5 backdrop-blur">
          <div className="font-mono text-sm font-semibold text-ink">{fmtTon(active.p)} TON</div>
          <div className="font-mono text-[10px] text-[color:var(--color-faint)]">
            {fmtDateTime(active.t)}
          </div>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          let bestD = Infinity;
          geo.pts.forEach(([px], i) => {
            const d = Math.abs(px - x);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id="pc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${hue} 95% 62%)`} stopOpacity="0.32" />
            <stop offset="100%" stopColor={`hsl(${hue} 95% 62%)`} stopOpacity="0" />
          </linearGradient>
        </defs>

        {geo.ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={geo.Y(t)}
              y2={geo.Y(t)}
              stroke="rgba(148,184,255,0.08)"
              strokeDasharray="3 6"
            />
            <text
              x={PAD.l - 8}
              y={geo.Y(t) + 3}
              textAnchor="end"
              fontSize="10"
              fill="rgba(139,163,199,0.7)"
              fontFamily="var(--font-mono)"
            >
              {fmtTon(t)}
            </text>
          </g>
        ))}

        <path d={geo.area} fill="url(#pc-area)" />
        <path
          d={geo.line}
          fill="none"
          stroke={`hsl(${hue} 95% 65%)`}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {hover !== null && (
          <g>
            <line
              x1={geo.pts[hover][0]}
              x2={geo.pts[hover][0]}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="rgba(232,240,255,0.25)"
              strokeDasharray="2 4"
            />
            <circle
              cx={geo.pts[hover][0]}
              cy={geo.pts[hover][1]}
              r="4.5"
              fill={`hsl(${hue} 95% 65%)`}
              stroke="#04070d"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

export function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const W = 96;
  const H = 28;
  const line = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = 3 + (1 - (p - min) / span) * (H - 6);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="opacity-80">
      <path
        d={line}
        fill="none"
        stroke={up ? "#3ef2c0" : "#ff5d7a"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
