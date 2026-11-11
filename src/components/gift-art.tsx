import { Gem } from "lucide-react";
import { cn } from "@/lib/util/format";

/**
 * Procedural artwork for a gift collection — deterministic gradient orb
 * derived from the gift's hue. No external images required.
 */
export function GiftArt({
  name,
  hue,
  size = "md",
  className,
}: {
  name: string;
  hue: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "lg"
      ? "h-16 w-16 rounded-2xl text-xl"
      : size === "sm"
        ? "h-9 w-9 rounded-lg text-xs"
        : "h-12 w-12 rounded-xl text-sm";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn("relative isolate flex shrink-0 items-center justify-center overflow-hidden", dims, className)}
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 80% 22%), hsl(${(hue + 40) % 360} 90% 12%))`,
        boxShadow: `inset 0 0 0 1px hsla(${hue}, 90%, 70%, 0.25), 0 6px 20px -8px hsla(${hue}, 90%, 55%, 0.45)`,
      }}
    >
      <div
        className="absolute -right-2 -top-2 h-2/3 w-2/3 rounded-full opacity-60 blur-md"
        style={{ background: `hsl(${(hue + 30) % 360} 95% 65%)` }}
      />
      <div
        className="absolute -bottom-2 -left-2 h-1/2 w-1/2 rounded-full opacity-40 blur-md"
        style={{ background: `hsl(${(hue + 320) % 360} 90% 60%)` }}
      />
      <span className="relative z-10 flex items-center gap-0.5 font-bold tracking-wide text-white drop-shadow">
        <Gem size={size === "sm" ? 9 : size === "lg" ? 14 : 11} strokeWidth={2.5} className="opacity-80" />
        {initials}
      </span>
    </div>
  );
}
