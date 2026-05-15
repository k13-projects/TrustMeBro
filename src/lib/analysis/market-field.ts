import type { PlayerGameStatLine, PropMarket } from "./types";

// Direct column mappings. Combined markets (e.g. 'pra') are computed in
// statValue() below; they don't have a single column.
export const MARKET_TO_FIELD: Partial<
  Record<PropMarket, keyof PlayerGameStatLine>
> = {
  points: "points",
  rebounds: "rebounds",
  assists: "assists",
  threes_made: "fg3m",
  minutes: "minutes",
  steals: "steals",
  blocks: "blocks",
};

export function statValue(
  stat: PlayerGameStatLine,
  market: PropMarket,
): number | null {
  if (market === "pra") {
    const p = stat.points;
    const r = stat.rebounds;
    const a = stat.assists;
    if (p == null || r == null || a == null) return null;
    return p + r + a;
  }
  const field = MARKET_TO_FIELD[market];
  if (!field) return null;
  const v = stat[field];
  return typeof v === "number" ? v : null;
}
