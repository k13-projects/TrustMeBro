# Backend reliability — 2026-09-16

Scope: fix today's ESPN date-range 400 that silently killed two soccer crons,
close the provider-health blind spot that let it go undetected, add a cron
run log + `/api/health` crons block, and add on-visit settlement so picks
don't wait for the once-daily cron to grade.

## Status
PASS

## Summary
- `listMatchesInRange` (`src/lib/sports/soccer/espn.ts`) now walks the date
  window day by day with the single-date scoreboard form instead of ESPN's
  `dates=YYYY-YYYY` range form, which started answering 400 on both hosts
  today. Same signature, same de-duped return shape — no caller changes.
- `fetchJson` (same file) now calls `recordFailure` on **any** non-ok
  response before throwing, not only 403/5xx — the exact gap that let
  today's 400 leave `soccer_provider_health` green while both crons failed
  in under a second.
- `recordSuccess` (`provider-health.ts`) now clears `last_error` on a
  success. Verified live against prod: the row was stuck at `status: ok`
  with `last_error: 'simulated outage for testing'` before this fix; that
  exact stale state is what it now clears.
- New migration `0035_cron_runs.sql`: `cron_runs` table (job, started_at,
  finished_at, ok, summary jsonb, error), RLS on, service-role only, indexed
  on `(job, started_at desc)`. **Not yet applied to prod** — Kazim applies
  migrations.
- New `src/lib/ingest/cron-runs.ts`: `runCronJob(job, fn)` wraps a cron body,
  logs start/finish/ok/summary-or-error to `cron_runs`, never rethrows.
  `getLastCronRuns(jobs)` reads the latest run + "successful within 26h"
  per job in one query. All five soccer crons
  (`sync-fixtures`, `track-odds`, `generate-predictions`, `settle-bets`,
  `scrape-news`) now go through it.
- `sync-fixtures` and `settle-bets` additionally wrap each competition in
  its own try/catch: one competition's failure no longer stops the others.
  Route returns 200 + `ok:false` + a per-competition `errors` map when some
  (not all) failed; 500 only when every competition failed.
