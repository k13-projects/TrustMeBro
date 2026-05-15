import type { Reasoning } from "@/lib/analysis/types";

export type TeamLite = {
  id: number;
  abbreviation: string;
  full_name: string;
};

export type PredictionRow = {
  id: string;
  game_id: number;
  player_id: number;
  market: string;
  line: number;
  pick: "over" | "under";
  projection: number;
  confidence: number;
  is_bet_of_the_day: boolean;
  reasoning: Reasoning;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    team_id: number | null;
    position: string | null;
    jersey_number: string | null;
  };
};
