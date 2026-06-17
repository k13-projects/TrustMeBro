// Soccer domain types + provider contract. Match-level only (no players).

export type SoccerTeam = {
  id: number;
  name: string;
  abbreviation: string;
  country: string;
  crest_url: string | null;
};

export type Match = {
  id: number;
  date: string; // LA-day ISO date (yyyy-mm-dd)
  datetime: string | null;
  season: number;
  status: string; // ESPN description, e.g. "Full Time", "Halftime"
  state: "pre" | "in" | "post";
  period: number;
  clock: string | null;
  stage: string | null; // e.g. "group-stage", "round-of-16"
  group: string | null;
  home_team: SoccerTeam;
  away_team: SoccerTeam;
  home_score: number;
  away_score: number;
  finished: boolean;
};

export type SoccerStanding = {
  team: SoccerTeam;
  group: string | null;
  rank: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
};

// A notable in-match moment (goal / card / substitution) with its minute.
export type MatchEvent = {
  minute: string; // e.g. "66'"
  kind: "goal" | "yellow" | "red" | "sub";
  side: "home" | "away" | null;
  player: string;
  detail: string | null; // assist (goal) or other player (sub)
};

export interface SoccerProvider {
  listTeams(): Promise<SoccerTeam[]>;
  listMatches(params: { dates: string[] }): Promise<Match[]>;
  getMatch(id: number): Promise<Match | null>;
  listStandings(season?: number): Promise<SoccerStanding[]>;
  getMatchEvents(id: number): Promise<MatchEvent[]>;
}
