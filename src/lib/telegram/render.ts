import type { TgMessage, InlineKeyboard } from "./api";
import type { Gift, PriceHistoryRow, Profile } from "@/db/schema";

/* Общие форматтеры (plain text, безопасно для Telegram-Markdown) ----------- */

function ton(v: number, digits = 2): string {
  return v.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function arrow(pct: number): string {
  return pct > 0 ? "▲" : pct < 0 ? "▼" : "◆";
}

function signed(v: number, digits = 2): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)}`;
}

function clock(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d) : d;
  return t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

const DIV = "──────────────────";

/* ------------------------------------------------------------------------ */
/*  Алерт (формат по ТЗ)                                                     */
/* ------------------------------------------------------------------------ */

export function renderAlertMessage(input: {
  giftName: string;
  oldPrice: number;
  newPrice: number;
  pct: number;
  at: Date;
}): { title: string; body: string } {
  const dir = input.pct >= 0 ? "▲" : "▼";
  const delta = input.newPrice - input.oldPrice;
  const title = `${dir} ИЗМЕНЕНИЕ FLOOR PRICE`;
  const body = [
    `Подарок: *${input.giftName}*`,
    ``,
    `Было: ${ton(input.oldPrice)} TON`,
    `Стало: ${ton(input.newPrice)} TON`,
    ``,
    `Изменение: ${signed(delta)} TON (${signed(input.pct, 1)}%)`,
    `Время: ${clock(input.at)}`,
  ].join("\n");
  return { title, body };
}

/* ------------------------------------------------------------------------ */
/*  Алерт по ценовой цели                                                    */
/* ------------------------------------------------------------------------ */

export function renderTargetMessage(input: {
  giftName: string;
  direction: "below" | "above";
  targetTon: number;
  nowPrice: number;
  at: Date;
}): { title: string; body: string } {
  const title = "◎ ЦЕЛЬ ДОСТИГНУТА";
  const body = [
    `Подарок: *${input.giftName}*`,
    ``,
    `Цель: ${input.direction === "below" ? "ниже" : "выше"} ${ton(input.targetTon)} TON`,
    `Текущий флор: *${ton(input.nowPrice)} TON*`,
    ``,
    `Время: ${clock(input.at)}`,
  ].join("\n");
  return { title, body };
}

/* ------------------------------------------------------------------------ */
/*  Утренняя сводка                                                          */
/* ------------------------------------------------------------------------ */

export function renderDigestMessage(input: {
  changes24h: number;
  gainers: Array<{ name: string; pct: number; floor: number }>;
  losers: Array<{ name: string; pct: number; floor: number }>;
  portfolio: { value: number; cost: number; items: number } | null;
}): { title: string; body: string } {
  const fmt = (a: Array<{ name: string; pct: number; floor: number }>) =>
    a.length
      ? a.map((g) => `${arrow(g.pct)} ${g.name} — ${ton(g.floor)} TON (${signed(g.pct, 1)}%)`)
      : ["без движения"];
  const lines = [
    `За 24ч: ${input.changes24h} ${plural(input.changes24h, "движение", "движения", "движений")} флоров`,
    ``,
    `Лидеры роста:`,
    ...fmt(input.gainers),
    ``,
    `Лидеры падения:`,
    ...fmt(input.losers),
  ];
  if (input.portfolio) {
    const pnl = input.portfolio.value - input.portfolio.cost;
    const pct = input.portfolio.cost > 0 ? (pnl / input.portfolio.cost) * 100 : 0;
    lines.push(
      ``,
      `Ваш портфель: *${ton(input.portfolio.value)} TON*`,
      `P&L: ${signed(pnl)} TON (${signed(pct, 1)}%)`,
    );
  }
  return { title: "◈ УТРЕННЯЯ СВОДКА РЫНКА", body: lines.join("\n") };
}

/* ------------------------------------------------------------------------ */
/*  Главное меню                                                             */
/* ------------------------------------------------------------------------ */

export function mainMenu(snapshot: {
  collectionCount: number;
  lastScan: string;
  sourceName: string;
}): TgMessage {
  const text = [
    "*NFT-СКАНЕР ПОДАРКОВ*",
    DIV,
    `Отслеживаю *${snapshot.collectionCount}* ${plural(snapshot.collectionCount, "коллекцию", "коллекции", "коллекций")}.`,
    `Источник: \`${snapshot.sourceName}\` · Последний скан: ${snapshot.lastScan}`,
    ``,
    `Выберите раздел:`,
  ].join("\n");
  const keyboard: InlineKeyboard = [
    [
      { text: "NFT-флоры", callback_data: "nav:cat" },
      { text: "Поиск подарка", callback_data: "nav:search" },
    ],
    [
      { text: "Мониторинг цен", callback_data: "nav:monitor" },
      { text: "Избранное", callback_data: "nav:favs" },
    ],
    [
      { text: "Мой портфель", callback_data: "nav:portfolio" },
      { text: "Ценовые цели", callback_data: "nav:targets" },
    ],
    [
      { text: "История изменений", callback_data: "nav:hist" },
      { text: "Настройки", callback_data: "nav:settings" },
    ],
    [
      { text: "✦ Premium", callback_data: "nav:premium" },
      { text: "Помощь", callback_data: "nav:help" },
    ],
  ];
  return { text, keyboard };
}

