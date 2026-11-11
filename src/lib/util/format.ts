export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function fmtTon(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)}%`;
}

export function fmtDelta(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)}`;
}

/** Русская плюрализация: plural(5, "коллекция", "коллекции", "коллекций") */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const t = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.max(0, Math.floor((Date.now() - t.getTime()) / 1000));
  if (s < 10) return "только что";
  if (s < 60) return `${s} с назад`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} ${plural(d, "день", "дня", "дней")} назад`;
}

export function fmtTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const t = typeof iso === "string" ? new Date(iso) : iso;
  return t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const t = typeof iso === "string" ? new Date(iso) : iso;
  return t.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
