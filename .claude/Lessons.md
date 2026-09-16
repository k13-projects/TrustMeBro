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

## 2026-09-16 — Know whether a job is additive before you reason about its output
- **What happened:** after tightening the engine, 18 pending picks remained
  that the new gates would refuse. A decision was recorded to "let them ride,
  no retro edits" — which read well and was wrong, because
  `generate-predictions` deletes this competition's pending coupons and
  pending predictions for the slate and rebuilds them from current odds. The
  daily 15:00 UTC run would have overwritten them regardless, so the rule
  described behaviour the system does not have. Caught by asking whether the
  cron was safe to run by hand, not by reading the decision again.
- **Rule:** before deciding what should happen to rows, read the writer. Is it
  insert-only, upsert, or delete-and-rebuild? A policy that contradicts the
  job's actual behaviour is not a policy, it is a surprise waiting for the
  next scheduled run.
- **The real distinction:** *settled* rows are the record and are immutable
  (migration 0034). *Pending* rows are live quotes and are refreshed. "No
  retro edits" is a promise about the former only. Stating it about both
  sounds stronger and means less.
- **Never hand-run `generate-predictions` to fix a slate.** It is scoped to
  pending rows in the window, so running it mid-matchday deletes picks
  attached to matches already kicked off.
- **A null result is a result.** Soccer's new EV gates were backtested against
  513 graded NBA picks and made things *worse*: NBA's only profitable band is
  the high-EV one soccer discards, because soccer's EV comes from a de-vigged
  market consensus while NBA's is a confidence score wearing a probability's
  clothes. Same field name, different meaning. Nothing was shipped for NBA,
  and the numbers were written into the code so the next season does not
  re-derive it. **Do not port a constant between two engines because the
  column names match.**

## 2026-09-16 — Measure a cleanup rule before you trust it, especially on accented text
- **What happened:** the news-tagging repair (0038) deliberately removed only
  the 163 (row, team) pairs it could *prove* wrong, leaving anything it merely
  could not corroborate. Reviewing it, one known-bad row survived, and the
  obvious "tighten it up" rule was: drop any tag whose club name never appears
  in the stored text. Measured first: that rule hit **713 rows**, and the
  sample was almost entirely *correct* tags — "Fenerbahçe" vs stored
  `Fenerbahce`, "Atlético Madrid" vs `Atletico Madrid`, Turkish suffixed forms.
  The rule was not stricter, it was just diacritic-blind. Running it would have
  stripped hundreds of good tags to remove one bad one.
- **Rule:** any text rule touching club, player or place names goes through
  the project's folding (`normalizeTeamName`, or `foldForScan` where running
  prose means apostrophes must survive). Turkish is the tripwire here: dotless
  ı has no NFKD decomposition, and a possessive suffix glued on with an
  apostrophe ("Sporting'e") breaks a naive word-boundary match.
- **Rule:** before applying a data-cleanup predicate, run it as a SELECT and
  *read the rows it would change*. A count alone would have looked like a
  bigger, better cleanup.
- **Under-removal beats over-removal on a shared record.** Leaving a wrong tag
  is a visible blemish on one page; deleting a right one silently loses
  information nobody will think to look for again.
- **Known residual (accepted, 2026-09-16):** one Guardian piece about Leeds is
  still tagged Sporting CP, almost certainly from the phrase "sporting
  director" in the untrimmed body the stored summary no longer contains. It is
  one row of 2,044, it ages out of a recency-ordered list, and the code fix
  stops new ones. Not worth hand-curating a single row.

## 2026-09-16 — A skip-if-done gate does not bound a job that can produce nothing
- **What happened:** BTTS odds are billed per match, so the credit control was
  "never fetch a match that already has a BTTS snapshot." Correct, and not
  sufficient: a match no bookmaker has priced yet stores nothing, stays a
  candidate, and is retried on every run across the full 8-day odds window —
  up to 8 credits for a match that may never be quoted at all. At ~135 matches
  in a peak month that pathology alone could outrun the 500-credit free tier
  and take the *bulk* pull down with it, which is the pipeline we actually
  depend on. Caught in review, before it ever ran.
- **Rule:** when a job's skip condition is "we already have the result", ask
  what happens when the result is legitimately empty. An empty result is not a
  completed one, and the retry is invisible because nothing is written.
- **The fix is a bound, not a better memory.** BTTS is attempted only within
  `BTTS_LEAD_HOURS` of kickoff, so an unpriced match gets at most two attempts
  instead of eight. Same shape as the Süper Lig `oddsCadence` fix (2026-09-14):
  when a window keeps re-satisfying itself, narrowing the window is not the
  answer — cap the number of attempts.
- **Free tiers fail closed, and they take their neighbours with them.** The
  ceiling is shared across every competition and every market, so an
  unbounded new consumer does not degrade itself, it starves the core feed.
  Budget any new consumer against the *peak* month and write the projection
  down where it will be checked.

## 2026-09-16 — A count is not a width, and a label is not a name
- **What happened (findability):** the top nav was hard to use not because the
  dropdowns were broken — hover, click, Escape and arrow keys all worked — but
  because its words meant the opposite of what they mean in football.
  "Results" and "Scoreboard" both sat under Picks and both meant *our graded
  bets*, so anyone hunting match scores opened the wrong menu and landed in a
  bet ledger. Three more labels disagreed with the heading of the page they
  opened (Standings/League Table, Odds/Match Odds, Predictions/Call the Scores).
- **Rule:** a nav label must match the `<h1>` of the page it opens. When they
  drift, the menu is lying, and no amount of dropdown polish fixes it.
- **Rule:** in a domain with its own vocabulary, check every label against the
  domain meaning first. "Results", "Scoreboard", "Table", "Fixtures" are taken
  words in football; using them for our own concepts guarantees a wrong turn.
- **Rule:** one group, one question. "Picks" held our opinion, the market's
  prices, our track record and a help page. Splitting forward-looking (Picks)
  from the record (Record) is what actually made things findable.
- **What happened (layout):** `dense = navItems.length > 6` decided which
  breakpoint the row used. **A count is not a width.** The file carried two
  stale comments contradicting each other *and* the code — the signature of a
  rule nobody has ever checked — and a sixth group overflowed 1024px by 24px,
  clipping the sign-in button.
- **Rule:** a breakpoint is measured (`scrollWidth` vs `clientWidth` at real
  viewports) and then *declared* next to the thing it describes, with the
  number written down. Re-measure when a top-level label changes.
- **Ask for pixels, not opinions.** "Does the nav fit?" gets a yes. "Measure
  scrollWidth against clientWidth at 1024, 1152, 1280" gets the bug. And when
  picking the new boundary, measure it rather than interpolating between two
  other measurements — the interpolation said "probably fine", the measurement
  said 42px of clearance, and only one of those is checkable.
- **Motion that moves via JS cannot be gated by CSS.** The nav's hover pill and
  active dot travel by sharing a framer `layoutId`. The
  `prefers-reduced-motion` rule meant to cover them targeted class names the
  component never used, so it did nothing for months and looked handled.
  Gating means dropping the `layoutId`, via `useReducedMotion`.