/* ------------------------------------------------------------------------ */
/*  Каталог                                                                  */
/* ------------------------------------------------------------------------ */

export const SORT_LABELS: Record<string, string> = {
  price_asc: "Цена ↑",
  price_desc: "Цена ↓",
  offers_desc: "Офферы",
  name: "А–Я",
};

export function catalogMessage(args: {
  items: Gift[];
  page: number;
  totalPages: number;
  sort: string;
  total: number;
}): TgMessage {
  const { items, page, totalPages, sort, total } = args;
  const lines = items.map(
    (g, i) =>
      `*${page * items.length + i + 1}.* ${g.name} — *${ton(Number(g.floorTon))} TON*  ${arrow(
        Number(g.lastChangePct),
      )}${signed(Number(g.lastChangePct), 1)}%`,
  );
  const text = [
    `*NFT-ФЛОРЫ*  (${total} ${plural(total, "коллекция", "коллекции", "коллекций")})`,
    `Сортировка: ${SORT_LABELS[sort] ?? sort} · Стр. ${page + 1}/${totalPages}`,
    DIV,
    ...lines,
  ].join("\n");

  const keyboard: InlineKeyboard = [];
  for (let r = 0; r < items.length; r += 2) {
    const row = items.slice(r, r + 2).map((g) => ({
      text: `${g.name} · ${ton(Number(g.floorTon))}`,
      callback_data: `gift:${g.id}`,
    }));
    keyboard.push(row);
  }
  keyboard.push(
    (Object.keys(SORT_LABELS) as string[])
      .filter((s) => s !== sort)
      .slice(0, 3)
      .map((s) => ({ text: SORT_LABELS[s], callback_data: `cat:0:${s}` })),
  );
  const nav: { text: string; callback_data: string }[] = [];
  if (page > 0) nav.push({ text: "← Назад", callback_data: `cat:${page - 1}:${sort}` });
  nav.push({ text: "Обновить", callback_data: `cat:${page}:${sort}` });
  if (page < totalPages - 1)
    nav.push({ text: "Вперёд →", callback_data: `cat:${page + 1}:${sort}` });
  keyboard.push(nav, [{ text: "← Главное меню", callback_data: "nav:menu" }]);
  return { text, keyboard };
}

/* ------------------------------------------------------------------------ */
/*  Карточка подарка                                                         */
/* ------------------------------------------------------------------------ */

