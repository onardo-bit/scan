import { NextRequest, NextResponse } from "next/server";
import { asc, ilike } from "drizzle-orm";
import { db } from "@/db";
import { gifts } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ items: [] });

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const items = await db
    .select()
    .from(gifts)
    .where(ilike(gifts.name, like))
    .orderBy(asc(gifts.floorTon))
    .limit(12);

  return NextResponse.json({ items });
}
