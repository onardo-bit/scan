import type { SeedGift } from "./catalog";

/**
 * Pluggable market data sources.
 *
 * 1. tonnel   — Tonnel Marketplace public API (no auth required for
 *               browsing listed gifts): POST gifts2.tonnel.network/api/pageGifts
 * 2. portals  — Portals Marketplace (requires a rotating `tma` auth token
 *               supplied via PORTALS_AUTH_DATA env var).
 * 3. simulator— deterministic random-walk feed guaranteeing a working
 *               product demo when live endpoints are unreachable.
 *
 * The monitoring engine tries sources in priority order and records which
 * one served the data (visible in the admin console).
 */

export interface PricePoint {
  slug: string;
  name: string;
  floorTon: number;
  offers: number;
}

export type SourceName = "tonnel" | "portals" | "simulator";

export interface FetchResult {
  source: SourceName;
  points: Map<string, PricePoint>;
  detail: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

function floorMap(entries: Iterable<PricePoint>): Map<string, PricePoint> {
  const m = new Map<string, PricePoint>();
  for (const p of entries) m.set(p.slug, p);
  return m;
}

/* ------------------------------------------------------------------ */
/*  Tonnel Marketplace (public, primary)                               */
/* ------------------------------------------------------------------ */

interface TonnelItem {
  name?: string;
  gift_name?: string;
  price?: string | number;
}

async function fetchTonnel(catalog: SeedGift[]): Promise<Map<string, PricePoint>> {
  const byName = new Map(catalog.map((g) => [g.name.toLowerCase(), g]));
  const agg = new Map<string, { min: number; count: number }>();
  const limit = 30;
  const maxPages = 12;

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch("https://gifts2.tonnel.network/api/pageGifts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Origin: "https://market.tonnel.network",
        Referer: "https://market.tonnel.network/",
      },
      body: JSON.stringify({
        page,
        limit,
        sort: '{"price":1,"gift_id":-1}',
        filter:
          '{"price":{"$exists":true},"refunded":{"$ne":true},"buyer":{"$exists":false},"asset":"TON"}',
        ref: 0,
        price_range: null,
        user_auth: "",
      }),
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Tonnel HTTP ${res.status}`);
    const raw: unknown = await res.json();
    const items: TonnelItem[] = Array.isArray(raw)
      ? (raw as TonnelItem[])
      : ((raw as { gifts?: TonnelItem[]; data?: TonnelItem[] })?.gifts ??
        (raw as { data?: TonnelItem[] })?.data ??
        []);
    for (const it of items) {
      const nm = (it.gift_name ?? it.name ?? "").toLowerCase();
      const seed = byName.get(nm);
      const price = Number(it.price);
      if (!seed || !Number.isFinite(price) || price <= 0) continue;
      const cur = agg.get(nm) ?? { min: Infinity, count: 0 };
      cur.min = Math.min(cur.min, price);
      cur.count += 1;
      agg.set(nm, cur);
    }
    if (items.length < limit) break;
  }

  if (agg.size === 0) throw new Error("Tonnel returned no listed gifts");

  const points: PricePoint[] = [];
  for (const [nm, a] of agg) {
    const seed = byName.get(nm)!;
    points.push({ slug: seed.slug, name: seed.name, floorTon: round3(a.min), offers: a.count });
  }
  return floorMap(points);
}

/* ------------------------------------------------------------------ */
/*  Portals Marketplace (optional, needs PORTALS_AUTH_DATA)            */
/* ------------------------------------------------------------------ */

async function fetchPortals(catalog: SeedGift[]): Promise<Map<string, PricePoint>> {
  const auth = process.env.PORTALS_AUTH_DATA;
  if (!auth) throw new Error("PORTALS_AUTH_DATA not configured");

  const res = await fetch("https://portals-market.com/api/collections?limit=100", {
    headers: { Authorization: auth, "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Portals HTTP ${res.status}`);
  const raw: unknown = await res.json();
  const list = (raw as { collections?: Array<Record<string, unknown>> })?.collections;
  if (!Array.isArray(list) || list.length === 0)
    throw new Error("Portals returned no collections");

