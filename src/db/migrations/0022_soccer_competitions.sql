-- Migration 0022: football goes multi-competition (Champions League joins the
-- World Cup). Forward-only, idempotent, purely additive.
--
-- Every soccer row now says which competition it belongs to. Existing rows are
-- all World Cup 2026 ('fifa.world'), so the defaults freeze that record exactly
-- as it finished — nothing is moved, nothing is deleted. The Champions League
-- ('uefa.champions') writes alongside it. Ids are ESPN league slugs.
--
-- The engine ledger becomes one row per competition (soccer_ledgers). The old
-- singleton soccer_system_score is left in place, untouched, as the World Cup
-- archive copy; the app reads/writes soccer_ledgers from here on.

-- ---------------------------------------------------------------------------
-- 1. competition tag on fixtures / standings / picks / news / engine coupons
-- ---------------------------------------------------------------------------
alter table soccer_matches
  add column if not exists competition text not null default 'fifa.world',
  add column if not exists league_slug text not null default 'fifa.world',  -- ESPN slug the row came from (qualifying lives under *_qual)
  add column if not exists venue text;

create index if not exists soccer_matches_competition_date_idx
  on soccer_matches(competition, date);

alter table soccer_standings
  add column if not exists competition text not null default 'fifa.world';

create index if not exists soccer_standings_competition_idx
  on soccer_standings(competition, captured_at desc);

alter table soccer_predictions
  add column if not exists competition text not null default 'fifa.world';

create index if not exists soccer_predictions_competition_status_idx
  on soccer_predictions(competition, status);

alter table soccer_news
  add column if not exists competition text not null default 'fifa.world';

create index if not exists soccer_news_competition_published_idx
  on soccer_news(competition, published_at desc);

alter table engine_coupons
  add column if not exists competition text;

-- Existing soccer coupons are all World Cup.
update engine_coupons set competition = 'fifa.world'
  where sport = 'soccer' and competition is null;

create index if not exists engine_coupons_competition_status_idx
  on engine_coupons(sport, competition, status);

-- Club brand colour (ESPN `color`, hex without '#'). Null for national teams.
alter table soccer_teams
  add column if not exists color text,
  add column if not exists alt_color text;

-- ---------------------------------------------------------------------------
-- 2. one ledger per competition
-- ---------------------------------------------------------------------------
create table if not exists soccer_ledgers (
  competition text primary key,
  score numeric not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  voids integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Carry the World Cup ledger over verbatim (score 16, 107W-91L at time of
-- writing) and open a zeroed Champions League ledger.
insert into soccer_ledgers (competition, score, wins, losses, voids, updated_at)
select 'fifa.world', score, wins, losses, voids, updated_at
  from soccer_system_score where id = true
on conflict (competition) do nothing;

insert into soccer_ledgers (competition) values ('uefa.champions')
on conflict (competition) do nothing;

alter table soccer_system_score_history
  add column if not exists competition text not null default 'fifa.world';

create index if not exists soccer_score_history_competition_idx
  on soccer_system_score_history(competition, recorded_at);

-- ---------------------------------------------------------------------------
-- 3. RLS / grants — public read, service-role writes (same as 0016)
-- ---------------------------------------------------------------------------
alter table soccer_ledgers enable row level security;
drop policy if exists "read soccer_ledgers" on soccer_ledgers;
create policy "read soccer_ledgers" on soccer_ledgers for select using (true);
grant select on soccer_ledgers to anon, authenticated;
grant select, insert, update on soccer_ledgers to service_role;

-- Refresh bookkeeping rows for the new competition-scoped jobs.
insert into ingest_state (key) values
  ('soccer_fixtures:uefa.champions'),
  ('soccer_news:uefa.champions')
on conflict (key) do nothing;
