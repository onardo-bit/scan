import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  NFT gift catalog + live market state                               */
/* ------------------------------------------------------------------ */
export const gifts = pgTable(
  "gifts",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull().unique(),
    supply: integer("supply").notNull().default(0),
    starsPrice: integer("stars_price").notNull().default(0),
    hue: integer("hue").notNull().default(200),
    floorTon: numeric("floor_ton", { mode: "number", precision: 14, scale: 3 })
      .notNull()
      .default(0),
    prevFloorTon: numeric("prev_floor_ton", { mode: "number", precision: 14, scale: 3 })
      .notNull()
      .default(0),
    lastChangePct: numeric("last_change_pct", { mode: "number", precision: 9, scale: 3 })
      .notNull()
      .default(0),
    offersCount: integer("offers_count").notNull().default(0),
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gifts_floor_idx").on(t.floorTon)],
);

/* ------------------------------------------------------------------ */
/*  Price-change history (one row per detected floor movement)         */
/* ------------------------------------------------------------------ */
export const priceHistory = pgTable(
  "price_history",
  {
    id: serial("id").primaryKey(),
    giftId: integer("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    oldPrice: numeric("old_price", { mode: "number", precision: 14, scale: 3 }).notNull(),
    newPrice: numeric("new_price", { mode: "number", precision: 14, scale: 3 }).notNull(),
    delta: numeric("delta", { mode: "number", precision: 14, scale: 3 }).notNull(),
    pct: numeric("pct", { mode: "number", precision: 9, scale: 3 }).notNull(),
    source: text("source").notNull().default("simulator"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ph_gift_idx").on(t.giftId, t.createdAt),
    index("ph_created_idx").on(t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/*  Users (web console profiles + linked Telegram chats)               */
/* ------------------------------------------------------------------ */
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  label: text("label").notNull().default("Trader"),
  telegramChatId: text("telegram_chat_id").unique(),
  role: text("role").notNull().default("user"),
  plan: text("plan").notNull().default("free"),
  planUntil: timestamp("plan_until", { withTimezone: true }),
  blocked: boolean("blocked").notNull().default(false),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  digestEnabled: boolean("digest_enabled").notNull().default(true),
  thresholdPct: numeric("threshold_pct", { mode: "number", precision: 6, scale: 2 })
    .notNull()
    .default(1),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  Favorites                                                          */
/* ------------------------------------------------------------------ */
export const favorites = pgTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    giftId: integer("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fav_uq").on(t.profileId, t.giftId),
    index("fav_profile_idx").on(t.profileId),
  ],
);

/* ------------------------------------------------------------------ */
/*  Monitoring subscriptions (which gifts a profile tracks)            */
/* ------------------------------------------------------------------ */
export const watches = pgTable(
  "watches",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    giftId: integer("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("watch_uq").on(t.profileId, t.giftId),
    index("watch_profile_idx").on(t.profileId),
    index("watch_gift_idx").on(t.giftId),
  ],
);

/* ------------------------------------------------------------------ */
/*  Price targets ("alert me when X crosses N TON")                    */
/* ------------------------------------------------------------------ */
export const priceTargets = pgTable(
  "price_targets",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    giftId: integer("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // "below" | "above"
    targetTon: numeric("target_ton", { mode: "number", precision: 14, scale: 3 }).notNull(),
    active: boolean("active").notNull().default(true),
    hits: integer("hits").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pt_gift_idx").on(t.giftId), index("pt_profile_idx").on(t.profileId)],
);

/* ------------------------------------------------------------------ */
/*  Virtual portfolio (paper positions with live P&L)                  */
/* ------------------------------------------------------------------ */
export const portfolio = pgTable(
  "portfolio",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    giftId: integer("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull().default(1),
    entryTon: numeric("entry_ton", { mode: "number", precision: 14, scale: 3 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pf_uq").on(t.profileId, t.giftId), index("pf_profile_idx").on(t.profileId)],
);

/* ------------------------------------------------------------------ */
/*  Notifications (in-app always; Telegram when chat is linked)        */
/* ------------------------------------------------------------------ */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    giftId: integer("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    historyId: integer("history_id").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    kind: text("kind").notNull().default("floor_change"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    telegramSent: boolean("telegram_sent").notNull().default(false),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notif_profile_idx").on(t.profileId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/*  Payments ledger (Telegram Stars). Charge id = ключ идемпотентности */
/* ------------------------------------------------------------------ */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    telegramChargeId: text("telegram_charge_id").notNull().unique(),
    payload: text("payload").notNull(),
    offerCode: text("offer_code").notNull(),
    months: integer("months").notNull(),
    stars: integer("stars").notNull(),
    currency: text("currency").notNull().default("XTR"),
    source: text("source").notNull().default("telegram"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pay_profile_idx").on(t.profileId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/*  Event / error log for the admin console                            */
/* ------------------------------------------------------------------ */
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    level: text("level").notNull().default("info"),
    source: text("source").notNull().default("system"),
    message: text("message").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/*  Key-value settings (monitor state, source status, bot FSM state)   */
/* ------------------------------------------------------------------ */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Gift = typeof gifts.$inferSelect;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type PriceTarget = typeof priceTargets.$inferSelect;
export type PortfolioRow = typeof portfolio.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AppEvent = typeof events.$inferSelect;
