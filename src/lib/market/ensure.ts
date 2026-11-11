import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { gifts, events } from "@/db/schema";
import { SEED_GIFTS, STARS_PER_TON } from "./catalog";

let seedPromise: Promise<void> | null = null;

/** Idempotent catalog seeding — safe to call from any request path. */
export function ensureSeed(): Promise<void> {
  seedPromise ??= doSeed().catch((e) => {
    seedPromise = null;
    throw e;
  });
  return seedPromise;
}

async function doSeed(): Promise<void> {
  const [{ value }] = await db.select({ value: count() }).from(gifts);
  if (Number(value) > 0) return;

  await db.insert(gifts).values(
    SEED_GIFTS.map((g) => ({
      slug: g.slug,
      name: g.name,
      supply: g.supply,
      starsPrice: Math.round(g.baseFloor * STARS_PER_TON),
      hue: g.hue,
      floorTon: g.baseFloor,
      prevFloorTon: g.baseFloor,
      lastChangePct: 0,
      offersCount: 0,
      lastScanAt: new Date(),
    })),
  );

  await db.insert(events).values({
    level: "info",
    source: "seed",
    message: `Catalog seeded with ${SEED_GIFTS.length} gift collections`,
  });
}

export async function logEvent(
  level: "info" | "warn" | "error",
  source: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(events).values({ level, source, message, meta });
  } catch (e) {
    console.error("[events] failed to persist event:", e);
  }
}

export async function getGiftBySlug(slug: string) {
  const rows = await db.select().from(gifts).where(eq(gifts.slug, slug)).limit(1);
  return rows[0] ?? null;
}
