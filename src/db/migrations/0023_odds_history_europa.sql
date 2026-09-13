-- Migration 0023: odds movement history + Europa / Conference League ledgers.
-- Forward-only, idempotent, additive.
--
-- Raw bookmaker snapshots (soccer_odds_snapshots) are pruned after 48h to keep
-- the table small. To show how a price *moved* in the days before kickoff we
-- keep one compact consensus row per (match, market, side, line) per
-- track-odds run: the de-vigged probability, the best price and how many
-- books were in. Tiny (a few rows per match per day) and never pruned.

create table if not exists soccer_odds_history (
  id bigserial primary key,
  match_id integer not null references soccer_matches(id) on delete cascade,
  market soccer_market not null,
  side match_side not null,
  line numeric,
  prob numeric not null,           -- de-vigged consensus, 0..1
  best_odds numeric,               -- best decimal price across books
  book_count integer not null default 0,
  captured_at timestamptz not null default now()
);

create index if not exists soccer_odds_history_match_idx
  on soccer_odds_history(match_id, market, side, captured_at);

alter table soccer_odds_history enable row level security;
drop policy if exists "read soccer_odds_history" on soccer_odds_history;
create policy "read soccer_odds_history" on soccer_odds_history for select using (true);
grant select on soccer_odds_history to anon, authenticated;
grant select, insert, delete on soccer_odds_history to service_role;

-- New live competitions get their own zeroed ledgers + refresh bookkeeping.
insert into soccer_ledgers (competition) values ('uefa.europa'), ('uefa.europa.conf')
on conflict (competition) do nothing;

insert into ingest_state (key) values
  ('soccer_fixtures:uefa.europa'), ('soccer_news:uefa.europa'),
  ('soccer_fixtures:uefa.europa.conf'), ('soccer_news:uefa.europa.conf')
on conflict (key) do nothing;