export function giftMessage(
  g: Gift,
  opts: { isFav: boolean; isWatch: boolean; spark: string },
): TgMessage {
  const pct = Number(g.lastChangePct);
  const text = [
    `*${g.name}*`,
    DIV,
    `Флор: *${ton(Number(g.floorTon))} TON*`,
    `Было: ${ton(Number(g.prevFloorTon))} TON  ${arrow(pct)}${signed(pct, 1)}%`,
    `Офферов на рынке: ${g.offersCount || "—"}`,
    `Всего выпущено: ${g.supply.toLocaleString("ru-RU")}`,
    `Цена минта: ${g.starsPrice.toLocaleString("ru-RU")} Stars`,
    `Тренд: \`${opts.spark}\``,
    DIV,
    `Последний скан: ${clock(g.lastScanAt)}`,
  ].join("\n");

  const keyboard: InlineKeyboard = [
    [
      {
        text: opts.isFav ? "★ Убрать из избранного" : "☆ В избранное",
        callback_data: `fav:${g.id}`,
      },
    ],
    [
      {
        text: opts.isWatch ? "Прекратить трекинг" : "Отслеживать флор",
        callback_data: `watch:${g.id}`,
      },
    ],
    [
      { text: "Цель по цене", callback_data: `tgt:${g.id}` },
      { text: "В портфель", callback_data: `ptf:${g.id}` },
    ],
    [
      { text: "История цен", callback_data: `hsg:${g.id}:0` },
      { text: "Обновить", callback_data: `gift:${g.id}` },
    ],
    [
      { text: "← Флоры", callback_data: "nav:cat" },
      { text: "← Меню", callback_data: "nav:menu" },
    ],
  ];
  return { text, keyboard };
}

/* ------------------------------------------------------------------------ */
/*  Поиск                                                                    */
/* ------------------------------------------------------------------------ */

export function searchPromptMessage(): TgMessage {
  return {
    text: [
      "*ПОИСК ПОДАРКА*",
      DIV,
      "Отправьте название подарка или его часть, например `bear`.",
    ].join("\n"),
    keyboard: [[{ text: "Отмена", callback_data: "nav:menu" }]],
  };
}

export function searchResultsMessage(q: string, items: Gift[]): TgMessage {
  if (!items.length) {
    return {
      text: [`*ПОИСК: «${q}»*`, DIV, "Ничего не найдено. Попробуйте другое название."].join("\n"),
      keyboard: [
        [{ text: "Новый поиск", callback_data: "nav:search" }],
        [{ text: "← Главное меню", callback_data: "nav:menu" }],
      ],
    };
  }
  const text = [
    `*ПОИСК: «${q}»*`,
    `${items.length} ${plural(items.length, "совпадение", "совпадения", "совпадений")}`,
    DIV,
    ...items.map((g) => `${g.name} — *${ton(Number(g.floorTon))} TON*`),
  ].join("\n");
  const keyboard: InlineKeyboard = items.slice(0, 8).map((g) => [
    { text: `${g.name} · ${ton(Number(g.floorTon))} TON`, callback_data: `gift:${g.id}` },
  ]);
  keyboard.push(
    [{ text: "Новый поиск", callback_data: "nav:search" }],
    [{ text: "← Главное меню", callback_data: "nav:menu" }],
  );
  return { text, keyboard };
}

/* ------------------------------------------------------------------------ */
/*  Мониторинг / избранное                                                   */
/* ------------------------------------------------------------------------ */

export function monitorMessage(items: Gift[], enabled: boolean): TgMessage {
  const head = [
    "*МОНИТОРИНГ ЦЕН*",
    `Алерты: ${enabled ? "*ВКЛ*" : "*ВЫКЛ*"} · отслеживается: ${items.length}`,
    DIV,
  ];
  const lines = items.length
    ? items.map(
        (g) =>
          `${g.name} — *${ton(Number(g.floorTon))} TON*  ${arrow(Number(g.lastChangePct))}${signed(
            Number(g.lastChangePct),
            1,
          )}%`,
      )
    : ["Вы пока ничего не отслеживаете.", "Откройте подарок и нажмите *Отслеживать флор*."];
  const keyboard: InlineKeyboard = items.slice(0, 6).map((g) => [
    { text: `${g.name} · ${ton(Number(g.floorTon))}`, callback_data: `gift:${g.id}` },
    { text: "✕", callback_data: `watch:${g.id}` },
  ]);
  keyboard.push(
    [{ text: enabled ? "Приостановить алерты" : "Возобновить алерты", callback_data: "set:notif" }],
    [
      { text: "Все флоры", callback_data: "nav:cat" },
      { text: "← Меню", callback_data: "nav:menu" },
    ],
  );
  return { text: [...head, ...lines].join("\n"), keyboard };
}