  const byName = new Map(catalog.map((g) => [g.name.toLowerCase(), g]));
  const points: PricePoint[] = [];
  for (const c of list) {
    const nm = String(c.name ?? c.title ?? "").toLowerCase();
    const seed = byName.get(nm);
    const floor = Number(c.floor_price);
    if (!seed || !Number.isFinite(floor) || floor <= 0) continue;
    points.push({
      slug: seed.slug,
      name: seed.name,
      floorTon: round3(floor),
      offers: Number(c.listed_count ?? 0) || 0,
    });
  }
  if (!points.length) throw new Error("Portals floors did not match catalog");
  return floorMap(points);
}

/* ------------------------------------------------------------------ */
/*  Simulator feed (deterministic random walk around baselines)        */
/* ------------------------------------------------------------------ */

function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateFloor(base: number, slug: string, now = Date.now()): { price: number; offers: number } {
  // 10-minute market buckets → floors move smoothly but persist within a bucket.
  const bucket = Math.floor(now / (10 * 60 * 1000));
  const h = hash32(slug);
  const phase = (h % 628) / 100;

  // Trending wave + micro-noise
  const wave = Math.sin(bucket / 37 + phase) * 0.055 + Math.sin(bucket / 11 + phase * 2.7) * 0.028;
  const rng = mulberry(h ^ bucket);
  const noise = (rng() - 0.5) * 0.06;

  // Occasional market events: ~1 gift in 41 spikes/crashes up to ±14% per bucket
  const shockRoll = hash32(`${slug}:${bucket}`) % 41;
  const shock = shockRoll === 0 ? (rng() > 0.5 ? 1 : -1) * (0.05 + rng() * 0.09) : 0;

  const price = Math.max(0.05, base * (1 + wave + noise + shock));
  const offersBase = 12 + (h % 90);
  const offers = Math.max(3, Math.round(offersBase * (1 + Math.sin(bucket / 23 + phase) * 0.25)));
  return { price: round3(price), offers };
}

function fetchSimulator(catalog: SeedGift[]): Map<string, PricePoint> {
  const points = catalog.map((g) => {
    const { price, offers } = simulateFloor(g.baseFloor, g.slug);
    return { slug: g.slug, name: g.name, floorTon: price, offers };
  });
  return floorMap(points);
}

/* ------------------------------------------------------------------ */
/*  Orchestrator                                                        */
/* ------------------------------------------------------------------ */

export type SourcePreference = "auto" | "tonnel" | "portals" | "simulator";

export async function fetchMarketFloors(
  catalog: SeedGift[],
  preference: SourcePreference = "auto",
): Promise<FetchResult> {
  const envSource = (process.env.MARKET_SOURCE ?? "").toLowerCase();
  const forced = (preference === "auto" && envSource
    ? envSource
    : preference) as SourcePreference;
  const failures: string[] = [];

  if (forced === "auto" || forced === "tonnel") {
    try {
      const points = await fetchTonnel(catalog);
      return { source: "tonnel", points, detail: `Tonnel Marketplace · ${points.size} коллекций` };
    } catch (e) {
      failures.push(`Tonnel: ${(e as Error).message}`);
      console.warn("[market] tonnel source failed:", (e as Error).message);
    }
  }

  if (forced === "auto" || forced === "portals") {
    try {
      const points = await fetchPortals(catalog);
      return {
        source: "portals",
        points,
        detail: `Portals Marketplace · ${points.size} коллекций`,
      };
    } catch (e) {
      failures.push(`Portals: ${(e as Error).message}`);
      console.warn("[market] portals source failed:", (e as Error).message);
    }
  }

  const points = fetchSimulator(catalog);
  const suffix = failures.length ? ` · fallback (${failures.join("; ")})` : "";
  return {
    source: "simulator",
    points,
    detail: `Демо-фид · ${points.size} коллекций${suffix}`,
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
