export type SignalSource =
  | "magazine"
  | "social_x"
  | "social_reddit"
  | "newsletter"
  | "injury_report"
  | "press_conference"
  | "odds_movement";

export type Signal = {
  player_id?: number;
  team_id?: number;
  source: SignalSource;
  source_url?: string;
  source_id: string;
  summary: string;
  sentiment: number;
  weight: number;
  captured_at: string;
  occurred_at?: string;
  raw?: Record<string, unknown>;
};

export interface SignalFetcher {
  source: SignalSource;
  fetch(since: Date): Promise<Signal[]>;
}
