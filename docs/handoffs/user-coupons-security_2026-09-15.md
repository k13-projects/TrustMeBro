# User-Built Coupons — Security Audit (Irina)

> **Update, 2026-09-15, round 3 (final) — independent re-verification of the
> structural fix.** See "Verdict, round 3 (current)" near the top. Original
> findings and the round-2 addendum below are left as written (archived); the
> round-3 verdict is the current one.


**Stage:** Security · **Date:** 2026-09-15 · **Branch:** `tmb_sep14_v11`
**Type:** Read-heavy audit + one live, fully-reverted exploit proof against the real
database (no production deploy touched). No code changed by this pass — findings
only, per the audit brief.

Read: `docs/handoffs/user-coupons-plan_2026-09-14.md` (Selma),
`user-coupons-backend_2026-09-14.md` (Mariana), `user-coupons-ui_2026-09-14.md`
(Natalia), `user-coupons-qa_2026-09-14.md` (Olga).

---

## Verdict, round 3 (current) — 2026-09-15

**Ship, on this migration.** `src/db/migrations/0032_coupon_tables_server_only_writes.sql`
revokes `INSERT`/`UPDATE`/`DELETE` on `user_coupons`, `user_coupon_picks`,
and `soccer_coupon_legs` from `authenticated`/`public` entirely — I confirmed
this two independent ways (attacking every write verb on all three tables
with a real anon-key session, and reading the live grant catalog directly),
and they agree: `SELECT` is genuinely all a browser client holds. Every
attack from rounds 1 and 2 — the original forgery, the backdated
known-outcome leg, the unbounded stake, the pick_count/leg-count mismatch —
now fails at the coarsest possible layer. The two new defense-in-depth
mechanisms (the kickoff trigger, the stake `CHECK`) were proven to bind even
a service-role write, which is the correct bar. The legitimate path (mixed
coupon → share while pending → real settlement → correct rank) was
reproduced end to end through the real, untouched app code and works. This
is the right kind of fix — structural, not another predicate — and it
converged. **I would ship the user-coupons feature on this migration.**

