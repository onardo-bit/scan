"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  BellRing,
  CheckCircle2,
  CircleAlert,
  Database,
  Download,
  Gauge,
  Info,
  KeyRound,
  Layers,
  MessageSquare,
  Pause,
  Play,
  PlugZap,
  Radio,
  RefreshCw,
  RotateCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Trash,
  UserCheck,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { PageShell, Chip } from "@/components/ui";
import { cn, timeAgo } from "@/lib/util/format";

const CODE_KEY = "giftscope-admin-code";
type Tab = "overview" | "users" | "broadcast" | "logs";
type SourcePreference = "auto" | "tonnel" | "portals" | "simulator";

interface AdminUser {
  id: string;
  label: string;
  telegramChatId: string | null;
  role: string;
  blocked: boolean;
  planView?: { plan: string; isPremium: boolean; daysLeft: number | null };
  notificationsEnabled: boolean;
  digestEnabled: boolean;
  thresholdPct: number;
  lastSeenAt: string;
  createdAt: string;
  watches: number;
  favorites: number;
  targets: number;
  positions: number;
}

interface AdminData {
  stats: {
    users: number;
    active24h: number;
    linkedTelegram: number;
    blocked: number;
    premium: number;
    collections: number;
    subscriptions: number;
    favorites: number;
    targets: number;
    positions: number;
    changes24h: number;
    alerts24h: number;
  };
  monitor: {
    intervalSec: number;
    enabled: boolean;
    running: boolean;
    lastTickAt: string | null;
    lastTickSummary: {
      scanned: number;
      changed: number;
      notified: number;
      durationMs: number;
      source: string;
      error?: string;
    } | null;
  };
  source: { name: string; ok: boolean; detail: string; at: string } | null;
  sourcePreference: SourcePreference;
  users: AdminUser[];
  events: Array<{
    id: number;
    level: string;
    source: string;
    message: string;
    createdAt: string;
  }>;
  telegram: {
    tokenConfigured: boolean;
    adminChat: boolean;
    polling: boolean;
  };
}

