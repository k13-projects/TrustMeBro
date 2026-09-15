# User-Built Coupons — F-1-R Security Fix, Round 2 (Mariana)

**Stage:** Engineering (backend-integrations) · **Date:** 2026-09-15 · **Branch:** `tmb_sep14_v11`
**Type:** One migration + a route change + a settlement-logic change, applied
live. Closes Irina's F-1-R (critical, proven live against the *fixed*
policies from round 1) per
`docs/handoffs/user-coupons-security_2026-09-15.md` (addendum) and
`docs/reports/TrustMeBro_Security-Audit_2026-09-15.html#verification-2026-09-15`.

## Status

**PASS.**

## Summary

Round 1 (`0031_coupon_write_value_trust.sql`) genuinely closed F-1 — the
auditor re-verified every named attack independently. But it did that by
adding more RLS predicates to the same two tables, and the auditor
immediately found a bypass of the *new* predicates: attach a leg to a match
that already finished, on the side that already won, leave `status` unset
(satisfies "must land pending" perfectly) — the real settlement cron then
grades it an honest win. Plus two more unbounded columns in the same shape
(`stake` had no DB ceiling; `pick_count` was never tied to actual leg count).

**Took the structural route, not another predicate patch.** Root cause: the
tables accepted direct client `INSERT`/`UPDATE`/`DELETE` at all, so every
invariant had to be re-expressed as an RLS predicate, and a state-based one
(kickoff) can't even be expressed as a static `with check` clause — it needs
a fresh read of `soccer_matches.state` at the moment of insert. That class of
bug doesn't stop by adding a fourth predicate; it stops by removing the
grant.

**Why the structural route was actually viable here (not just preferred in
theory):** every legitimate write already went through one of three doors —
`POST /api/coupons` (create), the `set_coupon_public()` RPC (share/unshare,
already `SECURITY DEFINER` from round 1), or the settlement crons (already
service-role). The one exception was `POST /api/coupons`'s own insert, which
used the caller's *session* client for signed-in users (relying on the RLS
INSERT grant to `authenticated`) and only the service-role client for
guests. Since `user_id` for the auth case already comes from
`getRequester()` → `supabase.auth.getUser()` (a real server-side session
verification against Supabase Auth, never anything the client puts in the
request body), routing that path through the service-role client too costs
nothing on identity and removes the one grant that made the whole class of
bypass possible.

## What changed

1. **`src/db/migrations/0032_coupon_tables_server_only_writes.sql`** (new,
   applied live):
   - `revoke insert, update, delete on table user_coupons, user_coupon_picks,
     soccer_coupon_legs from authenticated, public.` After this, a browser
     client holds `SELECT` only on all three tables — nothing else. Dropped
     the now-dead INSERT/DELETE policies on all three (no grant left to
     exercise them; kept the surface honest instead of leaving unreachable
     policies that read like a door).
   - **Defense in depth**, binding even a service-role write (CHECK
     constraints / triggers, unlike RLS, are not bypassed by `service_role`):
     - `user_coupons_stake_ceiling`: `check (stake <= 10000)` — matches the
       app's existing Zod `.max(10000)`, now enforced at the table too.
     - `enforce_leg_prekickoff()`: a `BEFORE INSERT` trigger on
       `soccer_coupon_legs` that re-reads `soccer_matches.state` at the
       moment of insert and rejects anything not `'pre'`. This is the actual
       kickoff invariant, checked at the table for the first time — and
       because it re-reads state at insert time rather than moments earlier
       like the API's own check, it also incidentally closes the audit's
       separately-noted F-6 (sub-second check-then-insert race).
2. **`src/app/api/coupons/route.ts`**: the insert `writer` is now always
   `supabaseAdmin()`, for both identity kinds. Previously it branched
   (`session client for auth`, `admin for guest`) — that branch was exactly
   the thing exploitable, since the session client only worked because
   `authenticated` held an INSERT grant. Nothing else in the route changed:
   odds/line/kickoff re-verification, the multiplier/payout cross-check, and
   guest partitioning are untouched.
3. **`src/lib/scoring/settle-coupons.ts`**: `settleCouponsForSport()`'s
   payout logic no longer special-cases "clean sweep, no voids" as "pay the
   locked-in `potential_payout` verbatim." Every all-survivors-won coupon
   (voids or not) now recomputes its payout from `payout_multipliers` keyed
   on the *actual* number of surviving legs found in the table — the same
   re-pricing the void-repricing path already did, just no longer skipped
   when there happen to be zero voids. `potential_payout`/`payout_multiplier`
   are no longer even selected in this function. This is defense in depth
   for the `pick_count`-vs-real-leg-count gap: with 0032 in place a
   mismatched row can no longer be *created*, but settlement itself now
   never has to trust that it wasn't.