**One new finding, out of the feature's own boundary but squarely in what I
was asked to sweep:** `soccer_score_predictions` (a sibling "bros" feature,
not part of this audit's original scope and untouched by either fix round)
has the identical unfixed bug shape — ownership-only RLS on `UPDATE`, no
column restriction — and I proved live that a user can self-award a perfect
score-call directly, feeding the public `soccer_prediction_leaderboard`.
This is not a reason to hold the coupons feature; it's a same-shaped,
separate table that should get the same structural fix as a fast follow.
See F-4 below.

## Verdict, round 2 (superseded above)

**Still don't ship.** F-1 exactly as originally proven is genuinely closed —
independently re-tested, not taken on the fixing engineer's word. But pushing
past the named repro list (as asked) found a live, reproducible way to still
forge a leaderboard win through the *fixed* policies: attach legs to matches
that already finished, on the side that already won, while `status` stays
`pending` (fully compliant with the new RLS) — the real settlement cron then
grades it a legitimate win. Combined with two more unbounded columns in the
same new policy (`stake` has no ceiling; `pick_count` isn't tied to actual
leg count), this reaches arbitrary `score` and `net_units` forgery, live-
proven and fully reverted. Full detail, exact repro, and a targeted fix are
in the report's new addendum section. See "New findings" below before
routing back to Mariana.

## Verdict, original pass (superseded above)

**Don't ship as-is.** The API-layer trust model backend/QA already proved
(server-side odds re-verification, line verification, kickoff enforcement,
cross-user RLS isolation on read/update) is real and holds up — I re-verified
the RLS-isolation half live and the odds/line/kickoff half by code review, per
the brief. But it's all sitting in front of two tables
(`soccer_coupon_legs`, `user_coupons`) whose RLS **INSERT**/**UPDATE** policies
check only row *ownership*, never the *values* being written. That's a database-
level hole the API route can't close by itself.

## Finding 1 (Critical, must fix before ship) — leaderboard forgery via direct PostgREST writes

Any signed-in user, using nothing but the app's own public anon key and their
own session — no exploit, no injection, no service-role access — can skip
`POST /api/coupons` entirely and insert directly into `soccer_coupon_legs` /
`user_coupons` with `status: "won"`, an invented `odds_taken`, and
`is_public: true` already set. `refresh_bro_stats()` is separately granted to
`authenticated`, so they can force the public leaderboard to recompute on the
spot. I proved this live: minted a throwaway auth user via the service-role
key (setup only), signed in with the anon key exactly as a browser would, and
from that session alone landed a fabricated `score: 2, net_units: 999989` row
in `bro_stats`. Fully reverted — `user_coupons` back to 22, `soccer_coupon_legs`
back to 14 (all `leg_source='engine'`), all 4 real `bro_stats` rows
byte-identical to baseline, zero stray test users/profiles.

**Fix (small, root-cause, doesn't touch the working odds/kickoff logic):**
1. Replace `soccer_coupon_legs`' insert policy so a client insert must land
   `status='pending', settled_side is null, settled_at is null` — only
   settlement (service role) may change it afterward. No UPDATE grant to
   `authenticated` exists today; keep it that way.
2. Revoke `UPDATE` on `user_coupons` from `authenticated` entirely (it
   currently has no column restriction — `auth.uid()=user_id` is the *only*
   check) and move the share/unshare toggle into a narrow
   `SECURITY DEFINER` RPC that touches only `is_public`/`shared_at`.
3. `revoke execute on function refresh_bro_stats() from authenticated;` —
   no legitimate client reason to call it.

Full attack narrative, exact proof output, and the concrete migration are in
the HTML report.

## Finding 2 (High, must fix before ship or explicit accepted-risk) — selective disclosure on the Bro Board

`bro_stats` only counts a coupon while `is_public=true` *at refresh time*.
Sharing is optional and reversible with no tie to settlement — a user can
build several coupons privately, wait for real outcomes, and only ever share
the winners (or unshare a loser after the fact). This is the exact abuse case
Selma's plan named up front ("toggling share state to only expose winners")
and it was never mitigated across any of the three build passes. Cheapest fix:
refuse "unshare" once a coupon's `status != 'pending'`, and/or lock the
share/private decision before the outcome is knowable. The "just never share
losers" half is a product question, not purely code — flagging for Kazim.

## Lower severity (not blocking)

- **F-3** `refresh_bro_stats()` open to `authenticated` — fix alongside F-1 (same migration).
- **F-4** No rate limiting on coupon creation (pre-existing, reconfirmed) — combined with F-2 lets a user build complementary parlays across one matchday and only surface the guaranteed winner. Fast-follow, not blocking.
- **F-5** Guest identity cookie (`tmb_guest_name`) is unsigned/spoofable, but guest coupons have `user_id=null` and never touch `bro_stats` — zero ranking impact, pre-existing, out of this feature's scope.
- **F-6** Kickoff check has a sub-second check-then-insert race at the API layer. No financial stakes; not worth engineering effort now.

## What holds up (confirmed, not assumed)

Odds re-verification, line verification, kickoff enforcement (both leg
sources), cross-user RLS isolation on SELECT/UPDATE/cross-coupon-INSERT
(live-tested — empty-result or hard `42501` rejection, not just "should
work"), no service-role key or secret reaching client code anywhere in this
diff, `CRON_SECRET` gate on the settle-bets cron unchanged, NBA path
structurally immune to the F-1 technique (its leg status still only ever
comes from the read-only `predictions` table), and no drift toward real
money/wagering anywhere in the feature.

## Cleanup verified

Two throwaway audit-test auth users deleted (cascaded their coupons/legs/
profiles); one stray `potential_payout=999999` coupon check came back empty
after cleanup. Final state: `user_coupons`=22, `soccer_coupon_legs`=14 (100%
`engine`), `bro_stats` 4 rows byte-identical to the session's opening
snapshot, 0 orphaned rows, 0 leftover `qa_%`/audit profiles. No match,
prediction, or odds data was touched or force-finished.

## Files

- `docs/reports/TrustMeBro_Security-Audit_2026-09-15.html` (full report, this pass)
- No source files changed — audit only, per the brief ("do not fix code silently").

## Risks

- F-1 is exploitable today against the live production database if this
  branch's migrations are already applied there (they are — backend handoff
  applied 0029/0030 live). Treat as urgent even though no evidence of
  real-world exploitation was found; the Bro Board currently has only 4 real
  users, but the hole is real and cheap for anyone to find once the feature
  is public.
- F-2 is a design gap, not a bug — fixing it fully (beyond the one-line
  "no unsharing a settled coupon" guard) may need a product conversation, not
  just code.

## Next

`release-engineer` (Kate) — **hold for the Michael/security sign-off gate**.
Recommend routing F-1's fix back through `backend-integrations-engineer`
(Mariana, who already owns this exact settlement/RLS surface) as a small,
scoped migration before `hm++`. F-2 needs a quick decision from Kazim: fix
the one-line "no unsharing a settled coupon" guard now, or explicitly accept
the survivorship-bias risk for a v1, low-stakes internal leaderboard.

## Human gate

**Yes — this is the gate.** F-1 is a real, live-proven way to fabricate a
public leaderboard entry; it should not ship without a fix or an explicit,
informed decision from Kazim to accept it. F-2 is a smaller, named judgment
call for the same conversation.

---

## Addendum, 2026-09-15 (same day) — independent re-verification of `0031_coupon_write_value_trust.sql`

**Method:** every attack below was re-run from scratch by me, against the
live database, with fresh throwaway auth users signed in via the public anon
key exactly as a real browser session would authenticate — none of Mariana's
own proof was taken on faith. Full detail and exact repro commands are in
the report's new section (`docs/reports/TrustMeBro_Security-Audit_2026-09-15.html#verification-2026-09-15`).

**F-1, exactly as named, and every variant Mariana's own handoff listed:
confirmed closed, independently.** Forged coupon status/payout/is_public,
forged leg status, direct `UPDATE` on `user_coupons`, direct
`refresh_bro_stats()` call, un-sharing a coupon after real settlement — all
blocked, same as claimed. Cross-user RLS isolation (reading/updating another
real user's row) still holds. Cleanup verified byte-identical to baseline:
`user_coupons`=22, `soccer_coupon_legs`=14 (100% `engine`), all 4 real
`bro_stats` rows unchanged, 3 throwaway auth users deleted, zero stray rows.

**New, beyond the named list — the two new attack surfaces the fix itself
introduced both hold:** the `SECURITY DEFINER` RPC (`set_coupon_public`)
correctly resolves `auth.uid()` to the real caller even under definer
privileges, checks ownership itself, and fails silently on someone else's or
a nonexistent coupon (no error-based existence leak). The payout cross-check
correctly rejects `mode:'flex', pick_count:2` (no real flex rate exists for
a 2-pick) rather than coalescing to a false pass.

**New finding, F-1-R (Critical, still ship-blocking) — backdated
known-outcome legs still forge a real leaderboard win.** Migration 0031
makes a coupon's *declared* fields internally consistent, but kickoff/match-
state enforcement remains API-only — nothing in `soccer_coupon_legs`' RLS
checks whether the leg's `match_id` has already finished. I attached two
legs to real matches that finished months ago, picked the side the box score
already shows won, left `status` unset (lands `pending`, fully satisfying
the new policy), shared the coupon while still `pending`, and ran the real
`GET /api/cron/soccer/settle-bets` (real `CRON_SECRET`, no force-finish —
the matches were already final). Result: `user_legs_settled: 2`,
`user_coupons.won: 1`, `bro_stats: { wins: 1, score: 2, net_units: 20 }`.

**On the coordinator's working theory:** the reasoning that "scoring counts
legs won/lost rather than odds, so a forged price can't inflate score" is
**correct about `odds_taken` specifically** — a wrong stored price alone
changes nothing about win/loss, so that half of the residual really is
display-only, as reasoned. But it doesn't cover the actual gap: skipping
kickoff enforcement isn't just "claim a stale price," it's **choosing which
matches to bet on after already knowing who won.** A backdated leg stays
`pending` and settles exactly like an honest one — same code path, same
leaderboard visibility, zero forged columns. That's real, live-proven score
and rank inflation, not a display concern.

**Compounding, found in the same sweep (not independently critical, but
multiply F-1-R's impact):**
- `stake` has no DB-layer ceiling (only the app's client-side `.max(10000)`).
  Proved: `stake=1,000,000,000`, ratio-consistent `payout_multiplier`/
  `potential_payout` (passes the new check — it verifies the *ratio*, not
  the size), paired with two backdated legs → real settlement paid
  `result_payout: 3,000,000,000`; `bro_stats.net_units` became
  `2,000,000,365` on the public leaderboard.
- `pick_count` is never tied to the actual number of `soccer_coupon_legs`
  rows attached (that binding exists only in `route.ts`'s create-time logic).
  Proved: declared `pick_count=6` (37.5× multiplier) with only 2 real legs
  ever attached (same backdated-known-outcome technique) → paid the full
  6-pick rate (`result_payout: 375` on a $10 stake) for 2-pick-worth of
  guaranteed risk.

**Fix, same shape as 0031, one more migration:** (a) add a
`soccer_matches.state = 'pre'` check into the `soccer_coupon_legs` INSERT
policy — the actual root cause, matching kickoff enforcement at the DB layer
for the first time; (b) add `stake <= 10000` to the `user_coupons` INSERT
policy as belt-and-suspenders with the existing Zod validator; (c) the more
robust fix for pick_count/leg-count trust: have `settleCouponsForSport`'s
clean-sweep branch recompute the payout from the actual surviving leg count
via `payout_multipliers`, rather than trusting the stored `potential_payout`
at all — it already re-prices on voided legs, so this extends existing logic
rather than adding new logic. Exact SQL for (a)/(b) is in the report.

**Cleanup:** verified byte-identical to the pre-test baseline a second time
after this round — `user_coupons`=22, `soccer_coupon_legs`=14 (100%
`engine`), all 4 real `bro_stats` rows unchanged, 3 throwaway auth users
deleted (cascaded), no stray `qa_%`/audit profiles, the two archived matches
used for the backdated-leg proof (`760414`, `760415`) and the one live match
touched in the original pass (`401888391`) all confirmed unmutated. No
match/prediction was force-finished; only already-final, months-old archived
fixtures were used to demonstrate the backdating technique.

## Human gate (round 2, superseded)

~~Still yes. F-1-R is a live-proven leaderboard-forgery path through the
fixed policies — do not ship on the strength of the 0031 migration alone.~~
**Resolved in round 3 below.**

---

## Addendum, round 3, 2026-09-15 (same day) — independent re-verification of `0032_coupon_tables_server_only_writes.sql`

**Method, unchanged from rounds 1–2:** every attack re-run from scratch with
fresh throwaway users via the anon key, plus a direct query against the live
`information_schema`/`pg_catalog` grants (not reading the migration file and
trusting it matches what's actually applied). Full detail in the report's
round-3 section.

**1. Central claim, confirmed two ways.** Every write verb
(`INSERT`/`UPDATE`/`DELETE`) against all three tables, as a real
authenticated anon-key session: all 9 combinations `permission denied`.
Cross-checked against the live grant catalog directly — `user_coupons`,
`user_coupon_picks`, `soccer_coupon_legs` show `SELECT` only for
`anon`/`authenticated` (plus inert `REFERENCES`/`TRIGGER`/`TRUNCATE`, no
write capability through PostgREST). Both methods agree.

**2. Full round 1+2 regression set: all still closed,** now failing at the
grant layer before RLS or any trigger runs — original forgery, forged leg
status, direct `UPDATE`, `refresh_bro_stats()`, unshare-after-settle,
the backdated known-outcome leg, the unbounded stake, the pick_count
mismatch.

**3. New surfaces probed, both hold:**
- **Kickoff trigger** (`enforce_leg_prekickoff()`): tested directly as
  *service-role* (bypassing the removed grant entirely, simulating a future
  bug) — a leg on an already-finished match is rejected
  (`match_already_started`); a leg on a genuinely `state='pre'` match is
  correctly allowed. Real defense-in-depth, not just an RLS predicate that
  service-role would ignore.
- **Stake `CHECK`**: same service-role test — `stake=1e9` rejected
  (`violates check constraint`), boundary confirmed exact (`10000` passes,
  `10000.01` fails).
- **`route.ts` always-service-role**: read + tested for identity injection —
  `user_id` still comes only from `getRequester()`'s server-verified session,
  never from request body fields; the route only ever creates new coupons,
  never attaches to an existing `coupon_id` from the client. No new IDOR
  surface from this change.
- **`pick_count`/leg-count mismatch**: reproduced by tampering a real
  coupon's stored `pick_count`/multiplier/payout via service-role (simulating
  "a future bug let this through"), then running real settlement — payout
  was recomputed from the actual 2 surviving legs (`30`), never the tampered
  `375`. The `settle-coupons.ts` fix holds live.

**4. Blast-radius sweep — one real finding, outside this feature's own
scope:**
- `enforce_leg_prekickoff()` does carry Postgres' default `PUBLIC` `EXECUTE`
  grant (missed, unlike `refresh_bro_stats()`/`set_coupon_public()` in round
  1). Tested directly: not callable via RPC — Postgres refuses to invoke a
  `trigger`-typed function outside trigger context, regardless of grant.
  Confirmed harmless empirically, not assumed. Worth a cosmetic revoke, not
  a blocker.
- **F-4 (new, critical, but not part of the coupons feature):**
  `soccer_score_predictions` — the bros' score-call game — has the identical
  unfixed bug shape: `authenticated` holds `INSERT`/`UPDATE`/`DELETE`, and
  the `UPDATE` policy is ownership-only with no column restriction. Proved
  live: insert a real pre-kickoff call, then `UPDATE` it directly to
  `{points: 3, graded_at: now()}` as the owning user — no exploit beyond a
  normal authenticated request — and it immediately appears in the public
  `soccer_prediction_leaderboard` as a perfect exact-score call, with no
  match ever played. Neither fix round touched this table; it was outside
  the original audit's scope. Same fix shape applies: revoke direct
  `INSERT`/`UPDATE`/`DELETE` from `authenticated`, route calls and grading
  through a server path, let `grade-calls.ts` (service role) be the only
  writer of `points`/`graded_at`.

**5. Legitimate path, proven end to end, not just claimed.** Built a
synthetic pre-kickoff fixture (two fake matches, one engine prediction, one
real 3-sided odds book — never a real match), drove the actual `POST
/api/coupons` (mixed engine+user legs, real odds/kickoff checks) → `201`;
tampered the coupon's stored payout fields via service-role specifically to
stress-test the settlement fix; finished the fixture's matches for real
(never a real one); ran the real `GET /api/cron/soccer/settle-bets` — both
legs graded correctly, payout recomputed to the true rate; created a real
profile and shared through the real `/api/coupons/[id]/share` route;
`bro_stats` showed the correct `wins:1, score:2, net_units:20`.

**Cleanup:** verified byte-identical to baseline again —
`user_coupons`=22, `soccer_coupon_legs`=14 (100% `engine`), all 4 real
`bro_stats` rows unchanged, every throwaway auth user and the synthetic
fixture (2 fake matches, 1 prediction, 3 odds rows) deleted, zero stray
profiles or score-prediction rows.

## Human gate (round 3, current)

**No gate on the coupons feature — clear to ship on migration 0032.** F-2's
broader product question (should *sharing* itself lock at kickoff, not just
un-sharing) remains open and is still Kazim's call, unrelated to this fix.
**New, separate decision for Kazim:** whether F-4 (`soccer_score_predictions`)
gets its own fast-follow fix now or is tracked separately — it's a real,
live-proven self-scoring bug on a public leaderboard, but it sits outside
the feature this audit was commissioned to review, so it's a scope call, not
a coupons-ship blocker.

## Next (round 3)

`release-engineer` (Kate) for `hm++` on the user-coupons feature. Recommend
opening a small follow-up ticket for `backend-integrations-engineer`
(Mariana) on F-4 — same fix shape she already built twice this session,
applied to one more table — and looping `security-auditor` back in for a
short verification pass on that one when it lands.
