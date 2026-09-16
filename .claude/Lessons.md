# Lessons

Corrections and hard-won rules for this project. Append; never rewrite history.

## 2026-09-13 — ESPN blocks Vercel on `site.api.espn.com`; use `site.web.api.espn.com`
- **What happened:** From 2026-09-10 every server-side ESPN call from production
  returned 403 "Access Denied" (Akamai). Local dev kept working, so the daily
  sync/settle crons failed silently for three days and four finished matches
  sat at "Halftime". The World Cup never hit this because it ended in July.
- **Rule:** All ESPN "site" API calls go through `site.web.api.espn.com` (same
  paths, same payloads) with a fallback to the other host on 403. Never trust
  "works locally" for third-party feeds; verify from prod (`/api/soccer/live`
  surfaces the upstream error text).
- **Safety nets now in place:** every competition sync re-reads matches that
  kicked off 3h+ ago and aren't final; a failed on-visit refresh does not
  update `last_run_at`, so it retries on the next visit.

## 2026-09-14 — An upstream can fail silently; make it impossible
- **Rule:** any third-party data source gets (a) a fallback, (b) a recorded
  health state, (c) something visible on the page when the fallback is live,
  and (d) an alert on the transition. A provider that fails quietly looks
  exactly like a quiet week.
- **Always return to the primary.** The fallback is never sticky: every call
  tries the primary first, and while degraded each page view re-probes it in
  the background so recovery needs no human and no cron.
- **Test the fallback by breaking something real.** The recovery path was
  proved by setting a finished match back to 0–0 "Halftime" and watching the
  backup feed restore 1–0 Full Time, not by reading the code.

## 2026-09-14 — A fallback source needs an independent failure domain, and its name table needs to be measured
- **Rule:** a "fallback" on the same infrastructure as the primary is not a
  fallback. `cdn.espn.com` was rejected for this reason (it also ignores the
  `dates` param and returns the same six matches for every query, which would
  have served wrong data silently). UEFA's own feed at `match.uefa.com` is the
  real thing: the organising body, no key, no account, no shared failure domain.
- **Prove name reconciliation with a number, not a reading.** Matching a new
  source's fixtures to our rows was 78% on first run and looked fine in the
  code. A throwaway route that counted matched-vs-missed across every finished
  match, printing the actual misses, took it to 96% in three passes. Build the
  measurement, then delete it.
- **Alias tables can contain cycles, and a cycle is invisible.**
  `"red star belgrade": "crvena zvezda"` and `"crvena zvezda": "red star
  belgrade"` both existed. Each name canonicalised to the other, so the two
  spellings could never compare equal, and that club had been unmatchable for
  as long as the pair had been there. Any time `CLUB_ALIASES` grows, assert no
  alias value is itself an alias key.
- **Read the source's own score shape before trusting it.** UEFA exposes
  `regular`, `total`, `aggregate` and `penalty`. `total` includes extra time
  (Rapid v Hearts is 1-1 regular, 2-2 total) and is the one we want;
  `aggregate` is the two-legged tie, not the match, and using it would have
  quietly corrupted knockout results.
- **Unmatched is not always unmatchable.** The 18 remaining Conference League
  misses are July qualifiers for five clubs ESPN never gave us a row for. There
  is nothing for a score to attach to, so that is an upstream coverage gap and
  not a bug to chase.
- **The account is in `~/.claude.json`, not in the context line** (2026-09-14,
  refined 2026-09-15). The session's injected "user's email address is …" line is a
  snapshot from session start and does not follow an account switch. It read
  `algosift@gmail.com` while the terminal was live on `eren@tigerhospitalitygroup.com`
  — Kazim had switched to algosift and back, so the line was **stale, not wrong**.
  Since he switches whenever one account runs out of tokens, treat it as stale by
  default.
  Acting on it produced a false Gold-Rule caveat in the API/DB consumption audit:
  a Vercel verification was reported as blocked when it never was. Check
  `oauthAccount.emailAddress` in `~/.claude.json` before making any claim about
  which account is active — and pass the verified value to subagents, since one
  of them repeated the same wrong inference in its own report. The NBA question
  that caveat left open was ultimately answered from the data instead: newest
  `predictions` row was 2026-06-13 and `odds_snapshots` was empty, confirming the
  NBA crons are dormant.
