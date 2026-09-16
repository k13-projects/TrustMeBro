-- Migration 0035: cron run log. Forward-only, idempotent.
--
-- On 2026-09-16 ESPN started answering every date-range scoreboard query
-- with a 400 ("Failed to get events endpoint."). listMatchesInRange is the
-- only caller of that form, and it feeds syncCompetition, which both
-- sync-fixtures (09:00 UTC) and settle-bets (11:30 UTC) depend on -- both
-- crons returned 500 in well under a second and nothing graded, and nothing
-- said so anywhere but the Vercel function logs. fetchJson (espn.ts) only
-- ever called recordFailure on 403/5xx, so soccer_provider_health stayed
-- green through the whole thing (see .claude/Lessons.md 2026-09-14 for the
-- prior instance of this exact silence).
--
-- This is the trace that was missing: one row per cron invocation, with a
-- summary or an error and whether it finished ok, so /api/health can say
-- which job last ran, whether it succeeded, and whether it's overdue --
-- instead of that only being answerable by going and reading logs after the
-- fact.

create table if not exists cron_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- Reads are "last N runs for job X", always ordered newest first.
create index if not exists cron_runs_job_started_idx
  on cron_runs (job, started_at desc);

alter table cron_runs enable row level security;
-- Server-only bookkeeping, same posture as ingest_state (0021): no
-- anon/authenticated policies at all -- not even read. A run's error text
-- can carry request paths and upstream error bodies that, unlike
-- soccer_provider_health's already-public status blurb, were never meant to
-- be client-readable. /api/health reads this table with the service-role
-- client and republishes only a sanitized summary (job, last run, ok,
-- overdue, and a truncated error only when that run failed).
grant select, insert, update on cron_runs to service_role;
