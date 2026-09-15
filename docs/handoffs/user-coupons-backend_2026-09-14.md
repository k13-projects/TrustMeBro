# User-Built Coupons — Backend Data Layer + Settlement (P0 backend + P1)

**Stage:** Engineering (Mariana) · **Date:** 2026-09-14 · **Branch:** `tmb_sep14_v11`
**Type:** Code + migrations, applied to the live database. Following
`docs/handoffs/user-coupons-plan_2026-09-14.md` (Selma).

---

## Scope actually delivered

- Migration `0029_soccer_coupon_legs_user_picks.sql` — extends `soccer_coupon_legs`
  in place (per plan §1), applied live.
- Migration `0030_bro_stats_off_predictions_join.sql` — the landmine fix (plan
  §2), applied live.
- Settlement: `soccer_coupon_legs.status` is now written directly for both
  engine and user legs, and `bro_stats`/coupon settlement read it directly —
  no more join through `soccer_predictions`.
- Postponed/abandoned-match staleness net (plan §2's edge case, pulled forward
  from P2 into this pass per the task brief).
- `POST /api/coupons` rewritten to accept a discriminated engine/user leg
  union for soccer, with server-side odds re-verification and kickoff
  enforcement for **both** leg sources (closes a pre-existing gap — engine
  legs had no kickoff check before this).
- RLS verified live as a non-owner (not just read from the migration file).
- NBA path and existing soccer engine-only path are both unchanged in
  behavior — verified via before/after `bro_stats` snapshots on the real 22
  coupons, plus a full regression build.

Not delivered (explicitly out of this task's scope per the brief): the
rates-board UI, `CartContext`/cart.ts changes, and the coupon-drawer / coupon
history "your pick vs ★ engine pick" badges. Per the plan's own phasing
(§7), those are P0-frontend and P2-polish respectively — for a
frontend agent to build against the contract below.

---

## 1. Deviation from the plan — the primary key (recorded per instructions)

The plan's §1 SQL does `alter column soccer_prediction_id drop not null`
while that column is still part of the table's primary key
(`soccer_coupon_legs_pkey = PRIMARY KEY (coupon_id, soccer_prediction_id)`,
verified live before writing the migration). Postgres refuses this outright —
a primary-key column cannot be nullable. Fix applied in migration 0029:
gave the table a surrogate `id uuid` primary key, and preserved the old
table's dedup guarantee (one row per (coupon, prediction) for legs that
actually have a prediction) as a partial unique index
(`soccer_coupon_legs_engine_leg_idx ... where soccer_prediction_id is not null`)
instead of the composite PK. Also added
`soccer_coupon_legs_outcome_idx` — a unique index on
`(coupon_id, match_id, market, side, coalesce(line,-999999))` — as a
hostile-client defense so no coupon can carry the same outcome twice
regardless of leg source (not in the plan; cheap, minimal-impact addition
given the endpoint was already being rewritten).

Everything else in the plan's leg model (nullable FK, new columns, backfill,
source check constraint) was applied as written.

## 2. The landmine — fixed and verified, not just changed

`settleCouponsForSport('soccer')` (`src/lib/scoring/settle-coupons.ts`) and
the `bro_stats` matview (migration 0030) both used to inner-join
`soccer_coupon_legs` → `soccer_predictions` on `soccer_prediction_id`. A user
leg has that column null, so both paths would have silently dropped it.
Fixed by making `soccer_coupon_legs.status` the leg's own source of truth for
both leg sources:

- New `settleSoccerCouponLegs()` in `settle-coupons.ts`: for `pending` legs
  whose match is `finished`, engine legs copy `status`/`settled_side` from
  their already-graded `soccer_predictions` row; user legs are graded
  directly against the match's final score with the reused `outcome()`
  function from `src/lib/analysis/soccer/settle.ts` (now exported).
- `settleCouponsForSport('soccer')` now reads `soccer_coupon_legs.status`
  directly — no join to `soccer_predictions` at all.