- New `src/lib/ingest/soccer-settle.ts`: extracts the settlement sequence
  (`settleOneCompetition` = settleSoccer + gradeScoreCalls per competition;
  `finishSoccerSettlement` = voidStaleSoccerRows + settleSoccerCouponLegs +
  settleSoccerCoupons, run once) so the `settle-bets` cron and the new
  on-visit settlement call the identical sequence and can't drift apart.
  Also exports `hasSettleWork` (cheap gate: does this competition have a
  pending prediction whose match already finished) and `settleOnVisit`
  (refreshStaleMatches, then only runs the settlement sequence if
  `hasSettleWork` says there's something to grade — zero writes otherwise).
- `/api/health` now also reads `getLastCronRuns` and adds a `crons` array
  (job, lastStartedAt, ok, overdue, error) plus a top-level `status` that
  folds in both provider health and cron health — degraded if either the
  provider is degraded or any cron is overdue (no successful run in 26h) or
  its last run failed. Verified against the War Room canary's actual parser
  (`.k13/selftest`): it already accepts "a top-level status or one nested a
  single level down", so this is additive and doesn't change how
  `providers.status` alone was being read before.
- `src/app/football/page.tsx`: added a second `after()` + `maybeRefresh`
  call inside the existing `if (live)` block (same pattern as the fixtures
  refresh already there), key `soccer_settle:${competition}`, 5-minute
  throttle, calling `settleOnVisit(competition)`.

## For Kazim
Today ESPN quietly broke the way the site checks a date range of matches,
so two of the football crons (syncing fixtures and settling bets) were
failing every run without anything telling us — that's fixed, and now the
site keeps a log of every cron run so `/api/health` can say "this job hasn't
run successfully in over a day" instead of staying silent again. Picks for
finished matches now also get graded the moment someone visits the football
page, not just once a day.

## Files
- `src/lib/sports/soccer/espn.ts` — day-by-day range fix + broadened failure recording
- `src/lib/sports/soccer/provider-health.ts` — `recordSuccess` clears `last_error`
- `src/lib/sports/soccer/live.ts` — unchanged (read only, to confirm `refreshStaleMatches`/`syncCompetition` contracts)
- `src/db/migrations/0035_cron_runs.sql` — new, not yet applied to prod
- `src/lib/ingest/cron-runs.ts` — new (`runCronJob`, `getLastCronRuns`, `SOCCER_CRON_JOBS`)
- `src/lib/ingest/soccer-settle.ts` — new (shared settlement sequence + on-visit gate)
- `src/app/api/cron/soccer/sync-fixtures/route.ts`
- `src/app/api/cron/soccer/track-odds/route.ts`
- `src/app/api/cron/soccer/generate-predictions/route.ts`
- `src/app/api/cron/soccer/settle-bets/route.ts`
- `src/app/api/cron/soccer/scrape-news/route.ts`
- `src/app/api/health/route.ts`
- `src/app/football/page.tsx` — one added `after()` block inside the existing `if (live)` section

## Risks
- **Migration 0035 is not applied to prod.** Until it is, every `runCronJob`
  insert will fail against a missing table — caught (`insertErr` is logged,
  not thrown) so the crons themselves keep working exactly as before, but no
  run gets logged and `/api/health`'s `crons` block will show every job as
  `overdue: true` (no rows at all) until the migration lands and the next
  cron cycle completes. This is expected, not a bug — flagged so it isn't
  mistaken for a new outage right after this ships.
- **`listMatchesInRange` now issues N requests instead of 1** for an
  N-day window. The daily cron windows are small (2–5 days), well within the
  120s `maxDuration` on `sync-fixtures`, but a large manual backfill
  (`back`/`ahead` up to 400) will now be proportionally slower and make many
  more sequential calls to ESPN. Not parallelized on purpose — didn't want to
  add a thundering-herd risk against the same host that broke today.
- **The on-visit settlement gate (`hasSettleWork`) only checks
  `soccer_predictions`** (engine picks), per the task's literal spec ("no
  pending prediction whose match is finished"). A match that finishes with
  only a user-built coupon leg pending (no engine prediction on it) won't
  trigger on-visit settlement for that leg — it still grades at the next
  daily `settle-bets` cron. Documented rather than silently expanded, since
  broadening the gate changes cost/behavior beyond what was asked.
- Two other agents were editing this same working tree concurrently
  (`src/components/soccer/*`, `src/lib/analysis/soccer/coupons.ts`,
  `engine.ts`, plus new migration `0036_repair_pre_kickoff_leg.sql`) — none
  of that is mine and I did not touch it; noted here only so the diff isn't
  mistaken for scope creep on my part.
- `npx tsc --noEmit -p .` reports two pre-existing errors in generated
  `.next/types/*` files (duplicate identifiers), unrelated to any file I
  touched — no error under any file in my scope. Left alone since the task
  said not to run `next build` and this looks like an artifact of the
  concurrent sessions' own dev/build activity, not something my changes
  caused.

## Next
qa-test-engineer (Olga) once migration 0035 is applied — specifically to
verify: (1) `/api/health` shows a real `crons` block after a cron cycle,
(2) the football page's on-visit settlement doesn't do extra writes on a
normal visit, (3) `listMatchesInRange`'s day-by-day walk still returns the
right matches for a real multi-day window. Then security-auditor (Irina)
only if she wants a quick look at the new `cron_runs` RLS posture (same
service-role-only shape as `ingest_state`, nothing new to review there).

## Human gate
Apply migration `0035_cron_runs.sql` to prod (Kazim applies migrations per
this session's brief) — until then the crons run fine but nothing gets
logged. No other irreversible/destructive/money items in this pass.
