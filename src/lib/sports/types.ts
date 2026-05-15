export type Sport = "nba";

export type Team = {
  id: number;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
  full_name: string;
  name: string;
};

export type Player = {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  height: string | null;
  weight: string | null;
  jersey_number: string | null;
  college: string | null;
  country: string | null;
  draft_year: number | null;
  draft_round: number | null;
  draft_number: number | null;
  team: Team;
};

export type Game = {
  id: number;
  date: string;
  datetime: string | null;
  season: number;
  status: string;
  period: number;
  time: string | null;
  postseason: boolean;
  home_team: Team;
  home_team_score: number;
  visitor_team: Team;
  visitor_team_score: number;
};

export type Paginated<T> = {
  data: T[];
  next_cursor: number | null;
  per_page: number;
};

export type ListGamesParams = {
  dates?: string[];
  seasons?: number[];
  team_ids?: number[];
  per_page?: number;
  cursor?: number;
};

export type SearchPlayersParams = {
  search?: string;
  team_ids?: number[];
  per_page?: number;
  cursor?: number;
};

// Per-player per-game box score line, as returned by balldontlie /stats.
export type Stat = {
  id: number;
  ast: number;
  blk: number;
  dreb: number;
  fg3_pct: number;
  fg3a: number;
  fg3m: number;
  fg_pct: number;
  fga: number;
  fgm: number;
  ft_pct: number;
  fta: number;
  ftm: number;
  game: Game;
  min: string; // "MM:SS" or "MM"
  oreb: number;
  pf: number;
  player: Player;
  pts: number;
  reb: number;
  stl: number;
  team: Team;
  turnover: number;
};

export type ListStatsParams = {
  dates?: string[];
  seasons?: number[];
  player_ids?: number[];
  game_ids?: number[];
  per_page?: number;
  cursor?: number;
};