- **Always hand over the local URL when something is ready to look at**
  (Kazim, 2026-09-14). Saying "it's on branch X, take a look" is not a
  handover — he has to go find the port, guess the route, and set a cookie to
  reach a competition-scoped page. Every message that reports work ready for
  his eyes must carry the actual clickable link(s): the page itself, plus the
  one or two states worth seeing (a filtered view, the surface it's reached
  from). Confirm the dev server is actually answering first, rather than
  assuming it survived a `.next` wipe or a restart. Applies to any "have a
  look" message, not just this project's football pages.

## 2026-09-16 — A 400 is an outage too; log the job, not just the host
- **What happened:** ESPN started answering HTTP 400 ("Failed to get events
  endpoint.") to every date-range scoreboard query (`dates=YYYYMMDD-YYYYMMDD`)
  on both hosts. Only `listMatchesInRange` used that form, and only the
  sync-fixtures and settle-bets crons call it, so both died in half a second
  while the news and odds crons kept running. The health monitor stayed green
  because `fetchJson` only recorded a failure on 403/5xx/network errors; a
  status class it had never seen threw silently. Diagnosed by counting
  standings writes per hour: the 09:00 and 11:30 rows were simply missing.
- **Rule:** any non-2xx from an upstream records a provider failure before it
  throws. Never enumerate the "bad" statuses; enumerate the good one.
- **Rule:** every cron writes one row to `cron_runs` (migration 0035) at start
  and finish. "Did the cron fire" must be a five-second query, not an hour of
  inference from side effects. `/api/health` folds it in: a failed or overdue
  job (no success in 26h) turns `status` non-ok, which the War Room canary
  reads.
- **Rule:** a multi-competition cron wraps each competition in its own
  try/catch. One league's upstream problem must not stop the others.
- **Rule:** ESPN scoreboard is fetched one day at a time. The range form is
  dead; do not bring it back even if it starts answering again.
- **Grading waits for nobody.** Picks now also settle on visit (`settleOnVisit`
  behind `maybeRefresh`, 5-minute throttle), so a finished match grades the
  next time anyone opens the football page instead of at 11:30 UTC tomorrow.
- **Test leftovers are data bugs.** The Sep 15 fallback test marked a
  pre-kickoff Europa match finished, settlement graded a bro's coupon leg
  "lost", and the revert restored the match but not the leg. After any test
  that touches settlement, query for legs/picks graded on unfinished matches
  before calling it done (migration 0036 is the repair).

## 2026-09-16 — A counter you read in JavaScript is a counter you will lose
- **What happened:** the same day settlement became an on-visit job, three
  Europa League picks all graded "won" and the ledger finished at **1**
  instead of 3, while its own `wins` column correctly read 3. All three
  history rows recorded `score_after = 1`. `settleSoccer` read
  `soccer_ledgers.score` into JS, added the delta, and wrote it back, once per
  prediction, with no error check — so two overlapping passes both read the
  same starting score and the later write discarded the earlier one.
- **Why it had never bitten:** settlement used to run from exactly one daily
  cron. Adding `settleOnVisit` meant any two visitors could race it. **A
  concurrency bug is dormant, not absent, until you add the second caller** —
  when you make something run more often, re-read what it writes.
- **Rule:** a running total moves inside Postgres, in one statement. The NBA
  side had `apply_reward()` doing exactly this since day one; soccer never got
  the equivalent until migration 0037 (`apply_soccer_reward`). When two sides
  of the same product disagree about how they write the same shape of data,
  the older working one is usually right.
- **Rule:** `.upsert()` / `.update()` without checking `error` is a silent
  write. Check it or throw.
- **Revoke from PUBLIC, not just the role.** A new function gets EXECUTE for
  PUBLIC by default — the trap `refresh_bro_stats` hit in the 2026-09-15
  audit. 0037 revokes from PUBLIC before granting to `service_role`.
- **Proving it:** the function was exercised won/lost/void plus the fresh-row
  insert branch inside a transaction that was always rolled back, so the proof
  cost no production data. Verify with `score = wins - losses` across every
  competition; drift is the alarm.
