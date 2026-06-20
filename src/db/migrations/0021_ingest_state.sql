-- On-visit refresh bookkeeping. Migration 0021. Forward-only (idempotent).
--
-- Lets the app refresh data lazily when someone actually visits, instead of
-- (only) on a fixed cron — so we don't spend compute while the site is idle.
-- One row per refreshable job. The single-flight claim is a plain atomic
-- conditional UPDATE issued from app code (see src/lib/ingest/refresh.ts): the
-- visitor whose UPDATE matches the row wins and runs the job; concurrent
-- visitors see running=true and no-op. `claimed_at` makes a crashed run (lock
-- stuck true) recoverable once the stale-lock window passes.

create table if not exists ingest_state (
  key text primary key,
  last_run_at timestamptz,           -- last successful completion
  running boolean not null default false,
  claimed_at timestamptz,            -- when the current run was claimed
  updated_at timestamptz not null default now()
);

insert into ingest_state (key) values ('soccer_news')
  on conflict (key) do nothing;

alter table ingest_state enable row level security;
-- Server-only bookkeeping: no anon/auth policies. The service-role client
-- (used by the refresh helper) bypasses RLS.
grant select, insert, update on ingest_state to service_role;
