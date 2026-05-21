export const MARKET_LABEL: Record<string, string> = {
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
  threes_made: "3PT Made",
  minutes: "Minutes",
  steals: "Steals",
  blocks: "Blocks",
};

export function marketLabel(market: string): string {
  return MARKET_LABEL[market] ?? market;
}

// Subtle per-market text accent so you can tell markets apart at a glance
// without reading. Palette-safe: steers clear of emerald/rose (reserved for
// over/under + win/loss) and the banned purple family. Tints only — no fills.
const MARKET_ACCENT: Record<string, string> = {
  points: "text-amber-300",
  rebounds: "text-sky-300",
  assists: "text-cyan-300",
  threes_made: "text-orange-400",
  pra: "text-amber-200",
  minutes: "text-sky-200",
  steals: "text-cyan-200",
  blocks: "text-orange-300",
};

export function marketAccent(market: string): string {
  return MARKET_ACCENT[market] ?? "text-foreground/70";
}
