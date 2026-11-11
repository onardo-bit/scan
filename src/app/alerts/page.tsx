"use client";

import { useCallback, useEffect } from "react";
import { useState } from "react";
import Link from "next/link";
import { BellOff, Send, CheckCheck } from "lucide-react";
import { useProfile } from "@/components/profile";
import { GiftArt } from "@/components/gift-art";
import { EmptyState, PageShell } from "@/components/ui";
import { timeAgo, cn } from "@/lib/util/format";

interface AlertItem {
  id: number;
  title: string;
  body: string;
  read: boolean;
  telegramSent: boolean;
  createdAt: string;
  giftName: string;
  giftSlug: string;
  hue: number;
}

export default function AlertsPage() {
  const { profile } = useProfile();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const r = await fetch(`/api/notifications?profileId=${profile.id}`, { cache: "no-store" });
      const d = await r.json();
      setItems(d.items ?? []);
      if ((d.unread ?? 0) > 0) {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: profile.id }),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    const on = () => void load();
    window.addEventListener("scanner:refresh", on);
    return () => {
      clearInterval(t);
      window.removeEventListener("scanner:refresh", on);
    };
  }, [load]);

  return (
    <PageShell
      title="Уведомления"
      subtitle="Каждое движение флора выше вашего порога — без дублей по каждому событию"
    >
      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<BellOff size={28} />}
          title="Алертов пока нет"
          hint="Отслеживайте подарок через мониторинг или избранное — как только флор сдвинется выше порога, алерт появится здесь и в Telegram."
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-2.5">
          {items.map((a) => (
            <Link
              key={a.id}
              href={`/gift/${a.giftSlug}`}
              className={cn(
                "glass glass-hover rise block rounded-2xl p-4",
                !a.read && "border-l-2 border-l-sky-400",
              )}
            >
              <div className="flex items-start gap-3">
                <GiftArt name={a.giftName} hue={a.hue} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-sky-300">
                      {a.title}
                    </span>
                    {a.telegramSent && (
                      <span className="flex items-center gap-1 font-mono text-[9px] text-emerald-300/80">
                        <Send size={9} /> telegram
                      </span>
                    )}
                  </div>
                  <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[color:var(--color-dim)]">
                    {a.body.replace(/\*/g, "")}
                  </pre>
                  <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-[color:var(--color-faint)]">
                    <CheckCheck size={11} /> {timeAgo(a.createdAt)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
