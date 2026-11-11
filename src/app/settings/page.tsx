"use client";

import { useState } from "react";
import { Bell, BellOff, BellRing, Percent, User, Link2, Save } from "lucide-react";
import { useProfile } from "@/components/profile";
import { PageShell, SectionTitle, Chip } from "@/components/ui";
import { cn } from "@/lib/util/format";

const THRESHOLDS = [0.5, 1, 2, 3, 5, 10];

export default function SettingsPage() {
  const { profile, patch } = useProfile();
  const [label, setLabel] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!profile) {
    return (
      <PageShell title="Настройки">
        <p className="font-mono text-xs text-[color:var(--color-faint)]">загрузка профиля…</p>
      </PageShell>
    );
  }

  const currentLabel = label ?? profile.label;

  const saveLabel = async () => {
    await patch({ label: currentLabel });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <PageShell title="Настройки" subtitle="Профиль, чувствительность алертов и привязка Telegram">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* identity */}
        <div className="glass rounded-2xl p-5">
          <SectionTitle title="Профиль" hint="Хранится на сервере — переживает перезапуски и устройства с тем же ID" />
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-400/60 to-sky-400/60 font-mono text-sm font-bold text-[#0a0f1a]">
              {currentLabel.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <input
                value={currentLabel}
                onChange={(e) => setLabel(e.target.value)}
                className="input-dark w-full rounded-xl px-3.5 py-2.5 text-sm"
                maxLength={32}
              />
              <button
                onClick={() => void saveLabel()}
                className="btn-glow flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs"
              >
                <Save size={13} /> {saved ? "Сохранено" : "Сохранить"}
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-[color:var(--color-faint)]">
            <User size={10} /> id: {profile.id.slice(0, 8)}… · роль: {profile.role}
          </div>
        </div>

        {/* notifications */}
        <div className="glass rounded-2xl p-5">
          <SectionTitle title="Уведомления" hint="Глобальный переключатель всех ваших алертов" />
          <button
            onClick={() => void patch({ notificationsEnabled: !profile.notificationsEnabled })}
            className={cn(
              "flex w-full items-center justify-between rounded-xl border px-4 py-3.5 transition-colors",
              profile.notificationsEnabled
                ? "border-emerald-400/25 bg-emerald-400/8"
                : "border-white/10 bg-white/4",
            )}
          >
            <span className="flex items-center gap-3 text-sm font-medium">
              {profile.notificationsEnabled ? (
                <Bell size={15} className="text-emerald-300" />
              ) : (
                <BellOff size={15} className="text-[color:var(--color-faint)]" />
              )}
              Алерты об изменении флора
            </span>
            <span
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                profile.notificationsEnabled ? "bg-emerald-400/80" : "bg-white/12",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                  profile.notificationsEnabled ? "left-[22px]" : "left-0.5",
                )}
              />
            </span>
          </button>
          <button
            onClick={() => void patch({ digestEnabled: !profile.digestEnabled })}
            className={cn(
              "mt-2 flex w-full items-center justify-between rounded-xl border px-4 py-3.5 transition-colors",
              profile.digestEnabled
                ? "border-sky-400/25 bg-sky-400/8"
                : "border-white/10 bg-white/4",
            )}
          >
            <span className="flex items-center gap-3 text-left text-sm font-medium">
              <BellRing
                size={15}
                className={profile.digestEnabled ? "text-sky-300" : "text-[color:var(--color-faint)]"}
              />
              <span>
                Утренняя сводка рынка
                <span className="mt-0.5 block text-[10px] font-normal text-[color:var(--color-faint)]">
                  лидеры роста и падения + ваш P&L раз в сутки
                </span>
              </span>
            </span>
            <span
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                profile.digestEnabled ? "bg-sky-400/80" : "bg-white/12",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                  profile.digestEnabled ? "left-[22px]" : "left-0.5",
                )}
              />
            </span>
          </button>
        </div>

        {/* threshold */}
        <div className="glass rounded-2xl p-5">
          <SectionTitle
            title="Порог алерта"
            hint="Алерт срабатывает только при движении флора больше этого процента"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Percent size={14} className="text-[color:var(--color-faint)]" />
            {THRESHOLDS.map((t) => (
              <button
                key={t}
                onClick={() => void patch({ thresholdPct: t })}
                className={cn(
                  "rounded-full border px-4 py-2 font-mono text-xs transition-colors",
                  Number(profile.thresholdPct) === t
                    ? "border-sky-400/50 bg-sky-400/15 text-sky-200"
                    : "border-white/10 bg-white/4 text-[color:var(--color-dim)] hover:text-ink",
                )}
              >
                {t}%
              </button>
            ))}
          </div>
        </div>

        {/* telegram link */}
        <div className="glass rounded-2xl p-5">
          <SectionTitle title="Привязка Telegram" hint="Получайте те же алерты прямо в Telegram" />
          <div className="rounded-xl border border-dashed border-white/12 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 size={14} className="text-sky-300" />
              {profile.telegramChatId ? (
                <span className="text-emerald-300">привязан · чат {profile.telegramChatId}</span>
              ) : (
                <span className="text-[color:var(--color-dim)]">не привязан</span>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--color-faint)]">
              Откройте бота в Telegram и нажмите /start — чат зарегистрируется автоматически.
              Каждый алерт по отслеживаемым подаркам будет дублироваться в этот чат. Сначала
              попробуйте сценарий на странице <span className="text-sky-300">Telegram-бот</span>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip tone="dim">мультипользовательский режим</Chip>
          <Chip tone="dim">избранное и трекинг — у каждого свои</Chip>
          <Chip tone="dim">сохраняются после перезапуска</Chip>
        </div>
      </div>
    </PageShell>
  );
}
