import type { PropMarket } from "@/lib/analysis/types";

export type OddsPlayerMarket = Extract<
  PropMarket,
  "points" | "rebounds" | "assists" | "threes_made"
>;

export type OddsQuote = {
  game_id: number;
  player_id: number;
  player_name: string;
  market: OddsPlayerMarket;
  line: number;
  pick: "over" | "under";
  bookmaker: string;
  price_decimal: number;
  captured_at: string;
};

export type RawEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

export type RequestCredits = {
  requests_remaining: number | null;
  requests_used: number | null;
  requests_last: number | null;
};
