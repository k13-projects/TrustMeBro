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
  /** ESPN's winner flag — set after ET/penalties even when the score is level. */
  winner_team_id: number | null;
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

// One recent result for a team, across every competition it plays in (ESPN's
// "last five" is cross-competition: league, cup, Europe, friendlies).
export type RecentResult = {
  event_id: number;
  date: string; // ISO datetime
  competition_name: string;
  opponent: { id: number; name: string; abbreviation: string; crest: string | null };
  home_away: "H" | "A";
  goals_for: number;
  goals_against: number;
  result: "W" | "D" | "L";
};

export type TeamStatLine = { key: string; label: string; value: string };

export type LineupPlayer = {
  name: string;
  position: string;
  jersey: string | null;
  starter: boolean;
};

export type Lineup = {
  side: "home" | "away";
  formation: string | null;
  players: LineupPlayer[];
};

export type CommentaryLine = { minute: string; text: string };

// Everything ESPN's match summary gives us beyond the score: form, team stats,
// lineups, officials, running commentary. Any block may be empty pre-match.
export type MatchDetail = {
  match: Match;
  venue: string | null;
  attendance: number | null;
  officials: string[];
  last_five: { home: RecentResult[]; away: RecentResult[] };
  stats: { home: TeamStatLine[]; away: TeamStatLine[] };
  lineups: Lineup[];
  commentary: CommentaryLine[]; // newest first
};

export type TeamProfile = {
  team: SoccerTeam;
  venue: string | null;
  record_summary: string | null; // "1-0-0"
  standing_summary: string | null; // "10th in Spanish LALIGA"
  next_event: { id: number; name: string; date: string } | null;
};

export type SquadPlayer = {
  id: number;
  name: string;
  position: string;
  jersey: string | null;
  age: number | null;
  nationality: string | null;
  headshot: string | null;
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
  getMatchDetail(id: number): Promise<MatchDetail | null>;
  getTeamProfile(teamId: number): Promise<TeamProfile | null>;
  /** Cross-competition results + upcoming fixtures for a club (ESPN "all"). */
  getTeamSchedule(teamId: number): Promise<RecentResult[]>;
  getTeamSquad(teamId: number): Promise<SquadPlayer[]>;
}