export function favoritesMessage(items: Gift[]): TgMessage {
  const lines = items.length
    ? items.map(
        (g) =>
          `${g.name} — *${ton(Number(g.floorTon))} TON*  ${arrow(Number(g.lastChangePct))}${signed(
            Number(g.lastChangePct),
            1,
          )}%`,
      )
    : ["Избранное пусто.", "Откройте подарок и нажмите *В избранное*."];
  const keyboard: InlineKeyboard = items.slice(0, 6).map((g) => [
    { text: `${g.name} · ${ton(Number(g.floorTon))}`, callback_data: `gift:${g.id}` },
    { text: "✕", callback_data: `fav:${g.id}` },
  ]);
  keyboard.push([{ text: "← Главное меню", callback_data: "nav:menu" }]);
  return { text: ["*ИЗБРАННОЕ*", DIV, ...lines].join("\n"), keyboard };
}

/* ------------------------------------------------------------------------ */
/*  История                                                                  */
/* ------------------------------------------------------------------------ */

export function historyMessage(args: {
  rows: Array<PriceHistoryRow & { giftName: string }>;
  page: number;
  totalPages: number;
  giftName?: string;
  giftId?: number;
}): TgMessage {
  const { rows, page, totalPages, giftName, giftId } = args;
  const lines = rows.length
    ? rows.map(
        (r) =>
          `${arrow(Number(r.pct))} ${r.giftName}: ${ton(Number(r.oldPrice))} → *${ton(
            Number(r.newPrice),
          )}*  (${signed(Number(r.pct), 1)}%) · ${clock(r.createdAt)}`,
      )
    : ["Изменений флоров пока не зафиксировано."];
  const keyboard: InlineKeyboard = [];
  const nav: { text: string; callback_data: string }[] = [];
  const base = giftId ? `hsg:${giftId}` : "hist";
  if (page > 0) nav.push({ text: "← Назад", callback_data: `${base}:${page - 1}` });
  if (page < totalPages - 1) nav.push({ text: "Вперёд →", callback_data: `${base}:${page + 1}` });
  if (nav.length) keyboard.push(nav);
  keyboard.push(
    giftId
      ? [{ text: "← К подарку", callback_data: `gift:${giftId}` }]
      : [{ text: "← Главное меню", callback_data: "nav:menu" }],
  );
  return {
    text: [
      giftName ? `*ИСТОРИЯ — ${giftName.toUpperCase()}*` : "*ПОСЛЕДНИЕ ИЗМЕНЕНИЯ*",
      `Стр. ${page + 1}/${Math.max(totalPages, 1)}`,
      DIV,
      ...lines,
    ].join("\n"),
    keyboard,
  };
}

/* ------------------------------------------------------------------------ */
/*  Портфель и ценовые цели                                                  */
/* ------------------------------------------------------------------------ */

export interface PortfolioLine {
  giftId: number;
  name: string;
  qty: number;
  entry: number;
  floor: number;
}

export function portfolioMessage(rows: PortfolioLine[]): TgMessage {
  const value = rows.reduce((s, r) => s + r.qty * r.floor, 0);
  const cost = rows.reduce((s, r) => s + r.qty * r.entry, 0);
  const pnl = value - cost;
  const pct = cost > 0 ? (pnl / cost) * 100 : 0;

  const lines = rows.length
    ? rows.map((r) => {
        const d = (r.floor - r.entry) * r.qty;
        const dp = r.entry > 0 ? ((r.floor - r.entry) / r.entry) * 100 : 0;
        return `${r.name} ×${r.qty} — *${ton(r.qty * r.floor)} TON*  (${d >= 0 ? "+" : ""}${ton(d, 2)} / ${signed(dp, 1)}%)`;
      })
    : ["Портфель пуст.", "Откройте подарок и нажмите *В портфель* — цена входа зафиксируется."];
  const text = [
    "*МОЙ ПОРТФЕЛЬ*",
    rows.length
      ? `Оценка: *${ton(value)} TON* · P&L: ${signed(pnl)} TON (${signed(pct, 1)}%)`
      : "Виртуальный учёт позиций по живым флорам",
    DIV,
    ...lines,
  ].join("\n");

  const keyboard: InlineKeyboard = rows.slice(0, 6).map((r) => [
    { text: `${r.name} ×${r.qty}`, callback_data: `gift:${r.giftId}` },
    { text: "✕", callback_data: `ptf_del:${r.giftId}` },
  ]);
  keyboard.push(
    [
      { text: "Каталог", callback_data: "nav:cat" },
      { text: "← Меню", callback_data: "nav:menu" },
    ],
  );
  return { text, keyboard };
}

