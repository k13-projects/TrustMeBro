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
