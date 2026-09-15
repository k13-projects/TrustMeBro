# Score-Predictions Delete Guard — no erasing a graded call

**Stage:** Backend/Integrations (Mariana) · **Date:** 2026-09-15 · **Branch:** `tmb_sep15_v2`
**Type:** One forward-only migration + one code change, applied live and
independently verified with real attack + legitimate-path proofs against the
real database. Every test row reverted.

Read: `docs/handoffs/score-predictions-security-fix_2026-09-15.md` (the F-4
fix this follows up on, Verification §4 — the incidental finding this
migration closes) and `src/db/migrations/0033_score_predictions_server_only_writes.sql`
(same structural pattern: a trigger, not an RLS predicate, so it binds
`service_role` too).

## Status

**Done, verified live, reverted clean.** Product decision from Kazim (via
the coordinator): coupon sharing does **not** lock at kickoff — no change
there, `0031`'s settled-coupon un-share guard stays exactly as-is. Separately:
a **graded** `soccer_score_predictions` row is now permanently undeletable,
including by a service-role writer; an **ungraded** row (changed your mind
before kickoff) still deletes normally.

## Summary

The prior round's sweep found that `soccer_score_predictions` had no
database-level restriction on `DELETE` at all — the API's only gate was
`hasKickedOff(match.datetime)`. In real production `state`/`datetime` always
advance together, so that check *usually* already blocked deleting a
post-kickoff (and therefore graded) call — but "usually" isn't a database
invariant, and grading, not kickoff timing, is the actual thing that must
never be erasable. Kazim's decision made the real semantics explicit: you
choose what you *publish* (no change to sharing), but once a call is
**graded** it's part of the record and can't be deleted; an **ungraded**
call is still yours to delete pre-kickoff.

**Fix, same structural shape as 0033/0032 — a trigger, not a predicate:**

- **Migration `0034_score_predictions_no_delete_after_grading.sql`** — adds
  `enforce_score_prediction_no_delete_after_grading()`, a `BEFORE DELETE`
  trigger on `soccer_score_predictions` that raises `call_already_graded`
  whenever `OLD.points is not null or OLD.graded_at is not null`. Checking
  either column (not just one) catches a partially-written row too — the two
  are always written together by `gradeScoreCalls()`, so this is belt-and-
  suspenders, not two different signals. Binds `service_role` the same way
  `0033`'s pre-kickoff trigger does, because it's a trigger, not RLS (which
  `service_role` bypasses by design). Also revokes the default `PUBLIC`
  `EXECUTE` grant on the new function — cosmetic, same as `0033`.
- **`src/app/api/soccer/predictions/route.ts` (`DELETE`)** — now fetches the
  existing row (`points`, `graded_at`) *before* deleting, and short-circuits
  to a clean `409 { error: "already_graded", message: "This call has
  already been graded and is part of the record — it can't be deleted." }`
  when graded. This check runs **before** the existing `hasKickedOff`
  check — a graded row is always also past kickoff, so without reordering,
  the generic `"locked"` message would win and mask the real reason. The
  trigger stays as the backstop: if the pre-check and the delete below ever
  race, the delete's own error is pattern-matched and mapped to the same
  clean `already_graded` response instead of bubbling a raw Postgres error
  as a `500`.
- **UI delete affordance — checked, none exists.** Grepped the whole app
  (`src/app`, `src/components`) for any call to `DELETE
  /api/soccer/predictions`: only `ScoreCall.tsx`'s `POST` (save/edit) is
  wired up. There is no delete button anywhere today, graded or not, so
  nothing needed hiding — noting this so it isn't silently re-added later
  without the same guard in mind.

## Verification (live, real signed-in session + direct service-role, fully reverted)

All tests ran against the real Postgres database (`DATABASE_URL`), the real
running app (`next dev` on the project's pinned port), and a real signed-in
Supabase Auth session, using a synthetic fixture (two fake teams, one fake
match under the real `uefa.champions` competition) kept away from any real
match or user.

| Test | Result |
|---|---|
| `POST` create a call, pre-kickoff | `201`, call created |
| `DELETE` the same call while still ungraded, pre-kickoff | `200 {"ok":true}` — **ungraded delete still works** |
| `GET` after that delete | own call gone, as expected |
| Re-created the call, finished the synthetic match for real (never a real match), ran the real `GET /api/cron/soccer/settle-bets?competition=uefa.champions` (real `CRON_SECRET`) | `calls_graded: 1`, row graded `points: 3` via the real, unmodified `gradeScoreCalls()` — **grading still works end to end through the real settle path** |
| `DELETE` the now-graded call via the real API, same signed-in session | `409 {"error":"already_graded","message":"This call has already been graded and is part of the record — it can't be deleted."}` — **fails for a normal signed-in user, with the intended message, not the generic "locked" one and not a raw 500** |
| Direct `DELETE ... WHERE match_id = ...` as **service_role**, bypassing the API and the grant model entirely (simulating a future bug) | `BLOCKED — call_already_graded` — **fails even for a privileged writer** |
| Row state after both delete attempts | unchanged: `points: 3`, `graded_at` unchanged |

Side effects on real data from running the real cron scoped to
`uefa.champions`: `predictions_settled: 0`, `coupons_settled: 0`,
`score_delta: 0`, `legs_voided: 0` — a clean no-op against everything except
the one synthetic row.

**Cleanup:** the synthetic graded row was un-graded first (`UPDATE ... SET
points = null, graded_at = null` — allowed, since `0033`'s pre-kickoff
trigger only checks state when `home_goals`/`away_goals` actually change,
which they didn't here) and only then deleted — a deliberate two-step admin
action, not a bypass of the new guarantee (which is specifically "you can't
delete a graded row directly," not "a graded row's columns can never
change"). Verified after cleanup: `soccer_score_predictions` back to the
exact pre-test 5 rows (byte-identical), `soccer_prediction_leaderboard` back
to its one real row, `soccer_ledgers` (all 4 competitions), `bro_stats` (4
rows), `user_coupons` (22), and `soccer_coupon_legs` (14) all unchanged
before/after. Throwaway auth user and both synthetic matches/teams deleted;
`0` stray audit rows of any kind left behind. `tsc --noEmit`, `eslint`, and
`next build` all clean.

## Files

- `src/db/migrations/0034_score_predictions_no_delete_after_grading.sql`
  (new, applied live)
- `src/app/api/soccer/predictions/route.ts` (`DELETE` handler: graded-check
  before kickoff-check, clean `already_graded` response, trigger-error
  mapped as backstop)

No other files changed. Confirmed no UI component offers a delete
affordance on any score call today.

## Risks

- None outstanding on this specific fix — it closes exactly the gap named
  in the decision, verified against both a normal session and a privileged
  writer.
- Reordering the `DELETE` checks (graded-check now runs before the kickoff
  check) means a post-kickoff-but-still-ungraded delete attempt (e.g. mid-
  match, before the settle cron has run) still correctly gets `"locked"` —
  unchanged behavior, just now falls through to it after the graded-check
  finds nothing to report.

## Next

`security-auditor` (Irina) — short verification pass, same cadence as the
`0033`/`0032` rounds. After sign-off: `release-engineer` (Kate) for `hm++`
(this and the F-4 fix in `0033` together, if not already shipped).

## Human gate

None. Both product questions from this round are resolved: coupon sharing
stays unlocked at kickoff (no change made), and the graded-call delete guard
is exactly what was asked for, verified against both a real user session and
a service-role writer.