- `bro_stats`'s soccer branch (migration 0030) reads `sl.status` directly,
  same removal.

**Verified, not assumed:** captured `bro_stats` + `user_coupons` counts
before either migration, re-checked identical after each migration, then
built a real mixed engine+user coupon and a real push/void coupon (see §5),
ran the actual settlement cron end-to-end, and confirmed the leg statuses,
parent coupon statuses, and `bro_stats` deltas all landed correctly — then
reverted every fabricated data point (see §6) and re-confirmed `bro_stats`
returned to the exact original baseline.

## 3. Postponed/abandoned matches — staleness net (pulled into this pass)

`voidStaleSoccerRows()` in `settle.ts`: any `soccer_predictions` or
`soccer_coupon_legs` row still `pending` whose match kickoff was more than 5
days ago and the match still isn't `finished` gets force-voided (both
tables, directly — a stuck match never reaches `finished`, so it would never
be picked up by the normal settlement paths). Ledger `voids` count is
incremented per competition to stay consistent. This was P2 in the plan;
pulled forward because the task brief explicitly asked for postponed/
abandoned handling as an edge case to prove, and it was cheap given the
settlement rewrite was already in flight. Full ESPN status parsing
(postponed vs. abandoned vs. delayed) is still not built — this is the
"smallest honest change," same accepted-risk note as the plan (a match
merely slow to post a final past 5 days would be wrongly voided; rare enough
to accept).

Wired into `src/app/api/cron/soccer/settle-bets/route.ts`: order is
`syncCompetition` → `settleSoccer` (per live competition) →
`voidStaleSoccerRows()` → `settleSoccerCouponLegs()` →
`settleSoccerCoupons()`, globally, once per cron run.

## 4. `POST /api/coupons` — the contract for the frontend agent

New shared, non-`server-only` contract file:
**`src/lib/sports/soccer/coupon-legs.ts`** — import this for the request
shape, don't re-derive it.

```ts
type EngineLegInput = { kind: "engine"; prediction_id: string };
type UserLegInput = {
  kind: "user";
  match_id: number;
  market: "match_winner" | "total_goals" | "btts";
  side: "home" | "draw" | "away" | "over" | "under" | "yes" | "no";
  line: number | null;      // must be null for match_winner/btts
  odds_taken: number;       // the price the UI showed when clicked
};
type SoccerLegInput = EngineLegInput | UserLegInput;
```

Request body (`POST /api/coupons`), soccer:
```json
{
  "sport": "soccer",
  "mode": "power" | "flex",
  "stake": 10,
  "payout_multiplier": 3,
  "potential_payout": 30,
  "legs": [ /* 2-6 SoccerLegInput, engine and user freely mixed */ ]
}
```
The legacy `prediction_ids: string[]` shape (all-engine) still works
unchanged for NBA and for any not-yet-upgraded soccer client — both request
shapes are accepted, normalized internally.

**Server trust model (the client is hostile):**
- `odds_taken` is **never** stored as sent. The server recomputes the same
  de-vigged consensus (`consensus()`/`modalLine()` from
  `src/lib/analysis/soccer/engine.ts`, over `loadLatestSoccerOdds()`) and
  rejects with `odds_mismatch` if the client's number is off by more than
  `0.01`. The frozen price stored is always the server's own number.
- For `total_goals`, the client's `line` must equal the real modal line —
  mismatch → `line_mismatch`. `match_winner`/`btts` must send `line: null` —
  otherwise → `line_not_allowed_for_market`.
- `side` must belong to the leg's `market` (`invalid_side_for_market`
  otherwise).
- **Kickoff enforcement, both leg sources, soccer only:** every leg's
  `soccer_matches.state` must be `'pre'` or the whole request is rejected
  with `match_already_started`. This closes a gap that existed **before**
  this change too — the old endpoint only checked that a referenced
  prediction was still `pending`, which stays true until well after full
  time, so adding an engine pick mid-match was silently possible. Verified
  both branches (engine leg's match live, user leg's match live) reject
  identically.
