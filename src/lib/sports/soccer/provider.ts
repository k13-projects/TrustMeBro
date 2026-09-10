// Soccer domain types + provider contract. Match-level only (no players).

import type { SoccerCompetition } from "./competitions";

export type SoccerTeam = {
  id: number;
  name: string;
  abbreviation: string;
  country: string;
  crest_url: string | null;
  /** Club brand colour, hex without '#'. Null for national teams. */
  color: string | null;
  alt_color: string | null;
};

export type Match = {
  id: number;
  competition: SoccerCompetition;
  league_slug: string; // ESPN slug the event came from
  date: string; // LA-day ISO date (yyyy-mm-dd)
  datetime: string | null;
  season: number;
  status: string; // ESPN description, e.g. "Full Time", "Halftime"
  state: "pre" | "in" | "post";
  period: number;
  clock: string | null;
  stage: string | null; // e.g. "league-phase", "playoff-round", "round-of-16"
  group: string | null; // "Group A" (World Cup) or "1st Leg" / "2nd Leg" (ties)
  venue: string | null;
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

// A notable in-match moment (goal / card) with its minute. Substitutions are
// intentionally excluded — they clutter the timeline.
export type MatchEvent = {
  minute: string; // e.g. "66'"
  kind: "goal" | "yellow" | "red";
  side: "home" | "away" | null;
  player: string;
  detail: string | null; // assist, for goals
};

export interface SoccerProvider {
  readonly competition: SoccerCompetition;
  readonly slug: string;
  listTeams(): Promise<SoccerTeam[]>;
  listMatches(params: { dates: string[] }): Promise<Match[]>;
  /** Every event between two ISO dates inclusive — one request per call. */
  listMatchesInRange(from: string, to: string): Promise<Match[]>;
  getMatch(id: number): Promise<Match | null>;
  listStandings(season?: number): Promise<SoccerStanding[]>;
  getMatchEvents(id: number): Promise<MatchEvent[]>;
}
