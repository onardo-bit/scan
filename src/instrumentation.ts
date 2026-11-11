/**
 * Background market scheduler.
 * A self-rescheduling loop (re-reads the scan interval from the database
 * after every cycle, so admins can change cadence without a restart).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as typeof globalThis & {
    __scannerScheduler?: boolean;
    __scannerTimer?: NodeJS.Timeout;
  };
  if (g.__scannerScheduler) return;
  g.__scannerScheduler = true;

  const loop = async () => {
    let nextMs = 120_000;
    try {
      const { runMonitorTick } = await import("@/lib/market/monitor");
      const { getMonitorState } = await import("@/lib/market/settings");
      const st = await getMonitorState();
      if (st.enabled) await runMonitorTick("interval");
      nextMs = Math.max(30, st.intervalSec) * 1000;
    } catch (e) {
      console.error("[scheduler] tick failed:", (e as Error).message);
      nextMs = 60_000;
    }
    g.__scannerTimer = setTimeout(() => void loop(), nextMs);
    g.__scannerTimer.unref?.();
  };

  const boot = setTimeout(() => void loop(), 5_000);
  boot.unref?.();
  console.log("[scanner] market scheduler registered");

  // Long-polling режим: бот без публичного URL (домашний ПК, бесплатный VPS).
  if (process.env.TELEGRAM_POLLING === "true") {
    const pollBoot = setTimeout(async () => {
      try {
        const { startPolling } = await import("@/lib/telegram/polling");
        void startPolling();
        console.log("[scanner] telegram long polling enabled");
      } catch (e) {
        console.error("[scanner] polling start failed:", (e as Error).message);
      }
    }, 8_000);
    pollBoot.unref?.();
  }
}
