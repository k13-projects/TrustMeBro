import type { Game, Player, Team } from "@/lib/sports/types";

export type PropMarket =
  | "points"
  | "rebounds"
  | "assists"
  | "threes_made"
  | "minutes"
  | "steals"
  | "blocks"
  | "pra";

export type PickSide = "over" | "under";

export type BetStatus = "pending" | "won" | "lost" | "void";

export type PlayerGameStatLine = {
  game_id: number;
  player_id: number;
  team_id: number;
  // Derived at load time from the games row (home_team_id / visitor_team_id +
  // is_home). Not a DB column. Null only when the joined game row is missing.
  opponent_team_id: number | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  personal_fouls: number | null;
  fgm: number | null;
  fga: number | null;
  fg3m: number | null;
  fg3a: number | null;
  ftm: number | null;
  fta: number | null;
  is_home: boolean;
  started: boolean | null;
  game_date: string;
};

export type FeatureWindow = {
  count: number;
  mean: number;
  median: number;
  stdev: number;
  min: number;
  max: number;
};

export type PlayerFeatures = {
  player_id: number;
  market: PropMarket;
  season: FeatureWindow;
  last5: FeatureWindow;
  last10: FeatureWindow;
  home: FeatureWindow;
  away: FeatureWindow;
  vs_opponent: FeatureWindow;
  last_game_value: number | null;
};

export type ConfidenceCheck = {
  label: string;
  passed: boolean;
  value: number;
  target: number;
  weight: number;
};

export type SignalImpact = {
  source: string;
  impact: number;
  note: string;
};

export type Reasoning = {
  checks: ConfidenceCheck[];
  signals: SignalImpact[];
  odds?: {
    bookmaker: string;
    price_decimal: number;
    price_american: number;
    book_count: number;
  };
};

export type Prediction = {
  id?: string;
  game_id: number;
  player_id: number;
  market: PropMarket;
  line: number;
  pick: PickSide;
  projection: number;
  confidence: number;
  expected_value: number | null;
  reasoning: Reasoning;
  is_bet_of_the_day: boolean;
  status: BetStatus;
  generated_at: string;
};

export type PredictionInput = {
  game: Game;
  player: Player;
  team: Team;
  opponent: Team;
  history: PlayerGameStatLine[];
  market: PropMarket;
  line: number;
  signals?: SignalImpact[];
  best_odds?: {
    bookmaker: string;
    price_decimal: number;
    price_american: number;
    book_count: number;
  };
};
