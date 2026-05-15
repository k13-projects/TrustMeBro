import type { PlayerGameStatLine, PropMarket } from "./types";

export const MARKET_TO_FIELD: Record<PropMarket, keyof PlayerGameStatLine> = {
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
  const v = stat[MARKET_TO_FIELD[market]];
  return typeof v === "number" ? v : null;
}