export interface TargetLine {
  id: number;
  giftId: number;
  name: string;
  direction: "below" | "above";
  targetTon: number;
  floor: number;
  active: boolean;
}

export function targetsMessage(rows: TargetLine[]): TgMessage {
  const lines = rows.length
    ? rows.map(
        (r) =>
          `${r.active ? "◌" : "◉"} ${r.name} — ${r.direction === "below" ? "ниже" : "выше"} *${ton(
            r.targetTon,
          )}* (сейчас ${ton(r.floor)})${r.active ? "" : " — сработала"}`,
      )
    : ["Активных целей нет.", "Откройте подарок и нажмите *Цель по цене*."];
  const keyboard: InlineKeyboard = rows
    .filter((r) => r.active)
    .slice(0, 6)
    .map((r) => [
      { text: `${r.name}`, callback_data: `gift:${r.giftId}` },
      { text: "✕", callback_data: `tg_del:${r.id}` },
    ]);
  keyboard.push([
    { text: "Каталог", callback_data: "nav:cat" },
    { text: "← Меню", callback_data: "nav:menu" },
  ]);
  return {
    text: ["*МОИ ЦЕНОВЫЕ ЦЕЛИ*", "Алерт сработает один раз при пересечении порога", DIV, ...lines].join("\n"),
    keyboard,
  };
}

export function targetDirectionPrompt(giftName: string, giftId: number, floor: number): TgMessage {
  return {
    text: [
      `*ЦЕЛЬ ПО ЦЕНЕ — ${giftName.toUpperCase()}*`,
      `Сейчас флор: *${ton(floor)} TON*`,
      DIV,
      "Когда прислать алерт?",
    ].join("\n"),
    keyboard: [
      [
        { text: "Флор упадёт НИЖЕ…", callback_data: `tgtd:${giftId}:below` },
        { text: "Флор вырастет ВЫШЕ…", callback_data: `tgtd:${giftId}:above` },
      ],
      [{ text: "← К подарку", callback_data: `gift:${giftId}` }],
    ],
  };
}

export function targetPricePrompt(giftName: string, direction: "below" | "above"): TgMessage {
  return {
    text: [
      `*${giftName}* — алерт при флоре ${direction === "below" ? "НИЖЕ" : "ВЫШЕ"}:`,
      DIV,
      "Отправьте цену в TON, например `18.5`.",
    ].join("\n"),
    keyboard: [[{ text: "Отмена", callback_data: "nav:menu" }]],
  };
}

export function portfolioQtyPrompt(giftName: string, floor: number): TgMessage {
  return {
    text: [
      `*В ПОРТФЕЛЬ — ${giftName.toUpperCase()}*`,
      `Текущий флор: *${ton(floor)} TON* (будет ценой входа)`,
      DIV,
      "Сколько штук добавить? Отправьте число, например `3`.",
    ].join("\n"),
    keyboard: [[{ text: "Отмена", callback_data: "nav:menu" }]],
  };
}

/* ------------------------------------------------------------------------ */
/*  Premium                                                                  */
/* ------------------------------------------------------------------------ */

