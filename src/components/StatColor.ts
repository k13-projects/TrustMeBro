// Pinned color tokens for the player comparison view.
// Defined here as literal class strings so the Tailwind v4 JIT compiles them
// statically — do not generate class names dynamically anywhere downstream.

export const STAT_COLORS = {
  season: {
    label: "Season",
    fg: "text-blue-400",
    bg: "bg-blue-500/15",
    bar: "bg-blue-500/45",
    raw: "#3b82f6",
  },
  prev2: {
    label: "Two games ago",
    fg: "text-purple-400",
    bg: "bg-purple-500/15",
    bar: "bg-purple-500/45",
    raw: "#a855f7",
  },
  prev: {
    label: "Previous game",
    fg: "text-amber-400",
    bg: "bg-amber-500/15",
    bar: "bg-amber-500/45",
    raw: "#f59e0b",
  },
  l5: {
    label: "Last 5",
    fg: "text-foreground/85",
    bg: "bg-white/6",
    bar: "bg-white/20",
    raw: "#e5e7eb",
  },
  l10: {
    label: "Last 10 avg",
    fg: "text-emerald-400",
    bg: "bg-emerald-500/15",
    bar: "bg-emerald-500/45",
    raw: "#10b981",
  },
} as const;

export type StatSeries = keyof typeof STAT_COLORS;
