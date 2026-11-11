import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export async function getSetting<T>(key: string): Promise<T | null> {
  try {
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    if (!rows.length) return null;
    return JSON.parse(rows[0].value) as T;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(value), updatedAt: new Date() },
    });
}

export interface SourceStatus {
  name: "tonnel" | "portals" | "simulator";
  ok: boolean;
  detail: string;
  at: string;
}

export interface MonitorState {
  intervalSec: number;
  enabled: boolean;
  lastTickAt: string | null;
  lastTickSummary: TickSummary | null;
  running: boolean;
}

export interface TickSummary {
  at: string;
  reason: string;
  source: string;
  scanned: number;
  changed: number;
  notified: number;
  durationMs: number;
  error?: string;
}

export const DEFAULT_MONITOR: MonitorState = {
  intervalSec: 120,
  enabled: true,
  lastTickAt: null,
  lastTickSummary: null,
  running: false,
};

export async function getMonitorState(): Promise<MonitorState> {
  const s = await getSetting<MonitorState>("monitor");
  return { ...DEFAULT_MONITOR, ...(s ?? {}) };
}
