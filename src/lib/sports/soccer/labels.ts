import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

export function marketLabel(market: SoccerMarket): string {
  switch (market) {
    case "match_winner":
      return "Match Result";
    case "total_goals":
      return "Total Goals";
    case "btts":
      return "Both Teams To Score";
  }
}

// Human label for a pick. `home`/`away` are team names for the match.
export function sideLabel(
  market: SoccerMarket,
  side: MatchSide,
  line: number | null,
  home: string,
  away: string,
): string {
  if (market === "match_winner") {
    if (side === "home") return `${home} win`;
    if (side === "away") return `${away} win`;
    return "Draw";
  }
  if (market === "total_goals") {
    return `${side === "over" ? "Over" : "Under"} ${line ?? ""} goals`.trim();
  }
  return side === "yes" ? "Both teams score" : "Not both teams score";
}

export const couponKindLabel: Record<string, string> = {
  banko: "BANKO",
  multiplier: "Multiplier",
  surprise: "Surprise",
};