export default function AdminPage() {
  const [code, setCode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [audience, setAudience] = useState<"all" | "active" | "admins">("all");
  const [purgeDays, setPurgeDays] = useState(90);

  const load = useCallback(async (c: string) => {
    try {
      const r = await fetch("/api/admin", {
        headers: { "x-admin-code": c },
        cache: "no-store",
      });
      if (r.status === 401) {
        setAuthed(false);
        setError("Неверный admin-код");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as AdminData;
      setData(d);
      setAuthed(true);
      setError("");
    } catch (e) {
      setError(`Ошибка запроса: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(CODE_KEY);
    if (saved) {
      setCode(saved);
      void load(saved);
    }
  }, [load]);

  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => void load(code), 20_000);
    return () => clearInterval(t);
  }, [authed, code, load]);

  const submit = () => {
    localStorage.setItem(CODE_KEY, code);
    void load(code);
  };

  const action = async (body: Record<string, unknown>, success?: string) => {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": code },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error ?? `HTTP ${r.status}`);
      setNotice(success ?? "Готово");
      await load(code);
      return result;
    } catch (e) {
      setNotice(`Ошибка: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin?export=json", {
        headers: { "x-admin-code": code },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `giftscope-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Резервная копия скачана");
    } catch (e) {
      setNotice(`Ошибка экспорта: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return data?.users ?? [];
    return (data?.users ?? []).filter(
      (u) =>
        u.label.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        (u.telegramChatId ?? "").includes(q),
    );
  }, [data?.users, userQuery]);

  if (!authed) {
    return (
      <PageShell title="Админ-консоль" subtitle="Зона операций, доступная только владельцу">
        <div className="glass mx-auto max-w-sm rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={15} className="text-amber-300" /> Введите admin-код
          </div>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="env ADMIN_CODE"
            className="input-dark w-full rounded-xl px-3.5 py-2.5 font-mono text-sm"
          />
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          <button onClick={submit} className="btn-glow mt-4 w-full rounded-xl py-2.5 text-sm">
            Открыть консоль
          </button>
          <p className="mt-3 text-center font-mono text-[10px] text-[color:var(--color-faint)]">
            По умолчанию: demo-admin · в проде обязательно задайте ADMIN_CODE
          </p>
        </div>
      </PageShell>
    );
  }

  if (!data) return null;
  const s = data.stats;
  const summary = data.monitor.lastTickSummary;

  return (
    <PageShell
      title="Админ-консоль"
      subtitle="Управление системой, пользователями, рассылками и данными"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void exportData()}
            disabled={busy}
            className="glass glass-hover flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs text-[color:var(--color-dim)] disabled:opacity-40"
          >
            <Download size={13} /> Экспорт
          </button>
          <button
            onClick={() => void action({ action: "run_tick" }, "Скан завершён")}
            disabled={busy}
            className="btn-glow flex items-center gap-1.5 rounded-full px-4 py-2 text-xs disabled:opacity-50"
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Скан сейчас
          </button>
        </div>
      }
    >
      {notice && (
        <div
          className={cn(
            "mb-4 rounded-xl border px-4 py-2.5 text-xs",
            notice.startsWith("Ошибка")
              ? "border-rose-400/25 bg-rose-400/8 text-rose-200"
              : "border-emerald-400/25 bg-emerald-400/8 text-emerald-200",
          )}
        >
          {notice}
        </div>
      )}

      {/* tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-white/[0.025] p-1">
        {(
          [
            ["overview", "Обзор", Gauge],
            ["users", "Пользователи", Users],
            ["broadcast", "Рассылка", MessageSquare],
            ["logs", "Журнал и БД", Database],
          ] as Array<[Tab, string, typeof Gauge]>
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors",
              tab === key
                ? "bg-sky-400/15 text-sky-200 shadow-[inset_0_0_0_1px_rgba(85,184,255,.2)]"
                : "text-[color:var(--color-dim)] hover:text-ink",
            )}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              { icon: Users, label: "Пользователи", value: s.users, hint: `${s.active24h} активны за 24ч` },
              { icon: Smartphone, label: "Telegram", value: s.linkedTelegram, hint: `${s.blocked} заблокировано` },
              { icon: Sparkles, label: "Premium", value: s.premium, hint: "активных подписок" },
              { icon: Layers, label: "Подписки", value: s.subscriptions, hint: `${s.favorites} избранных` },
              { icon: Target, label: "Цели", value: s.targets, hint: `${s.positions} позиций` },
              { icon: Activity, label: "Движения 24ч", value: s.changes24h, hint: `${s.alerts24h} алертов` },
            ].map((x) => (
              <div key={x.label} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-1.5 text-[color:var(--color-faint)]">
                  <x.icon size={12} />
                  <span className="font-mono text-[9px] uppercase tracking-widest">{x.label}</span>
                </div>
                <div className="mt-2 font-mono text-2xl font-bold tabular-nums">{x.value}</div>
                <div className="mt-1 text-[10px] text-[color:var(--color-faint)]">{x.hint}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {/* engine control */}
            <div className="glass rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Radio size={14} className={data.monitor.enabled ? "text-emerald-300" : "text-amber-300"} />
                  Движок мониторинга
                </div>
                <Chip tone={data.monitor.enabled ? "mint" : "amber"}>
                  {data.monitor.enabled ? "работает" : "на паузе"}
                </Chip>
              </div>
              <button
                onClick={() =>
                  void action(
                    { action: "toggle_monitor", enabled: !data.monitor.enabled },
                    data.monitor.enabled ? "Автосканирование остановлено" : "Автосканирование запущено",
                  )
                }
                disabled={busy}
                className={cn(
                  "mb-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold",
                  data.monitor.enabled
                    ? "border border-amber-300/25 bg-amber-300/8 text-amber-200"
                    : "btn-glow",
                )}
              >
                {data.monitor.enabled ? <Pause size={13} /> : <Play size={13} />}
                {data.monitor.enabled ? "Поставить сканер на паузу" : "Запустить сканер"}
              </button>

              <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[color:var(--color-faint)]">
                Интервал
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {[60, 120, 300, 600, 1800].map((sec) => (
                  <button
                    key={sec}
                    disabled={busy}
                    onClick={() => void action({ action: "set_interval", intervalSec: sec })}
                    className={cn(
                      "rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors disabled:opacity-40",
                      data.monitor.intervalSec === sec
                        ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                        : "border-white/10 bg-white/4 text-[color:var(--color-dim)] hover:text-ink",
                    )}
                  >
                    {sec < 60 ? `${sec}с` : `${sec / 60} мин`}
                  </button>
                ))}
              </div>

              <div className="space-y-2 font-mono text-xs">
                <Row k="последний тик" v={data.monitor.lastTickAt ? timeAgo(data.monitor.lastTickAt) : "никогда"} />
                {summary && (
                  <>
                    <Row k="сканировано / изменено" v={`${summary.scanned} / ${summary.changed}`} />
                    <Row k="отправлено алертов" v={String(summary.notified)} />
                    <Row k="длительность" v={`${summary.durationMs} мс`} />
                    {summary.error && <Row k="ошибка" v={summary.error} good={false} />}
                  </>
                )}
              </div>
            </div>

            {/* source control */}
            <div className="glass rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <PlugZap size={14} className="text-sky-300" /> Источник данных
                </div>
                <Chip tone={data.source?.ok ? "mint" : "rose"}>{data.source?.name ?? "boot"}</Chip>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                {(
                  [
                    ["auto", "Авто"],
                    ["tonnel", "Tonnel"],
                    ["portals", "Portals"],
                    ["simulator", "Demo"],
                  ] as Array<[SourcePreference, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => void action({ action: "set_source", source: key }, `Источник: ${label}`)}
                    disabled={busy}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-xs transition-colors",
                      data.sourcePreference === key
                        ? "border-sky-400/45 bg-sky-400/14 text-sky-200"
                        : "border-white/10 bg-white/4 text-[color:var(--color-dim)] hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-2 font-mono text-xs">
                <Row k="активный" v={data.source?.name ?? "—"} good={data.source?.ok} />
                <Row k="режим" v={data.sourcePreference} />
                <Row k="детали" v={data.source?.detail ?? "—"} />
                <Row k="обновлён" v={data.source?.at ? timeAgo(data.source.at) : "—"} />
                <Row k="Telegram token" v={data.telegram.tokenConfigured ? "настроен" : "нет"} good={data.telegram.tokenConfigured} />
                <Row k="режим бота" v={data.telegram.polling ? "long polling" : "webhook"} />
              </div>
              <button
                onClick={() => void action({ action: "test_message" }, "Тест отправлен в ADMIN_CHAT_ID")}
                disabled={busy || !data.telegram.tokenConfigured || !data.telegram.adminChat}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/4 py-2.5 text-xs text-[color:var(--color-dim)] hover:text-ink disabled:opacity-35"
              >
                <Send size={13} /> Проверить доставку в Telegram
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "users" && (
        <div className="space-y-3">
          <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4">
            <UserCheck size={15} className="text-sky-300" />
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Поиск по имени, profile id или Telegram id"
              className="input-dark min-w-56 flex-1 rounded-xl px-3.5 py-2.5 text-sm"
            />
            <span className="font-mono text-[10px] text-[color:var(--color-faint)]">
              показано {filteredUsers.length} из {s.users}
            </span>
          </div>

          {filteredUsers.map((u) => (
            <div key={u.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold",
                    u.blocked
                      ? "bg-rose-400/12 text-rose-300"
                      : u.telegramChatId
                        ? "bg-emerald-400/12 text-emerald-300"
                        : "bg-white/6 text-[color:var(--color-dim)]",
                  )}
                >
                  {u.label.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{u.label}</span>
                    {u.role === "admin" && <Chip tone="amber">admin</Chip>}
                    {u.blocked && <Chip tone="rose">заблокирован</Chip>}
                    {u.planView?.isPremium && (
                      <Chip tone="mint">PRO · {u.planView.daysLeft} дн.</Chip>
                    )}
                    {u.telegramChatId && <Chip tone="mint">Telegram</Chip>}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[color:var(--color-faint)]">
                    {u.id.slice(0, 12)}… · tg: {u.telegramChatId ?? "—"} · был {timeAgo(u.lastSeenAt)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] text-[color:var(--color-dim)]">
                    <span>треков {u.watches}</span>
                    <span>избранных {u.favorites}</span>
                    <span>целей {u.targets}</span>
                    <span>позиций {u.positions}</span>
                    <span>порог {Number(u.thresholdPct)}%</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      void action(
                        { action: "update_user", profileId: u.id, blocked: !u.blocked },
                        u.blocked ? "Пользователь разблокирован" : "Пользователь заблокирован",
                      )
                    }
                    disabled={busy}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px]",
                      u.blocked
                        ? "border-emerald-400/25 text-emerald-300"
                        : "border-rose-400/25 text-rose-300",
                    )}
                  >
                    {u.blocked ? <CheckCircle2 size={12} /> : <Ban size={12} />}
                    {u.blocked ? "Разблокировать" : "Блокировать"}
                  </button>
                  <button
                    onClick={() =>
                      void action({
                        action: "update_user",
                        profileId: u.id,
                        role: u.role === "admin" ? "user" : "admin",
                      })
                    }
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-[color:var(--color-dim)] hover:text-ink"
                  >
                    <ShieldCheck size={12} /> {u.role === "admin" ? "Снять admin" : "Сделать admin"}
                  </button>
                  <button
                    onClick={() =>
                      void action(
                        u.planView?.isPremium
                          ? { action: "revoke_premium", profileId: u.id }
                          : { action: "grant_premium", profileId: u.id, months: 1 },
                        u.planView?.isPremium ? "Premium отозван" : "Premium выдан на 1 месяц",
                      )
                    }
                    disabled={busy}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px]",
                      u.planView?.isPremium
                        ? "border-amber-300/30 text-amber-200"
                        : "border-emerald-400/25 text-emerald-300",
                    )}
                  >
                    <Sparkles size={12} /> {u.planView?.isPremium ? "Снять PRO" : "Выдать PRO"}
                  </button>
                  <button
                    onClick={() =>
                      void action({
                        action: "update_user",
                        profileId: u.id,
                        digestEnabled: !u.digestEnabled,
                      })
                    }
                    disabled={busy}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px]",
                      u.digestEnabled
                        ? "border-sky-400/25 text-sky-300"
                        : "border-white/10 text-[color:var(--color-faint)]",
                    )}
                  >
                    <BellRing size={12} /> Сводка {u.digestEnabled ? "вкл" : "выкл"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "broadcast" && (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="glass rounded-2xl p-5">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <MessageSquare size={14} className="text-sky-300" /> Массовая рассылка
            </div>
            <p className="mb-4 text-xs text-[color:var(--color-faint)]">
              Отправляется только незаблокированным пользователям с привязанным Telegram. Скорость ограничена безопасными 20 сообщениями/с.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["all", `Все Telegram (${s.linkedTelegram - s.blocked})`],
                  ["active", "Активные за 7 дней"],
                  ["admins", "Только администраторы"],
                ] as Array<[typeof audience, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAudience(key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11px]",
                    audience === key
                      ? "border-sky-400/40 bg-sky-400/12 text-sky-200"
                      : "border-white/10 text-[color:var(--color-dim)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={broadcast}
              onChange={(e) => setBroadcast(e.target.value.slice(0, 3500))}
              rows={8}
              placeholder="Текст сообщения. Можно использовать *жирный* и `моноширинный` Markdown…"
              className="input-dark w-full resize-y rounded-xl px-3.5 py-3 text-sm leading-relaxed"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[10px] text-[color:var(--color-faint)]">
                {broadcast.length} / 3500
              </span>
              <button
                disabled={busy || !broadcast.trim() || !data.telegram.tokenConfigured}
                onClick={async () => {
                  const result = await action(
                    { action: "broadcast", text: broadcast, audience },
                    "Рассылка завершена",
                  );
                  if (result?.ok)
                    setNotice(`Доставлено: ${result.sent}, ошибок: ${result.failed}`);
                }}
                className="btn-glow flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs disabled:opacity-40"
              >
                <Send size={13} /> Отправить рассылку
              </button>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="mb-2 text-sm font-semibold">Предпросмотр</div>
            <div className="rounded-xl bg-[#182533] p-3.5 text-[13px] leading-relaxed text-[#dbe7f3]">
              <strong>СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА</strong>
              <div className="mt-2 whitespace-pre-wrap text-[#c8d5e3]">
                {broadcast || "Здесь появится текст рассылки…"}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Database size={14} className="text-amber-300" /> Обслуживание данных
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[color:var(--color-dim)]">Удалить историю старше</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={purgeDays}
                onChange={(e) => setPurgeDays(Number(e.target.value))}
                className="input-dark w-24 rounded-lg px-3 py-2 font-mono text-xs"
              />
              <span className="text-xs text-[color:var(--color-dim)]">дней</span>
              <button
                onClick={() => {
                  if (window.confirm(`Удалить историю старше ${purgeDays} дней? Это необратимо.`))
                    void action(
                      { action: "purge_history", days: purgeDays },
                      "Старая история очищена",
                    );
                }}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-rose-400/25 px-3 py-2 text-[11px] text-rose-300"
              >
                <Trash size={12} /> Очистить историю
              </button>
              <button
                onClick={() => void exportData()}
                disabled={busy}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-[color:var(--color-dim)] hover:text-ink"
              >
                <Download size={12} /> Скачать backup до очистки
              </button>
            </div>
          </div>

          <div className="glass overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-[color:var(--color-line)] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck size={14} className="text-amber-300" /> Журнал событий
              </span>
              <button
                onClick={() => void action({ action: "clear_errors" }, "Ошибки очищены")}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[10px] text-[color:var(--color-dim)] hover:text-rose-300 disabled:opacity-40"
              >
                <Trash size={11} /> очистить ошибки
              </button>
            </div>
            {data.events.length === 0 && (
              <p className="px-4 py-8 font-mono text-xs text-[color:var(--color-faint)]">событий пока нет</p>
            )}
            {data.events.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 border-b border-[color:var(--color-line)] px-4 py-2.5 font-mono text-[11px] last:border-0"
              >
                {e.level === "error" ? (
                  <CircleAlert size={12} className="shrink-0 text-rose-300" />
                ) : e.level === "warn" ? (
                  <AlertTriangle size={12} className="shrink-0 text-amber-300" />
                ) : (
                  <Info size={12} className="shrink-0 text-sky-300/70" />
                )}
                <span className="w-20 shrink-0 uppercase tracking-wider text-[color:var(--color-faint)]">
                  {e.source}
                </span>
                <span className="min-w-0 flex-1 truncate text-[color:var(--color-dim)]">{e.message}</span>
                <span className="shrink-0 text-[10px] text-[color:var(--color-faint)]">{timeAgo(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Chip tone="dim">ADMIN_CODE защищает API</Chip>
        <Chip tone="dim">до 100 пользователей в панели</Chip>
        <Chip tone="dim">backup до 10 000 записей истории</Chip>
      </div>
    </PageShell>
  );
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5">
      <span className="shrink-0 uppercase tracking-wider text-[color:var(--color-faint)]">{k}</span>
      <span
        title={v}
        className={cn(
          "max-w-[65%] truncate text-right",
          good === undefined
            ? "text-[color:var(--color-dim)]"
            : good
              ? "text-emerald-300"
              : "text-rose-300",
        )}
      >
        {v}
      </span>
    </div>
  );
}

// Keep these icons tree-shaken but available to status variants.
void RotateCw;
void XCircle;
void Wallet;