**Not touched, deliberately:** odds/line/kickoff verification at the API
layer (already correct, round 1's scope); the broader F-2 product question
of whether *sharing* should lock at kickoff (still Kazim's call); NBA's
`user_coupon_picks` doesn't get its own kickoff trigger — NBA has no
kickoff-vs-prediction-status landmine analogous to soccer's (out of scope,
see Risks).

## What a browser client can still write directly to these tables

**Nothing.** `SELECT` only, on all three (`user_coupons`,
`user_coupon_picks`, `soccer_coupon_legs`) — verified live (`permission
denied for table ...` on every direct-insert/update attempt below). Every
legitimate mutation goes through:
- `POST /api/coupons` (create — service role, both identity kinds)
- `set_coupon_public()` RPC (share/unshare — `SECURITY DEFINER`, unchanged
  from round 1)
- the settlement crons (grade/pay — service role, unchanged)

## Verification — commands and results

All against the live database, using throwaway auth users signed in with
the public anon key exactly as a real browser session would (a real
`@supabase/ssr` cookie jar built by driving the same library the app uses
server-side, so the HTTP requests below carry byte-identical cookies to a
real sign-in), plus real requests to the real `POST /api/coupons`,
`/api/coupons/[id]/share`, and `GET /api/cron/soccer/settle-bets` routes
against a locally running instance of this exact code (`next dev`, no
shortcuts).

**Round-1 regression set — confirmed still closed:**

| Attack | Result |
|---|---|
| Direct `user_coupons` insert, `status:'won', result_payout:999999, is_public:true` | **Rejected** — `permission denied for table user_coupons` |
| Direct `user_coupons` insert, forged `payout_multiplier`/`potential_payout` | **Rejected** — `permission denied for table user_coupons` |
| Direct `soccer_coupon_legs` insert, `status:'won'` | **Rejected** — `permission denied for table soccer_coupon_legs` |
| Direct `UPDATE` on own `user_coupons` row | **Rejected** — `permission denied for table user_coupons` |
| `rpc('refresh_bro_stats')` as `authenticated` | **Rejected** — `permission denied for function refresh_bro_stats` |
| `set_coupon_public(id, false)` on an already-settled coupon | **Rejected** — `cannot_unshare_settled_coupon` (unchanged, RPC still works — `SECURITY DEFINER` isn't affected by the table-grant revoke) |

**New attack set — all fail:**

| Attack | Result |
|---|---|
| **F-1-R exact repro**: attach a leg to a match finished months ago, side already won, `status` left unset, as the client (anon key + real session) | **Rejected** — `permission denied for table soccer_coupon_legs` (the grant is gone before it ever reaches the trigger) |
| Same attack, but as the service-role writer directly (proves the *trigger* itself holds, not only the removed grant) | **Rejected** — `match_already_started` |
| `stake:3,000,000,000`, ratio-consistent multiplier/payout, as the client | **Rejected** — `permission denied for table user_coupons` |
| Same attack as the service-role writer directly (proves the *CHECK constraint* itself holds) | **Rejected** — `new row for relation "user_coupons" violates check constraint "user_coupons_stake_ceiling"` |
| `pick_count:6` (37.5×) declared with only 2 real legs, as the client | **Rejected** — `permission denied for table user_coupons` |
| Same shape, built via the only remaining privileged path (service role, simulating "a future bug let a mismatched row through") then run through the real settle cron | Coupon graded **`won`, `result_payout: 30`** — the true 2-pick rate, never the forged 375 |

**Legitimate path — proven fully, end to end, on a synthetic pre-kickoff
fixture (never a real match — see Risks for why a synthetic one was used):**

| Step | Result |
|---|---|
| `POST /api/coupons` with a mixed engine-leg + user-leg body, real session cookies, real odds re-verification | **201**, both legs land, both `pending` |
| `POST /api/coupons/[id]/share` while `pending` | **200**, `is_public: true` |
| Match reaches full time, engine prediction graded (simulating `settleSoccer()`'s own job, done directly since this fixture's competition is never passed to the cron — see Risks) | — |
| Real `GET /api/cron/soccer/settle-bets?competition=uefa.champions` (real `CRON_SECRET`, real route, real code) | **200** — `legs_settled: {engine_legs_settled:1, user_legs_settled:1}`, `user_coupons: {won:1}` |
| Resulting coupon | `status: 'won'`, `result_payout: 30`, `is_public: true` (stayed public — settling doesn't touch sharing) |
| `bro_stats` (refreshed by the cron itself, service role) | New row for the test user: `wins:1, score:2, net_units:20` |

**Cleanup / baseline, before vs. after every round of testing (byte-identical
each time):**
```
user_coupons = 22 (before every test round and after final cleanup)
soccer_coupon_legs = 14 total, 14 leg_source='engine'
bro_stats: all 4 rows identical (incl. net_units/score) before vs. after
```
5 throwaway auth users created and deleted across the two test scripts
(cascaded their coupons/legs/profiles); the synthetic fixture (match
`900100001`, its odds snapshots, its one `soccer_predictions` row, competition
tag `qa_round2_test`) fully deleted; confirmed zero stray `soccer_matches`
rows, zero stray `soccer_predictions` rows, zero stray profiles, zero stray
auth users (`listUsers` swept for any leftover `@example.invalid` address).
No real match, prediction, or odds row was touched, mutated, or
force-finished at any point — the two real archived matches from round 1's
proof (`760414`, `760415`) and the one live match from round 1's original
pass (`401888391`) were not referenced again this round.

**Build gates:**
```
npx tsc --noEmit   → clean
npm run lint       → clean
npm run build      → clean (Next 16 / Turbopack)
```

## Risks

- **Why a synthetic fixture, not a real finished match, for the legitimate-
  path proof:** the brief is explicit that real matches must not be
  force-finished, and the cron's per-competition `settleSoccer()` step
  writes to that competition's real `soccer_ledgers` — running it against a
  live or archived competition's actual data (even a genuinely due row)
  wasn't a risk worth taking just to watch a test coupon settle. So the
  fixture used a competition tag (`qa_round2_test`) that is never passed to
  the cron's `?competition=` param, meaning `settleSoccer()` never touches
  it — the always-run, not-competition-scoped `settleSoccerCouponLegs()` /
  `settleSoccerCoupons()` (the functions this fix actually changed) ran for
  real, unaltered, against this fixture. The synthetic match, odds, and
  prediction rows were fully deleted afterward. This mirrors round 1's own
  approach (that pass used synthetic match ids `900000001`/`900000002` for
  the exact same reason).
- **NBA's `user_coupon_picks` has no kickoff trigger.** Soccer's leg table
  stores its own `match_id`/state-dependent copy of match context (migration
  0029); NBA legs are still a pure FK to `predictions`, which doesn't carry
  match state the same way, so there's no equivalent "leg's match already
  started" check to add at the table without inventing a parallel construct
  NBA doesn't otherwise have. NBA's `INSERT` grant is revoked along with the
  others, so the *direct-bypass* class is closed identically either way;
  what's not closed is the pre-existing, lower-severity API-layer race the
  audit already named as F-6 for soccer (an NBA leg attached while its
  prediction is still `pending` but the real game has already tipped off).
  Out of scope for this pass — flagging as a fast-follow, same shape as F-6.
- **F-2's broader product question is unchanged**: should the *share*
  decision itself lock at kickoff (not just the *unshare* guard, which round
  1 already shipped)? Still Kazim's call, not decided in either round.
- The migration's trigger and constraint are the first non-RLS enforcement
  on these tables. If a future migration ever needs to bulk-load or
  backfill `soccer_coupon_legs` (e.g., a data-repair script) via the
  service-role client, it will now also need its target matches genuinely
  `state='pre'` — a deliberate tightening, not an oversight, but worth
  knowing before anyone reaches for a bulk insert here.

## Files

- `src/db/migrations/0032_coupon_tables_server_only_writes.sql` (new,
  applied live)
- `src/app/api/coupons/route.ts` (writer always service-role now)
- `src/lib/scoring/settle-coupons.ts` (clean-sweep payout always recomputed
  from real leg count; `potential_payout`/`payout_multiplier` no longer
  read in this function)

## Next

`security-auditor` (Irina) — recommend one more short, independent
re-verification pass (same standard as both prior rounds: don't take my
proof on faith) before this clears the Michael/security gate for
`release-engineer` (Kate) and `hm++`. If Irina confirms F-1-R closed, the
only open item left from either security pass is F-2's product question,
which is Kazim's, not a code gate.

## Human gate

**No new item.** F-2 (should *sharing* itself lock at kickoff, not just
*unsharing*) remains open from round 1 and is still Kazim's call, not
decided here — nothing in this pass changes that question or needs his
sign-off on its own. Everything else in this handoff is a closed security
fix with no irreversible step, no money, and no scope change beyond it.
