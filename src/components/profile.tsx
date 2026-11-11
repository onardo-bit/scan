"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface ProfileData {
  id: string;
  label: string;
  telegramChatId: string | null;
  role: string;
  blocked: boolean;
  notificationsEnabled: boolean;
  digestEnabled: boolean;
  thresholdPct: number;
}

interface ProfileCtx {
  profile: ProfileData | null;
  ready: boolean;
  refresh: () => Promise<void>;
  patch: (p: Partial<ProfileData>) => Promise<void>;
}

const Ctx = createContext<ProfileCtx>({
  profile: null,
  ready: false,
  refresh: async () => {},
  patch: async () => {},
});

const KEY = "giftscope-profile-id";

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const id = localStorage.getItem(KEY);
      if (id) {
        const res = await fetch(`/api/profile?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
          setReady(true);
          return;
        }
        localStorage.removeItem(KEY);
      }
      const res = await fetch("/api/profile", { method: "POST", body: "{}" });
      const data = await res.json();
      if (data.profile) {
        localStorage.setItem(KEY, data.profile.id);
        setProfile(data.profile);
      }
    } catch {
      /* offline: keep null */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    async (p: Partial<ProfileData>) => {
      if (!profile) return;
      setProfile({ ...profile, ...p });
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id, ...p }),
      }).catch(() => undefined);
    },
    [profile],
  );

  const value = useMemo(
    () => ({ profile, ready, refresh: load, patch }),
    [profile, ready, load, patch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile() {
  return useContext(Ctx);
}