- Duplicate-outcome dedupe happens both in the request handler (409-style
  `duplicate_picks`) and at the DB level (`soccer_coupon_legs_outcome_idx`).
- NBA legs (`sport: "nba"`) cannot carry `kind: "user"` —
  `user_legs_soccer_only`.

Response shape unchanged: `{ ok: true, coupon_id, potential_payout }` on
201, `{ error: "<code>" }` on 4xx/5xx. Error codes introduced:
`user_legs_soccer_only`, `invalid_side_for_market`, `line_mismatch`,
`line_not_allowed_for_market`, `no_odds_for_leg`, `odds_mismatch`,
`match_already_started`.

## 5. Edge cases — proved, not inferred

All tests ran against the real Postgres database (`DATABASE_URL`, the K13
Projects org — never the Halil-linked Supabase MCP) via a scratch dev server
on a throwaway port, using real pending predictions and real (re-timestamped,
not fabricated-value) odds snapshot rows so `loadLatestSoccerOdds`'s 24h
window would pick them up without spending Odds API credits.

| Case | How proved | Result |
|---|---|---|
| Mixed engine+user coupon, creation | `POST /api/coupons` with one real pending engine prediction + one real rates-board outcome (match_winner) | 201, leg rows landed with correct `leg_source`, `match_id`, `market`, `side`, server-frozen `odds_taken` |
| Same coupon, settlement | Finished both underlying matches for real outcomes, ran the actual `soccer/settle-bets` cron (scoped `?competition=uefa.europa`) | Both legs flipped to `won`, coupon flipped to `won` at full locked-in payout |
| Push/void (`total_goals` lands exactly on the line) | Fabricated a 2-leg user coupon (line=2, a whole number — real market data only ever offers `.5` lines, so this exercises `outcome()`'s `total === line` branch directly) with a real signed-in user id; finished the match 1-1 (total=2) | Leg → `void`; coupon had 1 void + 1 win → dropped below a valid parlay size → coupon `void`, stake refunded (existing re-price/refund logic, now correctly reachable for user legs) |
| Reaches `bro_stats` | Ran the fixture above with `is_public=true` on a real user id that already had a `bro_stats` row | `settled` 0→1, `voids` 0→1, `score` 0→1, exactly matching the leg-aware scoring formula — proves the landmine fix, not just the schema change |
| Forged `odds_taken` | Submitted a real engine leg + a user leg with `odds_taken: 50.0` against a true consensus of `2.05` | Rejected: `odds_mismatch` |
| Forged `line` | Submitted `total_goals` with `line: 0.5` against a true modal line of `2.5` | Rejected: `line_mismatch` |
| Leg added after kickoff (user leg) | Set the user leg's match `state='in'`, resubmitted | Rejected: `match_already_started` |
| Leg added after kickoff (engine leg) | Set the engine leg's match `state='in'` (prediction still `pending`) | Rejected: `match_already_started` — this is the pre-existing gap, now closed for engine legs too |
| RLS, non-owner | Simulated `authenticated` role + a different `auth.uid()` via `set_config('request.jwt.claims', ...)` in a rolled-back transaction against real coupon rows | Cannot SELECT/UPDATE/DELETE another user's private coupon or its legs; CAN see a public coupon; CAN insert a leg only onto their own coupon; direct INSERT onto someone else's `coupon_id` rejected by the existing RLS policy (no new policy needed — confirms plan §6) |

**Cleanup:** every fabricated coupon/leg/odds-snapshot row was deleted, the
two real predictions that got settled as a side effect of running the real
cron (their matches were fictionally future-dated and had to be finished
to test) were reverted to `pending`, `soccer_ledgers`/`soccer_system_score_history`
for `uefa.europa` were reverted to their pre-test state (verified they were
the *only* two history rows for that competition, so a full reset to zero
was safe), the one bro score-call that got graded incidentally was reverted,
and `bro_stats` was refreshed and re-verified to match the original baseline
exactly. One legitimate, non-test change was **not** reverted: running the
real cron also settled a handful of genuinely-finished real predictions
unrelated to my fixtures (their matches actually finished in the time this
session ran) — that's the cron doing its real job a little early, not a
side effect of the test.

## 6. Before/after `bro_stats` (the 22 existing coupons)

Captured before migration 0029, re-checked after 0029, after 0030, and again
after the full test-and-cleanup cycle. All four snapshots are byte-identical
except for the one legitimate real settlement mentioned above (which
resolved a `pending` engine leg to `lost`, on a coupon that hasn't fully
graded yet and so doesn't yet appear in `bro_stats` — no drift in the
matview's output at any point):

```
72292782...  nba     settled=4 wins=0 losses=3 voids=1 score=-2
72292782...  soccer  settled=3 wins=2 losses=1 voids=0 score=4
b6295c45...  nba     settled=6 wins=1 losses=4 voids=1 score=-3
b99b5680...  soccer  settled=0 wins=0 losses=0 voids=0 score=0
```
Identical before migration 0029, after 0029, after 0030, and after the full
test/cleanup pass.

---

## Files

- `src/db/migrations/0029_soccer_coupon_legs_user_picks.sql` (new, applied live)
- `src/db/migrations/0030_bro_stats_off_predictions_join.sql` (new, applied live)
- `src/lib/sports/soccer/coupon-legs.ts` (new — the leg-input contract, no `server-only`)
- `src/lib/analysis/soccer/settle.ts` (exported `outcome()`, added `voidStaleSoccerRows()`)
- `src/lib/scoring/settle-coupons.ts` (landmine fix in `settleCouponsForSport`, added `settleSoccerCouponLegs()`)
- `src/app/api/cron/soccer/settle-bets/route.ts` (wired staleness net + leg settlement into the cron)
- `src/app/api/coupons/route.ts` (rewritten: discriminated leg union, server-side odds + kickoff verification)

Note: `docs/handoffs/user-coupons-plan_2026-09-14.md` (Selma's plan, read in
full and followed) is present on disk but untracked in git — pre-existing,
not authored by this pass, not committed here since this task did not
include committing.

## Risks

- Migration numbering: `0028_provider_health 2.sql` (junk duplicate,
  pre-existing per the plan's own note) is still in
  `src/db/migrations/` — left untouched, not mine to clean up. `0029`/`0030`
  are now taken; the next agent should number from `0031`.
- The staleness net's 5-day threshold is a blunt instrument, same accepted
  risk the plan calls out: a real match slow to post a final past 5 days
  would be wrongly voided. Not observed in practice; no ESPN
  postponed/abandoned status parsing exists yet.
- `history/page.tsx` and `src/lib/bros/loaders.ts` still join
  `soccer_coupon_legs` → `soccer_predictions` for display and will silently
  render a user leg as missing from those two pages (not from settlement or
  `bro_stats`, which are fixed) until the per-leg source badges land. The
  plan's own phasing (§7) puts "coupon history view" badges in P2, so this
  was left alone rather than reaching into UI surfaces outside this task's
  brief — flagging clearly so it isn't mistaken for an oversight.
- No rate limiting on coupon creation — pre-existing gap, not introduced or
  worsened here, called out in the plan too.

## Next

`frontend-engineer` (Natalia) for the rates-board UI (clickable tiles, ★
engine-pick marker, `CartContext`/`cart.ts` widening) against the contract in
`src/lib/sports/soccer/coupon-legs.ts` — then the Michael code-review gate,
then `qa-test-engineer` (Olga) for the Chrome QA pass once the UI exists to
click through, and `security-auditor` (Irina) can sign off the RLS/trust
model in parallel since it's already implemented and tested here.

## Human gate

None. No irreversible/destructive step, no money, no scope change beyond
what was explicitly approved (P0 backend + P1, shipped together, per
Kazim's own instruction that P0 alone would ship an unsettleable feature).
