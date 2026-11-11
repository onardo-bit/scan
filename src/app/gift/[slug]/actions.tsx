"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, Radar, Briefcase, Check } from "lucide-react";
import { useProfile } from "@/components/profile";
import { cn } from "@/lib/util/format";

export function GiftActions({ giftId }: { giftId: number }) {
  const { profile } = useProfile();
  const [fav, setFav] = useState(false);
  const [watch, setWatch] = useState(false);
  const [inPf, setInPf] = useState<number>(0);
  const [busy, setBusy] = useState<"fav" | "watch" | "pf" | null>(null);

  useEffect(() => {
    if (!profile) return;
    const pid = profile.id;
    void fetch(`/api/favorites?profileId=${pid}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFav((d.items ?? []).some((g: { id: number }) => g.id === giftId)))
      .catch(() => undefined);
    void fetch(`/api/watches?profileId=${pid}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setWatch((d.items ?? []).some((g: { id: number }) => g.id === giftId)))
      .catch(() => undefined);
    void fetch(`/api/portfolio?profileId=${pid}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const pos = (d.items ?? []).find((g: { giftId: number }) => g.giftId === giftId);
        setInPf(pos?.qty ?? 0);
      })
      .catch(() => undefined);
  }, [profile, giftId]);

  const addToPortfolio = async () => {
    if (!profile || busy) return;
    setBusy("pf");
    try {
      const r = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, giftId, qty: 1 }),
      });
      const d = await r.json();
      if (d.qty) setInPf(d.qty);
    } finally {
      setBusy(null);
    }
  };

  const toggle = useCallback(
    async (kind: "fav" | "watch") => {
      if (!profile || busy) return;
      setBusy(kind);
      // optimistic
      if (kind === "fav") setFav((v) => !v);
      else setWatch((v) => !v);
      try {
        const r = await fetch(`/api/${kind === "fav" ? "favorites" : "watches"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: profile.id, giftId }),
        });
        const d = await r.json();
        if (kind === "fav") setFav(Boolean(d.favored));
        else setWatch(Boolean(d.watched));
      } catch {
        if (kind === "fav") setFav((v) => !v);
        else setWatch((v) => !v);
      } finally {
        setBusy(null);
      }
    },
    [profile, busy, giftId],
  );

  return (
    <div className="flex flex-wrap gap-2.5">
      <button
        onClick={() => void toggle("fav")}
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all",
          fav
            ? "border border-amber-300/40 bg-amber-300/15 text-amber-200"
            : "glass glass-hover text-[color:var(--color-dim)]",
        )}
      >
        <Star size={13} fill={fav ? "currentColor" : "none"} />
        {fav ? "В избранном" : "В избранное"}
      </button>
      <button
        onClick={() => void toggle("watch")}
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all",
          watch
            ? "border border-emerald-300/40 bg-emerald-300/15 text-emerald-200"
            : "glass glass-hover text-[color:var(--color-dim)]",
        )}
      >
        <Radar size={13} />
        {watch ? "Трекинг активен" : "Отслеживать флор"}
      </button>
      <button
        onClick={() => void addToPortfolio()}
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all",
          inPf > 0
            ? "border border-sky-300/40 bg-sky-300/15 text-sky-200"
            : "glass glass-hover text-[color:var(--color-dim)]",
        )}
      >
        {inPf > 0 ? <Check size={13} /> : <Briefcase size={13} />}
        {inPf > 0 ? `В портфеле ×${inPf}` : "В портфель"}
      </button>
    </div>
  );
}