export function premiumMessage(input: {
  isPremium: boolean;
  daysLeft: number | null;
  offers: Array<{ code: string; title: string; stars: number; savePct?: number; badge?: string }>;
  features: string[];
  usage: { watches: string; targets: string; portfolio: string; favorites: string };
}): TgMessage {
  const head = input.isPremium
    ? [
        "*PREMIUM АКТИВЕН* ✦",
        DIV,
        `Осталось: *${input.daysLeft ?? 0}* ${plural(input.daysLeft ?? 0, "день", "дня", "дней")}`,
        `Все лимиты сняты. Спасибо за поддержку!`,
        ``,
        `Ваше использование:`,
        `• подарков: ${input.usage.watches}`,
        `• целей: ${input.usage.targets}`,
        `• портфель: ${input.usage.portfolio}`,
      ]
    : [
        "*GIFTSCOPE PREMIUM*",
        DIV,
        "Бесплатный тариф ограничен. Ваше использование:",
        `• подарков: ${input.usage.watches}`,
        `• целей: ${input.usage.targets}`,
        `• портфель: ${input.usage.portfolio}`,
        `• избранное: ${input.usage.favorites}`,
        ``,
        "*Что даёт Premium:*",
        ...input.features.map((f) => `• ${f}`),
        ``,
        "Оплата — звёздами Telegram, прямо в чате.",
      ];

  const keyboard: InlineKeyboard = input.isPremium
    ? [
        ...input.offers.map((o) => [
          { text: `Продлить: ${o.title} — ${o.stars} ⭐`, callback_data: `buy:${o.code}` },
        ]),
        [{ text: "← Главное меню", callback_data: "nav:menu" }],
      ]
    : [
        ...input.offers.map((o) => [
          {
            text: `${o.title} — ${o.stars} ⭐${o.savePct ? ` (−${o.savePct}%)` : ""}`,
            callback_data: `buy:${o.code}`,
          },
        ]),
        [{ text: "← Главное меню", callback_data: "nav:menu" }],
      ];

  return { text: [...head].join("\n"), keyboard };
}

export function limitReachedMessage(reason: string): TgMessage {
  return {
    text: ["*ДОСТИГНУТ ЛИМИТ*", DIV, reason].join("\n"),
    keyboard: [
      [{ text: "✦ Оформить Premium", callback_data: "nav:premium" }],
      [{ text: "← Меню", callback_data: "nav:menu" }],
    ],
  };
}

export function paymentSuccessMessage(months: number, until: Date): TgMessage {
  return {
    text: [
      "*PREMIUM АКТИВИРОВАН* ✦",
      DIV,
      `Оплачено: ${months} ${plural(months, "месяц", "месяца", "месяцев")}`,
      `Действует до: *${until.toLocaleDateString("ru-RU")}*`,
      ``,
      "Все лимиты сняты. Приятной торговли!",
    ].join("\n"),
    keyboard: [
      [{ text: "Мой портфель", callback_data: "nav:portfolio" }],
      [{ text: "← Главное меню", callback_data: "nav:menu" }],
    ],
  };
}

/* ------------------------------------------------------------------------ */
/*  Настройки / помощь / админ                                               */
/* ------------------------------------------------------------------------ */

export function settingsMessage(p: Profile): TgMessage {
  const text = [
    "*НАСТРОЙКИ*",
    DIV,
    `Уведомления: ${p.notificationsEnabled ? "*ВКЛ*" : "*ВЫКЛ*"}`,
    `Утренняя сводка: ${p.digestEnabled ? "*ВКЛ*" : "*ВЫКЛ*"}`,
    `Порог алерта: *${Number(p.thresholdPct)}%* мин. изменение`,
    `Избранное и трекинг хранятся отдельно для каждого пользователя.`,
  ].join("\n");
  const keyboard: InlineKeyboard = [
    [
      {
        text: p.notificationsEnabled ? "Выключить алерты" : "Включить алерты",
        callback_data: "set:notif",
      },
    ],
    [
      {
        text: p.digestEnabled ? "Выключить утреннюю сводку" : "Включить утреннюю сводку",
        callback_data: "set:digest",
      },
    ],
    [
      { text: "0.5%", callback_data: "set:th:0.5" },
      { text: "1%", callback_data: "set:th:1" },
      { text: "3%", callback_data: "set:th:3" },
      { text: "5%", callback_data: "set:th:5" },
    ],
    [{ text: "← Главное меню", callback_data: "nav:menu" }],
  ];
  return { text, keyboard };
}

