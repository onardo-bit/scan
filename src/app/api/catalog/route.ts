import { NextRequest, NextResponse } from "next/server";
import { asc, desc, count, ilike } from "drizzle-orm";
import { db } from "@/db";
import { gifts } from "@/db/schema";
import { ensureSeed } from "@/lib/market/ensure";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export async function GET(req: NextRequest) {
  await ensureSeed();
  const sp = req.nextUrl.searchParams;
  const sort = sp.get("sort") ?? "price_asc";
  const q = (sp.get("q") ?? "").trim();
  const pageRaw = Number(sp.get("page") ?? "0");

  const where = q ? ilike(gifts.name, `%${q.replace(/[%_]/g, "")}%`) : undefined;

  const [{ value: total }] = await db.select({ value: count() }).from(gifts).where(where);
  const totalPages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));
  const page = Math.min(Math.max(0, Number.isFinite(pageRaw) ? pageRaw : 0), totalPages - 1);

  const order =
    sort === "price_desc"
      ? [desc(gifts.floorTon)]
      : sort === "offers_desc"
        ? [desc(gifts.offersCount)]
        : sort === "change_desc"
          ? [desc(gifts.lastChangePct)]
          : sort === "change_asc"
            ? [asc(gifts.lastChangePct)]
            : sort === "name"
              ? [asc(gifts.name)]
              : [asc(gifts.floorTon)];

  const items = await db
    .select()
    .from(gifts)
    .where(where)
    .orderBy(...order, asc(gifts.id))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  return NextResponse.json({
    items,
    total: Number(total),
    pages: totalPages,
    page,
    pageSize: PAGE_SIZE,
  });
}
