"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Layers,
  Search,
  Radar,
  Star,
  History,
  Bell,
  Settings,
  ShieldCheck,
  Bot,
  RefreshCw,
  Rocket,
  Sparkles,
  Briefcase,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { ProfileProvider, useProfile } from "./profile";
import { cn, fmtTon, fmtPct } from "@/lib/util/format";

const NAV = [
  { href: "/", label: "Дашборд", icon: LayoutDashboard },
  { href: "/catalog", label: "NFT-флоры", icon: Layers },
  { href: "/search", label: "Поиск", icon: Search },
  { href: "/monitor", label: "Мониторинг", icon: Radar },
  { href: "/portfolio", label: "Портфель", icon: Briefcase },
  { href: "/favorites", label: "Избранное", icon: Star },
  { href: "/history", label: "История", icon: History },
  { href: "/alerts", label: "Уведомления", icon: Bell },
  { href: "/premium", label: "Premium", icon: Sparkles },
  { href: "/bot", label: "Telegram-бот", icon: Bot },
  { href: "/deploy", label: "Деплой", icon: Rocket },
  { href: "/settings", label: "Настройки", icon: Settings },
  { href: "/admin", label: "Админ", icon: ShieldCheck },
];

const MOBILE = ["/", "/catalog", "/monitor", "/favorites", "/bot"];

interface TickerItem {
  name: string;
  floorTon: number;
  lastChangePct: number;
}

function Ticker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/catalog?sort=name&page=0", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (alive && d.items) setItems(d.items);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!items.length) {
    return (
      <div className="border-b border-[color:var(--color-line)] px-4 py-2 font-mono text-[11px] text-[color:var(--color-faint)]">
        подключение к рыночному фиду…
      </div>
    );
  }

  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-b border-[color:var(--color-line)] bg-[rgba(8,13,24,0.7)]">
      <div className="marquee-track flex w-max items-center gap-8 px-4 py-2">
        {doubled.map((it, i) => {
          const up = it.lastChangePct > 0;
          return (
            <span key={i} className="flex items-center gap-2 font-mono text-[11px]">
              <span className="font-semibold text-[color:var(--color-dim)]">{it.name}</span>
              <span className="tabular-nums text-ink">{fmtTon(it.floorTon)} TON</span>
              <span
                className={cn(
                  "flex items-center gap-0.5 tabular-nums",
                  up ? "text-emerald-300" : it.lastChangePct < 0 ? "text-rose-300" : "text-[color:var(--color-faint)]",
                )}
              >
                {up ? <TrendingUp size={11} /> : it.lastChangePct < 0 ? <TrendingDown size={11} /> : null}
                {fmtPct(it.lastChangePct)}
              </span>
            </span>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#04070d] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#04070d] to-transparent" />
    </div>
  );
}

function TopBar() {
  const { profile } = useProfile();
  const [scanning, setScanning] = useState(false);
  const [sourceName, setSourceName] = useState("…");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/monitor", { cache: "no-store" });
        const d = await r.json();
        if (alive && d.source?.name) setSourceName(d.source.name);
      } catch {
        /* noop */
      }
    };
    load();
    const t = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/notifications?profileId=${profile.id}`, { cache: "no-store" });
        const d = await r.json();
        if (alive) setUnread(d.unread ?? 0);
      } catch {
        /* noop */
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [profile]);

  const runScan = async () => {
    setScanning(true);
    try {
      await fetch("/api/monitor", { method: "POST" });
      window.dispatchEvent(new Event("scanner:refresh"));
    } finally {
      setTimeout(() => setScanning(false), 900);
    }
  };

  return (
    <div className="sticky top-0 z-40 border-b border-[color:var(--color-line)] bg-[rgba(4,7,13,0.82)] backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-2.5 md:px-8">
        <Link href="/" className="flex items-center gap-2 lg:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-emerald-300 text-[#04121f]">
            <Radar size={15} strokeWidth={2.5} />
          </span>
          <span className="text-sm font-bold tracking-tight">GiftScope</span>
        </Link>

        <div className="hidden items-center gap-2 lg:flex">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-300" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-dim)]">
            источник: {sourceName}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={runScan}
            className="glass glass-hover flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-[color:var(--color-dim)]"
            title="Запустить сканирование рынка"
          >
            <RefreshCw size={12} className={scanning ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{scanning ? "Сканирую…" : "Сканировать"}</span>
          </button>

          <Link
            href="/alerts"
            className="glass glass-hover relative flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-dim)]"
            title="Уведомления"
          >
            <Bell size={14} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-400 px-1 font-mono text-[9px] font-bold text-[#10030a]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>

          <Link
            href="/settings"
            className="glass glass-hover hidden items-center gap-2 rounded-full py-1 pl-2 pr-3 sm:flex"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-400/70 to-sky-400/70 font-mono text-[9px] font-bold text-[#0a0f1a]">
              {(profile?.label ?? "…").slice(0, 2).toUpperCase()}
            </span>
            <span className="max-w-24 truncate text-[11px] font-medium text-[color:var(--color-dim)]">
              {profile?.label ?? "загрузка"}
            </span>
          </Link>
        </div>
      </div>
      <Ticker />
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[color:var(--color-line)] bg-[rgba(6,10,19,0.9)] px-3 py-5 backdrop-blur-xl lg:flex">
      <Link href="/" className="mb-7 flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-emerald-300 text-[#04121f] shadow-[0_8px_24px_-6px_rgba(85,184,255,0.5)]">
          <Radar size={18} strokeWidth={2.5} />
        </span>
        <div>
          <div className="text-[15px] font-bold leading-none tracking-tight">GiftScope</div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-faint)]">
            Маркет-сканер NFT
          </div>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-gradient-to-r from-sky-400/15 to-emerald-300/8 text-ink shadow-[inset_0_0_0_1px_rgba(85,184,255,0.22)]"
                  : "text-[color:var(--color-dim)] hover:bg-white/4 hover:text-ink",
              )}
            >
              <n.icon
                size={16}
                strokeWidth={2.2}
                className={active ? "text-sky-300" : "text-[color:var(--color-faint)] group-hover:text-[color:var(--color-dim)]"}
              />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-[color:var(--color-line)] bg-[rgba(10,16,30,0.6)] p-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-faint)]">
          Движок
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[color:var(--color-dim)]">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-300" />
          слежение за флорами 24/7
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-[color:var(--color-faint)]">
          tonnel · portals · demo
        </div>
      </div>
    </aside>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-[color:var(--color-line)] bg-[rgba(6,10,19,0.94)] px-1 py-2 backdrop-blur-xl lg:hidden">
      {MOBILE.map((href) => {
        const n = NAV.find((x) => x.href === href)!;
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-3 py-1",
              active ? "text-sky-300" : "text-[color:var(--color-faint)]",
            )}
          >
            <n.icon size={17} strokeWidth={2.2} />
            <span className="text-[9px] font-medium">{n.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <div className="grid-bg fixed inset-x-0 top-0 h-[520px] pointer-events-none" />
      <Sidebar />
      <div className="relative min-h-screen lg:pl-60">
        <TopBar />
        <main>{children}</main>
      </div>
      <MobileNav />
    </ProfileProvider>
  );
}