export function helpMessage(): TgMessage {
  return {
    text: [
      "*ПОМОЩЬ*",
      DIV,
      "Бот отслеживает *флоры* NFT-подарков Telegram и присылает алерт при каждом изменении.",
      ``,
      "• *NFT-флоры* — каталог с актуальными ценами, офферами и сортировкой",
      "• *Поиск подарка* — нечёткий поиск по названию",
      "• *Мониторинг цен* — отслеживаемые подарки + мгновенные алерты",
      "• *Ценовые цели* — алерт, когда флор пересечёт ваш порог",
      "• *Мой портфель* — виртуальные позиции с живой оценкой и P&L",
      "• *Избранное* — быстрый доступ к сохранённым коллекциям",
      "• *История изменений* — каждое зафиксированное движение флора",
      "• *Настройки* — алерты вкл/выкл, порог чувствительности",
      ``,
      "Каждое утро — сводка рынка: топ-движения за 24ч и оценка вашего портфеля.",
      ``,
      "Команды: /catalog · /search · /monitor · /portfolio · /targets · /favorites · /history · /settings · /help",
    ].join("\n"),
    keyboard: [[{ text: "← Главное меню", callback_data: "nav:menu" }]],
  };
}

export function adminMessage(stats: {
  users: number;
  active24h: number;
  linked: number;
  blocked: number;
  trackedGifts: number;
  changes24h: number;
  errors: number;
  intervalMin: number;
  monitorEnabled: boolean;
  sourceName: string;
  sourcePreference: string;
  sourceOk: boolean;
  lastTick: string;
}): TgMessage {
  return {
    text: [
      "*АДМИН-ПАНЕЛЬ*",
      DIV,
      `Движок: ${stats.monitorEnabled ? "*РАБОТАЕТ*" : "*НА ПАУЗЕ*"} · тик каждые ${stats.intervalMin} мин`,
      `Источник: ${stats.sourceName} (${stats.sourcePreference}) ${stats.sourceOk ? "✓" : "⚠"}`,
      ``,
      `Пользователей: *${stats.users}* · активны 24ч: ${stats.active24h}`,
      `Telegram: ${stats.linked} · заблокировано: ${stats.blocked}`,
      `Коллекций: ${stats.trackedGifts} · движений 24ч: ${stats.changes24h}`,
      `Ошибок в журнале: ${stats.errors}`,
      `Последний тик: ${stats.lastTick}`,
    ].join("\n"),
    keyboard: [
      [
        { text: "1 мин", callback_data: "adm:int:60" },
        { text: "2 мин", callback_data: "adm:int:120" },
        { text: "5 мин", callback_data: "adm:int:300" },
        { text: "10 мин", callback_data: "adm:int:600" },
      ],
      [
        { text: "Авто", callback_data: "adm:src:auto" },
        { text: "Tonnel", callback_data: "adm:src:tonnel" },
        { text: "Portals", callback_data: "adm:src:portals" },
        { text: "Demo", callback_data: "adm:src:simulator" },
      ],
      [
        {
          text: stats.monitorEnabled ? "Пауза сканера" : "Запустить сканер",
          callback_data: "adm:toggle",
        },
        { text: "Скан сейчас", callback_data: "adm:tick" },
      ],
      [
        { text: "Пользователи", callback_data: "adm:users" },
        { text: "Рассылка", callback_data: "adm:broadcast" },
      ],
      [
        { text: "Тест Telegram", callback_data: "adm:test" },
        { text: "Обновить", callback_data: "nav:admin" },
      ],
      [{ text: "← Главное меню", callback_data: "nav:menu" }],
    ],
  };
}

export function sparkline(values: number[]): string {
  if (!values.length) return "—";
  const chars = "▁▂▃▄▅▆▇█";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v) => chars[Math.round(((v - min) / span) * (chars.length - 1))])
    .join("");
}
