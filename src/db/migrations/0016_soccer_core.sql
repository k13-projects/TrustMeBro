-- Soccer (Football) core schema — World Cup first, then Süper Lig / EPL / La Liga.
-- Migration 0016. Forward-only.
--
-- Design: soccer lives in its own parallel tables rather than overloading the
-- NBA `predictions`/`games`/`odds_snapshots` tables. The shapes genuinely
-- differ (no player dimension; match-level markets; home/draw/away sides), and
-- a separate engine ledger is exactly what "completely separate scoreboards"
-- requires. NBA tables are untouched (implicitly sport = 'nba').
--
-- Markets (MVP, match-level only — no player props):
--   match_winner → side home | draw | away
--   total_goals  → side over | under, with `line` (e.g. 2.5)
--   btts         → side yes | no   (both teams to score)

-- =============================================================================
-- ENUMS
-- =============================================================================
create type soccer_market as enum ('match_winner', 'total_goals', 'btts');

create type match_side as enum (
  'home', 'draw', 'away',  -- match_winner
  'over', 'under',         -- total_goals
  'yes', 'no'              -- btts
);

-- Dependencies from 0001 (bet_status enum, set_updated_at trigger fn). Normally
-- present, but guard them so this migration stands alone on a fresh project.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'bet_status') then
    create type bet_status as enum ('pending', 'won', 'lost', 'void');
  end if;
end $$;

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================================================
-- REFERENCE — teams (national teams / clubs), cached from ESPN soccer API.
-- IDs mirror ESPN's stable integer ids.
-- =============================================================================
create table soccer_teams (
  id integer primary key,
  name text not null,
  abbreviation text not null default '',
  country text not null default '',
  crest_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- MATCHES — fixtures + live/finished scores (ESPN event ids).
-- =============================================================================
create table soccer_matches (
  id integer primary key,
  date date not null,
  datetime timestamptz,
  season integer not null default 0,
  status text not null default '',       -- ESPN status description
  state text not null default 'pre',     -- pre | in | post
  period integer not null default 0,
  clock text,
  stage text,                            -- 'Group Stage', 'Round of 16', ...
  grp text,                              -- group label, e.g. 'Group A'
  home_team_id integer not null references soccer_teams(id),
  away_team_id integer not null references soccer_teams(id),
  home_score integer not null default 0,
  away_score integer not null default 0,
  finished boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index soccer_matches_date_idx on soccer_matches(date);
create index soccer_matches_state_idx on soccer_matches(state);
create index soccer_matches_home_idx on soccer_matches(home_team_id);
create index soccer_matches_away_idx on soccer_matches(away_team_id);

-- =============================================================================
-- STANDINGS — group/league table snapshots (latest per team by captured_at).
-- =============================================================================
create table soccer_standings (
  id bigserial primary key,
  team_id integer not null references soccer_teams(id) on delete cascade,
  grp text,
  rank integer not null default 0,
  played integer not null default 0,
  won integer not null default 0,
  draw integer not null default 0,
  lost integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  goal_diff integer not null default 0,
  points integer not null default 0,
  captured_at timestamptz not null default now()
);

create index soccer_standings_team_idx on soccer_standings(team_id, captured_at desc);
create index soccer_standings_captured_idx on soccer_standings(captured_at desc);

-- =============================================================================
-- ODDS SNAPSHOTS — one row per (match, market, side, bookmaker) capture.
-- `line` is null for match_winner / btts, set for total_goals.
-- =============================================================================
create table soccer_odds_snapshots (
  id bigserial primary key,
  match_id integer not null references soccer_matches(id) on delete cascade,
  market soccer_market not null,
  side match_side not null,
  line numeric,
  bookmaker text not null,
  odds numeric not null,              -- decimal odds
  captured_at timestamptz not null default now()
);

create index soccer_odds_lookup_idx
  on soccer_odds_snapshots(match_id, market, side, captured_at desc);
create index soccer_odds_captured_idx on soccer_odds_snapshots(captured_at desc);

-- =============================================================================
-- PREDICTIONS — engine output. Confidence = de-vigged consensus probability
-- (0..1 in `probability`, scaled to 0..100 in `confidence`) nudged by form.
-- =============================================================================
create table soccer_predictions (
  id uuid primary key default gen_random_uuid(),
  match_id integer not null references soccer_matches(id) on delete cascade,
  market soccer_market not null,
  side match_side not null,
  line numeric,                       -- total_goals only
  probability numeric not null check (probability between 0 and 1),
  confidence numeric not null check (confidence between 0 and 100),
  best_odds numeric not null,         -- best decimal price across books for this side
  bookmaker text,                     -- book offering best_odds
  expected_value numeric,
  reasoning jsonb not null default '{}'::jsonb,  -- {checks: [...], signals: [...]}
  is_banko boolean not null default false,       -- "most trusted" flag
  status bet_status not null default 'pending',
  settled_side match_side,            -- actual winning side once finished
  generated_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One pick per (match, market, side, line). COALESCE folds the nullable line.
create unique index soccer_predictions_unique_idx
  on soccer_predictions(match_id, market, side, coalesce(line, -1));
create index soccer_predictions_match_idx on soccer_predictions(match_id);
create index soccer_predictions_status_idx on soccer_predictions(status);
create index soccer_predictions_banko_idx on soccer_predictions(is_banko) where is_banko = true;
create index soccer_predictions_generated_idx on soccer_predictions(generated_at desc);

-- =============================================================================
-- SCOREBOARD — separate engine ledger for soccer (never mixed with NBA).
-- =============================================================================
create table soccer_system_score (
  id boolean primary key default true check (id),   -- singleton
  score numeric not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  voids integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into soccer_system_score (id) values (true) on conflict do nothing;

create table soccer_system_score_history (
  id bigserial primary key,
  prediction_id uuid references soccer_predictions(id) on delete set null,
  delta numeric not null,
  outcome bet_status not null,
  score_after numeric not null,
  recorded_at timestamptz not null default now()
);

create index soccer_score_history_recorded_idx
  on soccer_system_score_history(recorded_at desc);

-- =============================================================================
-- RLS — public read on all soccer reference/engine tables; writes via service
-- role only (no client write policies), mirroring the NBA engine tables.
-- =============================================================================
alter table soccer_teams enable row level security;
alter table soccer_matches enable row level security;
alter table soccer_standings enable row level security;
alter table soccer_odds_snapshots enable row level security;
alter table soccer_predictions enable row level security;
alter table soccer_system_score enable row level security;
alter table soccer_system_score_history enable row level security;

create policy "read soccer_teams" on soccer_teams for select using (true);
create policy "read soccer_matches" on soccer_matches for select using (true);
create policy "read soccer_standings" on soccer_standings for select using (true);
create policy "read soccer_odds_snapshots" on soccer_odds_snapshots for select using (true);
create policy "read soccer_predictions" on soccer_predictions for select using (true);
create policy "read soccer_system_score" on soccer_system_score for select using (true);
create policy "read soccer_system_score_history" on soccer_system_score_history for select using (true);

-- =============================================================================
-- updated_at triggers (reuse set_updated_at() from 0001)
-- =============================================================================
create trigger soccer_teams_updated before update on soccer_teams
  for each row execute function set_updated_at();
create trigger soccer_matches_updated before update on soccer_matches
  for each row execute function set_updated_at();
create trigger soccer_predictions_updated before update on soccer_predictions
  for each row execute function set_updated_at();
