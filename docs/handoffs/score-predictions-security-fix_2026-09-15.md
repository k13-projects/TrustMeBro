# Score-Predictions Security Fix (F-4) — `soccer_score_predictions`

**Stage:** Backend/Integrations (Mariana) · **Date:** 2026-09-15 · **Branch:** `tmb_sep14_v11`
**Type:** One forward-only migration + one code change, applied live and
independently verified with real attack + legitimate-path proofs against the
real database. Every test row reverted.

Read: `docs/handoffs/user-coupons-security_2026-09-15.md` (finding F-4, round-3
addendum), `docs/reports/TrustMeBro_Security-Audit_2026-09-15.html`, and
`src/db/migrations/0032_coupon_tables_server_only_writes.sql` (the pattern
this migration mirrors).

## Status

**Done, verified live, reverted clean.** Same bug shape as F-1/F-1-R on the
coupon tables — RLS trusted row *ownership*, never the *values* being
written — now closed the same structural way: the client write grant is
gone, not patched with another predicate.

## Summary

`soccer_score_predictions` (migration 0024, the bros' score-call game) gave
`authenticated` direct `INSERT`/`UPDATE`/`DELETE`, with an `UPDATE` RLS policy
that checked only `user_id = auth.uid()`. Any signed-in user could `UPDATE`
their own row straight to `{points: 3, graded_at: now()}` through the public
anon key — no exploit technique, an ordinary authenticated PostgREST
request — and it read immediately as a real perfect call on the public
`soccer_prediction_leaderboard`, for a match that was never played. The
auditor proved this live in the round-3 addendum (F-4).

**Fix, same shape as 0032:**

- **Migration `0033_score_predictions_server_only_writes.sql`** — revokes
  `INSERT`/`UPDATE`/`DELETE` on `soccer_score_predictions` from
  `authenticated` **and** `public`; drops the three now-dead write policies
  (SELECT-only is genuinely all a browser client holds afterward — verified,
  not assumed, below). Adds a `BEFORE INSERT OR UPDATE` trigger,
  `enforce_score_prediction_prekickoff()`, that rejects any insert or any
  edit of `home_goals`/`away_goals` once the match has left
  `soccer_matches.state = 'pre'` — the actual kickoff invariant, now checked
  at the table, not only in the API's `hasKickedOff(match.datetime)` check.
  The trigger explicitly ignores a write that only touches `points`/
  `graded_at` (grading), so it never blocks legitimate post-kickoff
  settlement. Also revokes the default `PUBLIC` `EXECUTE` grant Postgres puts
  on the new trigger function (cosmetic — a trigger-typed function can't be
  invoked outside trigger context regardless, same note the round-3 audit
  made about 0032's `enforce_leg_prekickoff()` — but no reason to leave it
  looking like a door).
- **`src/app/api/soccer/predictions/route.ts`** — `POST`/`DELETE` now always
  write through `supabaseAdmin()` (previously branched: the regular
  session-bound client for `kind: "auth"`, admin only for guests). `user_id`/
  `guest_name` still come only from `getRequester()`'s server-verified
  session (`supabase.auth.getUser()` against the real cookie), never from
  request-body input, so routing the auth path through the service-role
  client doesn't weaken identity — it just removes the RLS-write grant that
  made the direct-PostgREST self-award possible. `GET` (own calls, public
  summary, leaderboard) is untouched — those are pure reads and the SELECT
  grants/policies were never part of this bug.
- **Grading path unchanged and untouched:** `gradeScoreCalls()` in
  `src/lib/analysis/soccer/grade-calls.ts` already ran on `supabaseAdmin()`
  and is the only place `points`/`graded_at` are ever written. With the
  client grant gone, it is now also the *only thing in the system* able to
  write those columns at all — the "grading stays server-side only"
  requirement falls out of the grant revoke for free, no separate code
  change needed.

## Verification (live, real anon-key session, fully reverted)

All tests ran against the real Postgres database (`DATABASE_URL`), the real
running app (`next dev` on the project's pinned port), and a real signed-in
Supabase Auth session — same method the round-2/round-3 audit used, nothing
taken on faith. Full sequence:

**1. Attack proof — the exact F-4 repro, plus the surrounding attack
surface, via a real anon-key signed-in throwaway user:**

| Attack | Result |
|---|---|
| Direct `INSERT` (bypassing the API entirely) | `BLOCKED` — `42501 permission denied for table soccer_score_predictions` |
| Direct `UPDATE ... SET points=3, graded_at=now()` on own row (**the named F-4 repro**) | `BLOCKED` — `42501` |
| Direct `UPDATE` of `home_goals`/`away_goals` on own row (not even grading) | `BLOCKED` — `42501` |
| Direct `DELETE` of own row | `BLOCKED` — `42501` |

Grant catalog cross-checked directly (`information_schema.role_table_grants`):
`anon`/`authenticated` hold only `SELECT` (+ inert `REFERENCES`/`TRIGGER`/
`TRUNCATE`) on `soccer_score_predictions`; `INSERT`/`UPDATE`/`DELETE` exist
only for `postgres`/`service_role`. Two independent methods agree, same as
0032's own verification.

**2. Defense-in-depth — proven against a service-role writer directly**
(bypassing the grant revoke entirely, simulating "a future bug re-opens a
write path"):

| Test | Result |
|---|---|
| Service-role `INSERT` on an already-finished match | `BLOCKED` — `match_already_started` |
| Service-role edit of `home_goals`/`away_goals` on a call whose match started after it was placed | `BLOCKED` — `match_already_started` |
| Service-role update of `points`/`graded_at` only, same post-kickoff match (grading) | `SUCCEEDED` — trigger correctly lets grading through |

**3. Legitimate path, end to end through the real, unmodified app code** (a
synthetic pre-kickoff fixture — two fake teams, one fake match under the real
`uefa.champions` competition, kept away from any real match/user):

- Real signed-in cookie session (built the same way `@supabase/ssr` builds
  one in a browser) → real `POST /api/soccer/predictions` → `201`, call
  created.
- Same session → `POST` again with different goals → `200`, call edited
  (still pre-kickoff).
- `GET /api/soccer/predictions?match_ids=...` → own call reflected correctly
  both times.
- Match finished for real (synthetic fixture only — 2-0, matching the call
  exactly) → the real `GET /api/cron/soccer/settle-bets?competition=uefa.champions`
  cron (real `CRON_SECRET`) → `calls_graded: 1`, and the row graded
  `points: 3` (exact score) via the real, unmodified `gradeScoreCalls()`.
  Everything else in that cron response for the run was a no-op against real
  data: `predictions_settled: 0`, `coupons_settled: 0`, `score_delta: 0`,
  `legs_voided: 0`, real `soccer_ledgers` rows byte-identical before/after.
- `soccer_prediction_leaderboard` picked it up correctly: the throwaway
  user's row appeared with `points: 3, exact_scores: 1, right_results: 1`;
  the one real user's row on the board (`72292782-...`) stayed exactly
  `calls: 4, points: 0` throughout — untouched.

**4. One incidental finding from this same test run, reported not fixed
(scope discipline — not what F-4 asked for):** the DELETE route only checks
`hasKickedOff(match.datetime)`, and no DB constraint restricts `DELETE` at
all (the new trigger only covers `INSERT`/`UPDATE`). In the synthetic test, a
user was able to delete their own already-*graded* call (`points: 3`) after
the match finished, purely because `state` had been flipped without also
advancing `datetime` — an artifact of how I constructed the synthetic
fixture, not a real-world race (production always advances both together).
But the underlying gap is real: nothing stops a user from deleting a call
that graded *badly* to scrub it from their own leaderboard history — the
same selective-disclosure shape as F-2 on the coupon board (unsharing a
loser after the fact). Not fixed here since it's outside what was asked;
flagging for the same kind of call Kazim made on F-2.

Separately: hitting the edit endpoint on a match with `state != 'pre'` but a
still-future `datetime` (again, only reachable by directly manipulating
`state` without `datetime`, as in the synthetic test) produced a raw `500`
with the trigger's exception message rather than the API's own clean `409
locked`. The write was still correctly blocked (fail-closed) — this is a
rough error surface, not a security gap — but worth a follow-up
`try/catch` around the DB write in `route.ts` if `state` and `datetime` ever
drift in real data. Not fixed here, same scope-discipline reasoning.

**Cleanup:** every synthetic row removed at the end — verified
`soccer_score_predictions` back to the exact pre-test 5 rows (byte-identical,
including the untouched real user's 4 pending calls and the guest's 1),
`soccer_prediction_leaderboard` back to its single real row, `soccer_ledgers`
(all 4 competitions), `bro_stats` (4 rows), `user_coupons` (22) and
`soccer_coupon_legs` (14) all confirmed unchanged before/after. Throwaway
auth user and both synthetic matches/teams deleted; `0` stray audit rows of
any kind left behind. `tsc --noEmit`, `eslint`, and `next build` all clean.

## Sweep of adjacent "bros"/leaderboard tables

Asked to check whether the same "RLS trusts identity, not values" shape
exists elsewhere. Findings:

- **`soccer_team_follows` (migration 0026) — clean, no fix needed.** Grants
  `INSERT`/`DELETE` (no `UPDATE` at all) to `authenticated`, ownership-only
  RLS. The only non-identity column is `team_id`, FK-checked against real
  teams — there's no forgeable *value* here (no score, no status, no
  numeric a user benefits from inflating). A user can only ever follow a
  real team under their own identity. Not the same bug shape.
- **`profiles` (migration 0011) — clean, no fix needed.** `handle`/
  `display_name`/`bio`/`avatar_url` are self-describing metadata the owner
  is *supposed* to set freely; none of them feed a score, a ledger, or the
  leaderboard's ranking math. A user picking their own display name isn't
  the F-4 shape (an unearned reward), it's the feature working as designed.
- **`soccer_prediction_leaderboard` — a plain `view`, not a matview.** No
  refresh RPC exists (unlike coupons' `refresh_bro_stats()`), so there's no
  analogous `EXECUTE`-grant risk to check — it queries
  `soccer_score_predictions` live, which is exactly the table this migration
  fixes. No `PUBLIC` grant issue on the view itself either (Postgres doesn't
  default-grant anything on views to `PUBLIC`; only functions get that
  default, which is what the 0031 lesson was actually about).
- **`guest_profiles`** — `SELECT` only, no write grant to any client role.
  Clean.
- **`user_coupons` / `soccer_coupon_legs` / `user_coupon_picks` / `bro_stats`
  matview** — already fixed structurally by migration 0032, independently
  re-verified by the round-3 audit. Not re-touched here.
- **New, incidental (not the F-4 shape, reported above under
  Verification §4):** `soccer_score_predictions` has no DB-level restriction
  on `DELETE` at all, letting a user delete their own settled call — a
  selective-disclosure gap (hide a bad result), not a self-award gap (invent
  a good one). Different shape from F-4, not fixed, flagged for a product
  decision the same way F-2 was.

## Files

- `src/db/migrations/0033_score_predictions_server_only_writes.sql` (new,
  applied live)
- `src/app/api/soccer/predictions/route.ts` (writer always `supabaseAdmin()`
  for both `POST` and `DELETE`)

No other files changed. `src/lib/analysis/soccer/grade-calls.ts` and
`src/lib/sports/soccer/predictions-queries.ts` were read and confirmed
already correct (grading already service-role-only; reads already
RLS-scoped) — no change needed to either.

## Risks

- Same live-exposure window as F-1 was before 0032: this bug was exploitable
  in production the whole time `soccer_score_predictions` has existed
  (migration 0024). No evidence of real-world exploitation was found; the
  bros' predictions board has a handful of real users. Treat as closed now
  that 0033 is applied live.
- The two incidental findings above (unrestricted `DELETE`, raw `500` on a
  `state`/`datetime`-drift edge case) are real but out of this fix's scope —
  see Next.

## Next

`security-auditor` (Irina) — short verification pass on this migration,
same as the round-3 pass on 0032. Recommend she also weigh in on whether the
unrestricted-`DELETE` finding (survivorship bias on the predictions board)
should get the same fast-follow treatment as F-2, since it's the same shape
of decision. After sign-off: `release-engineer` (Kate) for `hm++`.

## Human gate

**One decision for Kazim, not a ship blocker:** whether the unrestricted-
`DELETE` finding (a user can delete their own graded call, hiding a bad
result from their own leaderboard history) gets fixed now as a fast-follow
or is tracked separately — same shape of call as F-2 on the coupon board.
Nothing else here needs a human decision; F-4 itself is closed.
