-- TrustMeBro initial schema
-- Run order: this is migration 0001. Forward-only.
--
-- Naming: snake_case tables, <table>_id foreign keys, enums for fixed sets.
-- RLS: enabled on every table; user-facing access controlled per-policy.

-- =============================================================================
-- ENUMS
-- =============================================================================
create type prop_market as enum (
  'points',
  'rebounds',
  'assists',
  'threes_made',
  'minutes',
  'steals',
  'blocks'
);

create type pick_side as enum ('over', 'under');

create type bet_status as enum ('pending', 'won', 'lost', 'void');

create type signal_source as enum (
  'magazine',
  'social_x',
  'social_reddit',
  'newsletter',
  'injury_report',
  'press_conference',
  'odds_movement'
);

-- =============================================================================
-- CORE NBA REFERENCE (cached from balldontlie / official NBA)
-- These mirror upstream IDs (integer) — we do NOT generate our own.
-- =============================================================================
create table teams (
  id integer primary key,
  abbreviation text not null,
  city text not null,
  conference text not null,
  division text not null,
  full_name text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table players (
  id integer primary key,
  first_name text not null,
  last_name text not null,
  position text,
  height text,
  weight text,
  jersey_number text,
  college text,
  country text,
  draft_year integer,
  draft_round integer,
  draft_number integer,
  team_id integer references teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_team_id_idx on players(team_id);

create table games (
  id integer primary key,
  date date not null,
  datetime timestamptz,
  season integer not null,
  status text not null,
  period integer not null default 0,
  time text,
  postseason boolean not null default false,
  home_team_id integer not null references teams(id),
  visitor_team_id integer not null references teams(id),
  home_team_score integer not null default 0,
  visitor_team_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_date_idx on games(date);
create index games_season_idx on games(season);
create index games_home_team_idx on games(home_team_id);
create index games_visitor_team_idx on games(visitor_team_id);

-- Per-game player box score line. Source of truth for L5/L10/season computations.
create table player_game_stats (
  game_id integer not null references games(id) on delete cascade,
  player_id integer not null references players(id) on delete cascade,
  team_id integer not null references teams(id),
  minutes numeric,
  points integer,
  rebounds integer,
  assists integer,
  steals integer,
  blocks integer,
  turnovers integer,
  personal_fouls integer,
  fgm integer, fga integer, fg_pct numeric,
  fg3m integer, fg3a integer, fg3_pct numeric,
  ftm integer, fta integer, ft_pct numeric,
  is_home boolean not null,
  started boolean,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index player_game_stats_player_idx on player_game_stats(player_id, game_id desc);

-- =============================================================================
-- PREDICTIONS — engine output
-- =============================================================================
create table predictions (
  id uuid primary key default gen_random_uuid(),
  game_id integer not null references games(id) on delete cascade,
  player_id integer not null references players(id) on delete cascade,
  market prop_market not null,
  line numeric not null,
  pick pick_side not null,
  projection numeric not null,
  confidence numeric not null check (confidence between 0 and 100),
  expected_value numeric,
  -- structured "why": {checks: [...], signals: [...]}
  reasoning jsonb not null default '{}'::jsonb,
  is_bet_of_the_day boolean not null default false,
  status bet_status not null default 'pending',
  result_value numeric,
  generated_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, player_id, market, line, pick)
);

create index predictions_game_idx on predictions(game_id);
create index predictions_player_idx on predictions(player_id);
create index predictions_status_idx on predictions(status);
create index predictions_botd_idx on predictions(is_bet_of_the_day) where is_bet_of_the_day = true;
create index predictions_generated_idx on predictions(generated_at desc);

-- =============================================================================
-- USER BETS — history sekmesi
-- The user clicks "I played this" on a prediction; this records it.
-- =============================================================================
create table user_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prediction_id uuid not null references predictions(id) on delete restrict,
  -- Optional: user may have played at different odds/stake than the engine assumed
  stake numeric,
  taken_odds numeric,
  user_note text,
  status bet_status not null default 'pending',
  -- Mirrors predictions.status when settled; kept separately so user can void independently.
  result_value numeric,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, prediction_id)
);

create index user_bets_user_idx on user_bets(user_id, created_at desc);

-- =============================================================================
-- SYSTEM SCORE — +1.0 / -0.5 mekanizması
-- Single live row + immutable history.
-- =============================================================================
create table system_score (
  id boolean primary key default true check (id),  -- singleton enforced
  score numeric not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  voids integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into system_score (id) values (true) on conflict do nothing;

create table system_score_history (
  id bigserial primary key,
  prediction_id uuid references predictions(id) on delete set null,
  delta numeric not null,
  outcome bet_status not null,
  score_after numeric not null,
  recorded_at timestamptz not null default now()
);

create index system_score_history_recorded_idx on system_score_history(recorded_at desc);

-- =============================================================================
-- ODDS SNAPSHOTS — value/arbitrage tespiti için
-- =============================================================================
create table odds_snapshots (
  id bigserial primary key,
  game_id integer not null references games(id) on delete cascade,
  player_id integer references players(id) on delete cascade,
  market prop_market not null,
  line numeric not null,
  pick pick_side not null,
  bookmaker text not null,
  odds numeric not null,
  captured_at timestamptz not null default now()
);

create index odds_snapshots_lookup_idx
  on odds_snapshots(game_id, player_id, market, line, pick, captured_at desc);
create index odds_snapshots_captured_idx on odds_snapshots(captured_at desc);

-- =============================================================================
-- SIGNALS — off-court inputs (magazin, sosyal medya, newsletter)
-- =============================================================================
create table signals (
  id bigserial primary key,
  player_id integer references players(id) on delete cascade,
  team_id integer references teams(id) on delete cascade,
  source signal_source not null,
  source_url text,
  source_id text,
  summary text not null,
  sentiment numeric check (sentiment between -1 and 1),
  -- weight: engine multiplier for this signal in confidence scoring
  weight numeric not null default 0.0,
  captured_at timestamptz not null default now(),
  occurred_at timestamptz,
  raw jsonb,
  -- prevent duplicate ingest from the same source
  unique (source, source_id)
);

create index signals_player_idx on signals(player_id, captured_at desc);
create index signals_team_idx on signals(team_id, captured_at desc);
create index signals_recent_idx on signals(captured_at desc);

-- =============================================================================
-- PATTERNS — engine'in tespit ettiği döngüler/anomaliler
-- =============================================================================
create table patterns (
  id bigserial primary key,
  player_id integer references players(id) on delete cascade,
  team_id integer references teams(id) on delete cascade,
  pattern_type text not null,    -- e.g. 'cycle', 'home_away_split', 'rest_day_dip'
  market prop_market,
  description text not null,
  confidence numeric check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  expires_at timestamptz
);

create index patterns_player_idx on patterns(player_id);
create index patterns_team_idx on patterns(team_id);
create index patterns_expires_idx on patterns(expires_at);

-- =============================================================================
-- RLS — Row Level Security
-- Engine-owned tables (predictions, odds_snapshots, signals, patterns, stats):
--   readable by any authenticated user; writes only via service role.
-- user_bets: each user sees only their own rows.
-- =============================================================================
alter table teams enable row level security;
alter table players enable row level security;
alter table games enable row level security;
alter table player_game_stats enable row level security;
alter table predictions enable row level security;
alter table user_bets enable row level security;
alter table system_score enable row level security;
alter table system_score_history enable row level security;
alter table odds_snapshots enable row level security;
alter table signals enable row level security;
alter table patterns enable row level security;

-- Public read for reference + engine tables
create policy "read teams" on teams for select using (true);
create policy "read players" on players for select using (true);
create policy "read games" on games for select using (true);
create policy "read player_game_stats" on player_game_stats for select using (true);
create policy "read predictions" on predictions for select using (true);
create policy "read system_score" on system_score for select using (true);
create policy "read system_score_history" on system_score_history for select using (true);
create policy "read odds_snapshots" on odds_snapshots for select using (true);
create policy "read signals" on signals for select using (true);
create policy "read patterns" on patterns for select using (true);

-- user_bets: per-user access only
create policy "user reads own bets"
  on user_bets for select
  using (auth.uid() = user_id);

create policy "user inserts own bets"
  on user_bets for insert
  with check (auth.uid() = user_id);

create policy "user updates own bets"
  on user_bets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user deletes own bets"
  on user_bets for delete
  using (auth.uid() = user_id);

-- =============================================================================
-- updated_at trigger
-- =============================================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger teams_updated before update on teams
  for each row execute function set_updated_at();
create trigger players_updated before update on players
  for each row execute function set_updated_at();
create trigger games_updated before update on games
  for each row execute function set_updated_at();
create trigger predictions_updated before update on predictions
  for each row execute function set_updated_at();
create trigger user_bets_updated before update on user_bets
  for each row execute function set_updated_at();
