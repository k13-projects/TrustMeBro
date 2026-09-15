# User-Built Coupons — Implementation Plan

**Stage:** Intake / architecture (Selma) · **Date:** 2026-09-14 · **Branch at time of writing:** `tmb_sep14_v2`
**Type:** Plan only — no code, no migrations applied, no source edited.

## Summary

Today the `/football/rates` board shows every priced outcome for every match, but
paints the highest-probability outcome with the primary (gold) fill — it *reads*
as "this is the pick," even though it's just whichever side has the higher
number, and there's no way to click any outcome into a coupon at all. Kazim
wants outcomes selectable (any side, any match), the engine's actual pick
reduced to a small marker instead of a filled tile, and user-built coupons
scored on their own ledger, never mixed into the engine's win/loss record.

The data needed already exists (`getSoccerRates`), and a coupon/cart system
already exists — it's just wired only to engine predictions. The real blocker
is structural: a coupon leg today *is* an engine prediction row
(`soccer_coupon_legs.soccer_prediction_id` is a required FK). A user-chosen
outcome has no prediction to point at. Fixing that cleanly — and, critically,
fixing where that FK is silently relied on for **settlement and ranking**, not
just creation — is the actual scope of this work. Section 2 below is the one
that matters most: there is a real landmine in the current `bro_stats`
materialized view and coupon-settlement query that would silently make every
user-built coupon **never settle and never rank**, if the leg model isn't
also changed at the settlement layer, not just the creation layer.

Everything below is scoped to **football/soccer only**. NBA has no rates
board to hang this UI off today; extending user-picked legs to NBA is called
out explicitly as future work, not part of this plan.

---

## 1. Leg model — the decision

**Decision: extend `soccer_coupon_legs` in place. No parallel table.**

Current shape (verified live, migration 0018):
```
soccer_coupon_legs(coupon_id, soccer_prediction_id NOT NULL FK→soccer_predictions RESTRICT, pick_order)
```

Migration `0029_soccer_coupon_legs_user_picks.sql` (forward-only, next free
number — see the migration-numbering note in Risks):

```sql
alter table soccer_coupon_legs
  alter column soccer_prediction_id drop not null;

alter table soccer_coupon_legs
  add column match_id integer references soccer_matches(id),
  add column market soccer_market,
  add column side match_side,
  add column line numeric,
  add column odds_taken numeric,
  add column leg_source text not null default 'engine' check (leg_source in ('engine','user')),
  add column status bet_status not null default 'pending',
  add column settled_side match_side,
  add column settled_at timestamptz;

-- backfill existing (all-engine) rows from their linked prediction
update soccer_coupon_legs l
set match_id = p.match_id, market = p.market, side = p.side, line = p.line,
    odds_taken = p.best_odds, status = p.status, settled_side = p.settled_side,
    settled_at = p.settled_at
from soccer_predictions p
where p.id = l.soccer_prediction_id;

alter table soccer_coupon_legs
  alter column match_id set not null,
  alter column market set not null,
  alter column side set not null,
  alter column odds_taken set not null;

alter table soccer_coupon_legs
  add constraint soccer_coupon_legs_source_chk check (
    (leg_source = 'engine' and soccer_prediction_id is not null)
    or (leg_source = 'user' and soccer_prediction_id is null)
  );
```

Why extend rather than add a `user_coupon_legs` parallel table (which is the
pattern migration 0018 itself used for NBA-vs-soccer):

- 0018's split existed because NBA and soccer picks are **physically
  different row shapes with different FK targets** (`predictions` vs
  `soccer_predictions`) — a single FK column can't point at two tables. That
  constraint doesn't apply here: an engine leg and a user leg are the *same*
  shape (`match_id, market, side, line, odds`), just with an optional extra
  pointer back to the prediction that generated it. This is an optionality
  problem, not a type problem — nullable columns + a check constraint is the
  smaller, more honest change.
- A parallel table would force **every** downstream reader (settlement,
  `bro_stats`, the coupon history UI, the Bro Board feed) to `UNION` two leg
  tables instead of reading one. The codebase already pays that union cost
  once, at the NBA/soccer boundary (`bro_stats`, migration 0019) — doubling
  it inside soccer alone is avoidable.
- `soccer_prediction_id` staying on the row (now nullable) preserves
  "which prediction, if any, agreed with this leg" for free — useful for the
  "engine also had this" annotation described in section 4.

`odds_taken`, `market`, `side`, `line`, `match_id` become the **leg's own
source of truth** regardless of origin. `soccer_prediction_id` becomes
attribution metadata only, never something settlement joins through (see
next section — this is the part that actually matters).

---

## 2. Settlement — the risky part, treated as such

### The landmine

Two places today grade/rank coupon legs by **joining through
`soccer_prediction_id` into `soccer_predictions.status`**:

- `settleCouponsForSport('soccer')` in
  [src/lib/scoring/settle-coupons.ts](src/lib/scoring/settle-coupons.ts) —
  `legSelect = "coupon_id, prediction:soccer_predictions(status)"`.
- The `bro_stats` materialized view (migration 0019) —
  `join soccer_predictions sp on sp.id = sl.soccer_prediction_id`.

Both are **inner joins on `soccer_prediction_id`**. A user leg has
`soccer_prediction_id = null`. Left as-is, both queries would silently drop
every user leg: `settleCouponsForSport` would see a coupon with fewer legs
than it actually has and could settle it prematurely (grading only the
engine legs and ignoring the pending user leg entirely), and `bro_stats`
would compute win/loss/score off an incomplete leg set. **This is not a
hypothetical edge case — it is the default behavior of the exact code paths
this feature needs, unless they're changed.** This is why the leg model
above adds `status`, `settled_side`, `settled_at` directly onto
`soccer_coupon_legs` — settlement and ranking must read the **leg's own
status column**, never join through the prediction.

### The grading path

The good news: grading logic already exists as a **pure function**,
decoupled from predictions —
[`outcome()`](src/lib/analysis/soccer/settle.ts) takes
`(market, side, line, home_score, away_score)` and returns
`{status, result}`. It doesn't know or care whether a prediction row exists.
That's exactly what a user leg needs.

Proposed settlement change (in `settleCouponsForSport('soccer')`, or a new
sibling `settleSoccerCouponLegs()` called just before it):

1. Load every `soccer_coupon_legs` row with `status = 'pending'` whose
   `soccer_matches.finished = true` (join on the leg's own `match_id`, not
   through a prediction).
2. **Engine legs** (`leg_source = 'engine'`): copy `status`/`settled_side`
   from the already-settled `soccer_predictions` row (unchanged pipeline —
   `settleSoccer()` in `settle.ts` already computed it correctly; don't
   recompute, just propagate it onto the leg).
3. **User legs** (`leg_source = 'user'`): call `outcome(market, side, line,
   home_score, away_score)` directly against the match's final score. Write
   the result onto the leg's own `status`/`settled_side`/`settled_at`.
4. `settleCouponsForSport` and `bro_stats` then read `soccer_coupon_legs.status`
   directly — the join to `soccer_predictions` is dropped from both (it
   becomes a display-only join, used only where the UI wants to show "the
   engine also liked this side").

This is a strict simplification even for the existing engine-only path: one
column (`leg.status`) is now the single source of truth for "is this leg
settled and how," instead of two code paths joining through two different
tables depending on sport/source.

### Edge cases, enumerated

| Case | Handling |
|---|---|
| `total_goals` leg lands exactly on the line (push) | Already handled — `outcome()` returns `void` when `total === line`. No new logic needed; applies identically to user and engine legs. |
| `match_winner` | Always resolves (home/draw/away), never void. No new logic needed. |
| `btts` | Same `outcome()` function already handles it (both-score / not). See "Markets in scope" below on why to include it. |
| A coupon's legs are a mix of engine + user | Coupon-level rule from `settleCouponsForSport` is unchanged: any surviving (non-void) leg lost → coupon lost; all survivors won → won (re-priced if some voided); all void → refund. Leg *source* never enters that logic — a lost user leg kills a coupon exactly like a lost engine leg. |
| Match postponed/abandoned, never reaches `finished = true` | **Not handled anywhere today** — this is a pre-existing gap in the engine's own settlement, not something new to this feature. Verified live: `soccer_matches.status`/`state` currently only ever take the values `Scheduled`/`pre` or `Final*`/`post` — there's no ingest handling for ESPN's postponed/abandoned statuses at all. Proposed minimal fix (folded into this phase because user coupons make a stuck match visibly worse — it's a soft money commitment in the user's head, not just an abstract engine stat): a staleness safety net in the settlement cron — any `soccer_coupon_legs` (or `soccer_predictions`) row still `pending` whose match kickoff (`datetime`) was more than **5 days** in the past and the match is still not `finished` gets force-voided. Reuses the coupon-level void-handling that already exists (drop void legs, re-grade or refund survivors) — no new coupon-level logic needed, only a new source of `void` status. Full ESPN status parsing (distinguishing postponed vs. abandoned vs. delayed) is explicitly **not** built now — the staleness net is the "smallest honest change" and can be replaced later without touching the coupon logic above it. |
| A leg's match score is later corrected by ESPN after settlement | Out of scope — no re-settlement path exists anywhere in the codebase today (engine or user); not introduced here either. |
| User picks the same outcome twice / re-adds after removing | Handled client-side by the cart's existing dedupe-by-key logic (section 4) before it ever reaches the API. |

### Markets in scope

The brief calls out two markets (`match_winner`, `total_goals`). Verified in
`SIDES` (engine.ts), `outcome()` (settle.ts), and `getSoccerRates` (rates.ts):
all three already plumb `btts` end-to-end for free — same consensus math,
same grading function, same rates-board data shape. **Decision: include
`btts` in the selectable board from day one.** Special-casing it out would
cost more (a market allowlist somewhere) than just letting it through the
same pipes everything else already uses. Flagging this as a decision made,
not a question, per the autonomy contract — override if you want it held
back.

---

## 3. Odds capture

`odds_taken` is written **once, server-side, at coupon-creation time** (see
section 6) — never sent by the client, never re-read from a client-supplied
number. For a user leg, the server computes the same de-vigged
`bestOdds` the rates board displayed (via the same `consensus()` /
`getSoccerRates` machinery) at the moment the `POST /api/coupons` request is
handled, and freezes that number onto the leg row. This is the same
trust model already used for the payout multiplier in the existing endpoint
("re-verify server-side so a malicious client can't claim an inflated
number") — same pattern, one more field.

**Closing-line comparison** ("you took 2.10; it closed at 1.85") is
explicitly flagged as **optional, not built now**, per the brief. The
infrastructure already exists to do it cheaply later — `soccer_odds_history`
(migration 0023) already stores a compact consensus-per-market-per-side
series, never pruned, specifically for charting movement. A future phase can
join a leg's `odds_taken` + `created_at` against that series with no new
migration. Not doing it now; noting it's cheap when wanted.

---

## 4. The rates/odds board UI

Current state (`MatchRates.tsx`): every outcome renders as a static tile; the
tile with the highest probability (`isTop`) gets a primary-gold fill and
primary-colored text — no click handler exists anywhere on the board today.
That fill is what reads as "pre-selected," and it's computed independently
of whether the engine actually generated a prediction for that exact
match/market/side (it's just "the higher of the two/three numbers").

Proposed interaction:

- **Every outcome tile becomes clickable**, using the same visual affordance
  and toggle behavior as the existing `AddToCouponButton` (in-cart = amber,
  not-in-cart = neutral, disabled states for max-picks / wrong-sport).
- **Remove the `isTop`-primary-fill treatment entirely.** Replace it with a
  small, secondary marker — a `★` badge in the corner of the tile, same
  visual language as the `★ BANKO` badge already shipping on
  `ResultsRow.tsx` (in-flight branch `tmb_sep14_v10`, additive, no
  conflict) — shown **only** when a `soccer_predictions` row actually exists
  for that exact `(match_id, market, side, line)`, not merely "highest
  number on this board." This fixes a second, smaller bug for free: today's
  `isTop` can highlight a side the engine never actually picked (e.g. when
  its probability clears 50% but the engine's per-market cap or dedup logic
  didn't emit a prediction for it).
- **Selected state**: a chosen tile gets the same amber treatment
  `AddToCouponButton` already uses elsewhere, so "in your coupon" looks
  identical everywhere in the app, engine pick or not.
- **Removal**: clicking a selected tile again removes it — same toggle
  semantics as the existing button, no separate "remove" affordance needed.
- **Coupon drawer**: a user leg renders like an engine leg (match, market,
  side, odds) but with no confidence percentage (it has none) and a small
  "your pick" vs. "★ engine pick" tag per leg, sourced from `leg_source`.
- **Zero-engine-picks competitions** (Süper Lig, Europa, Conference —
  currently few/no settled or pending engine picks): the board already
  renders from `getSoccerRates`, which prices **every** match regardless of
  whether the engine emitted a prediction — confirmed nothing in this design
  depends on a `soccer_predictions` row existing. A competition with zero
  engine picks shows a fully selectable board with zero ★ markers, which is
  correct, not broken.

Client-side plumbing (`CartContext.tsx`): `CartPick`'s NBA/soccer union
currently keys everything off `prediction_id: string` (a UUID) for
`add`/`remove`/`has`. A user leg has no UUID. **Decision: keep the field name
`prediction_id` (avoid touching every call site) but populate it with a
synthetic, deterministic key** for user legs —
`user:${match_id}:${market}:${side}:${line ?? ""}` — so re-clicking the same
tile toggles it off instead of creating a duplicate, matching existing
`has()`/dedupe semantics exactly. This is a small naming debt (a field
called `prediction_id` holding a non-UUID string for one branch of the
union) worth calling out now rather than silently — a follow-up rename to
`leg_key` is cheap later and touches only `CartContext.tsx` + the two
`AddToCouponButton`/`toSoccerCartPick`-style call sites, not the DB.

---

## 5. Separation of record

- **Engine ledger is untouched by construction.** `soccer_ledgers` and
  `soccer_system_score_history` are only ever written by `settleSoccer()`
  grading `soccer_predictions`. Nothing in this plan writes to either table
  from the coupon path. This was already true before this feature and stays
  true — worth stating explicitly since it's the one thing Kazim called out
  by name.
- **Bro Board ranking — recommendation: don't segment.** `bro_stats` keeps
  ranking every public coupon (engine-only, user-only, or mixed) on the same
  leg-aware score. Reasoning: the entire premise of the Bro Board is "how
  good are you at picking outcomes" — a self-built coupon is the *more*
  authentic version of that question, not a different one. Segmenting into
  "engine-assisted" vs. "pure user" leaderboards would fragment a board that
  currently has 22 coupons total (small — verified live) into even thinner
  slices. Because `leg_source` is stored per-leg regardless, **nothing about
  this decision is locked in** — a future "pure user coupons only" filter or
  a separate leaderboard column needs zero new migration, just a `where`
  clause. Flagging as a decision made, reversible without schema work,
  override if you want it split from day one.

---

## 6. Auth, RLS, and abuse

- **Who can create:** unchanged — the existing dual identity model (Supabase
  auth session, or guest-cookie via `getRequester()`) applies identically to
  a coupon with user-picked legs. No new identity surface.
- **Who can edit:** there is no "edit a submitted coupon" flow today for
  either sport (verified — the only mutation endpoints are create and
  `[id]/share`, which just flips `is_public`). This plan doesn't add one; a
  coupon is still assembled in the client-side cart (`localStorage`) and
  only becomes a DB row at submit time. No new edit-abuse surface.
- **Who can delete:** unchanged RLS (`auth.uid() = user_id`, signed-in users
  only, matches existing `user_coupons`/`soccer_coupon_legs` policies) — the
  new leg columns don't change who owns a row.
- **RLS on the new columns:** `soccer_coupon_legs` already has RLS enabled
  with policies scoped through the parent `user_coupons.user_id` / `is_public`
  (migrations 0018, 0019) — the new columns inherit those policies
  automatically; no new policy needed, only the existing `insert`/`select`
  policies need the new columns to be nullable-compatible, which they are.
- **Kickoff enforcement — must be server-side, and doesn't exist today even
  for engine legs.** Verified live: `POST /api/coupons` currently checks
  only that a referenced prediction's `status = 'pending'` — nothing checks
  whether the match has actually kicked off. Since a prediction stays
  `pending` until the match is graded (well after full time), it is
  *currently possible* to add an engine pick to a coupon mid-match. This
  plan closes that gap for **both** leg sources in the same endpoint change,
  since it's the same code path being touched anyway: server-side, look up
  `soccer_matches.state` (or `datetime` vs. now) for every leg's `match_id`
  and reject the whole request with `match_already_started` if any leg's
  match is not `state = 'pre'`. This is scope creep relative to "just add
  user picks," but it's near-zero incremental cost inside the same
  endpoint rewrite and closes a real gap — flagging it rather than silently
  expanding scope.
- **Odds/payout tampering:** unchanged trust model, extended by one field —
  the endpoint already re-derives the payout multiplier server-side and
  rejects a mismatch; `odds_taken` for a user leg gets the identical
  treatment (section 3). The client is never trusted for a number that
  affects settlement or payout.
- **Rate limiting:** none exists today on coupon creation for either sport.
  Pre-existing gap, not introduced or worsened by this feature, not blocking
  — noted for a future security pass, not this one.

---

## 7. Phasing

| Phase | Scope | Explicitly NOT included | Effort | Verification |
|---|---|---|---|---|
| **P0 — Leg model + creation** | Migration 0029; rewrite `POST /api/coupons` to accept a discriminated leg union (`{kind:'engine', prediction_id}` \| `{kind:'user', match_id, market, side, line}`), server-computes `odds_taken` + kickoff check for every leg; widen `CartContext`/`CartPick` with the synthetic key; make every rates-board tile clickable via the existing `AddToCouponButton` pattern; remove `isTop` primary-fill, add the `★` engine-pick marker gated on an actual `soccer_predictions` match. | Settlement of user legs (they sit `pending` until P1); postponed-match handling; closing-line comparison; NBA. | Medium — 1 migration, 1 endpoint rewrite, ~4 component touches. | Build a coupon mixing one engine pick + one user-chosen outcome (same-game parlay) end to end from `/football/rates`; confirm the row lands correctly in `soccer_coupon_legs` with `leg_source`, frozen `odds_taken`, correct `match_id`/`market`/`side`/`line`; confirm existing NBA coupon creation and existing soccer engine-only coupon creation are unaffected (regression pass on the unchanged branch of the endpoint). |
| **P1 — Settlement + ranking correctness** | Extend settlement (section 2) so `soccer_coupon_legs.status` is written directly for both leg sources; repoint `settleCouponsForSport('soccer')` and the `bro_stats` matview off the `soccer_predictions` inner join and onto the leg's own `status`. | Postponed-match staleness net (P2); UI polish. | Small–medium — one settlement function change, one matview redefinition (new migration 0030). | Manually settle a test match with one pending user leg (or wait for a live one); run `/api/cron/soccer/settle-bets`; confirm the user leg and its parent coupon flip to the correct status, `bro_stats.score` updates for that user, and `soccer_ledgers`/`soccer_system_score` are unchanged by the outcome of that user leg. |
| **P2 — Robustness + UI polish** | Staleness-void safety net for stuck/postponed matches (section 2); per-leg "your pick" / "★ engine pick" source badges in the coupon drawer and coupon history view. | Full ESPN postponed/abandoned status parsing (still just the staleness net). | Small. | Force a test match's `datetime` 6+ days into the past without `finished=true`; confirm the next settle-bets run voids its pending legs and the parent coupon re-grades/refunds per the existing void-handling rules. |
| **P3 — Closing-line comparison (deferred/optional)** | Show "took 2.10, closed at 1.85" on a settled user leg, sourced from `soccer_odds_history`. | — | Small, whenever wanted. | Not scheduled — build only if/when requested. |
| **Out of scope (this plan)** | NBA user-picked legs (no rates-board UI exists for NBA today); coupon editing after creation; rate-limiting coupon creation. | — | — | — |

P0 and P1 should ship back-to-back (same sprint) rather than P0 sitting alone
in production — a coupon that visibly never resolves for days is a worse
user experience than the current pre-selected board, even though the two
phases are independently buildable/revertible/testable per the "small,
independently shippable" instruction.

---

## 8. Collision check — in-flight branches

- `tmb_sep14_v9` (competition switcher): touches only
  `CompetitionSwitcher.tsx` + a QA handoff doc. No overlap with any file this
  plan touches.
- `tmb_sep14_v10` (engine results history): adds `ResultsRow.tsx`,
  `src/lib/sports/soccer/results.ts`, and ~70 new lines in
  `src/lib/sports/soccer/queries.ts` (additive, new exports). No functional
  overlap with `rates.ts`, `cart.ts`, `CartContext.tsx`, or the coupon
  migrations — the only soft touch is that both this plan and `v10` may add
  exports to `queries.ts`, which is a textual-proximity risk (same file,
  different functions) rather than a logical conflict. Worth merging `v10`
  before starting P0 just to avoid an avoidable rebase, not because of any
  real design collision. Also: `v10`'s `★ BANKO` badge pattern in
  `ResultsRow.tsx` is exactly what section 4 reuses for the engine-pick
  marker — merging `v10` first means that pattern is available to copy
  rather than needing to be re-derived.

---

## Risks and unknowns (honest ones first)

1. **The `bro_stats`/settlement inner-join-through-predictions blind spot**
   (section 2) is the real risk in this whole feature. If P1 is skipped or
   rushed, user coupons will *appear* to work (they create fine in P0) but
   will silently never settle and never rank — a much worse failure mode
   than an obvious error, because nothing will look broken until someone
   checks a settled match and finds the coupon still `pending`. This is why
   P1 is not optional and should follow P0 immediately.
2. **Postponed/abandoned match handling has never existed in this codebase**
   for either engine or user picks. The staleness-net fix (P2) is a pragmatic
   floor, not a real fix — a match that goes stale for a reason other than
   "actually cancelled" (e.g., ESPN just hasn't posted a final yet after 5
   days, which shouldn't happen but isn't impossible) would get wrongly
   voided. Accepted risk given how rare that actually is in practice.
3. **Migration-numbering hygiene.** The local `src/db/migrations/` directory
   currently has stray duplicate files (`0022_soccer_competitions 2.sql`,
   `0023_odds_history_europa 2.sql`, `0024_bro_score_predictions 2.sql`,
   `0025_match_winner 2.sql`, `0026_team_follows 2.sql`,
   `0027_team_search 2.sql`, `0028_provider_health 2.sql`) — untracked local
   artifacts, almost certainly from concurrent Claude Code sessions each
   independently claiming the same next number (per the standing "parallel
   agents on this repo" note). Verified live: the DB is current through
   0028 and there's no `schema_migrations` tracking table (migrations are
   applied by hand), so `0029` is genuinely free right now — but these
   duplicate files should get reconciled (kept-or-deleted, one per number)
   before someone applies the wrong one or a real numbering collision
   happens. Not blocking this plan; flagging because the next engineer
   touching migrations will hit it.
4. **Kickoff-time enforcement is a pre-existing gap being fixed as a
   drive-by** (section 6) — small scope growth, flagged rather than silent.
5. **No rate limiting on coupon creation** — pre-existing, not worsened,
   not blocking.

## Decisions made under the autonomy contract (override any of these)

- Include `btts` in the selectable board alongside `match_winner`/`total_goals`
  (section 2, "Markets in scope") — it's already fully plumbed, excluding it
  would cost more than including it.
- Bro Board ranking stays unsegmented — user-leg coupons rank alongside
  engine-pick coupons (section 5) — reversible later via `leg_source`, no
  schema change needed to change your mind.
- Fold the kickoff-enforcement fix into the P0 endpoint rewrite rather than
  treating it as a separate ticket (section 6) — same code, touched anyway.
- Closing-line comparison is deferred (P3, unscheduled) per the brief's own
  instruction not to build it into P0.

No items require a Human gate before P0 can start — this is a plan/scope
document; the first Human gate in practice will be the usual branch → PR →
merge review once P0 has code to look at.

---

## Handoff

## Status      PASS
## Summary     Scoped a phased plan for user-built soccer coupons: extend `soccer_coupon_legs` in place (nullable prediction FK + new match/market/side/line/odds/status columns) rather than a parallel table; found and documented the real risk — `bro_stats` and coupon settlement both inner-join through `soccer_prediction_id`, which would silently drop user legs from ranking and settlement unless the leg's own `status` column becomes the source of truth instead. Verified live schema via `DATABASE_URL` (not the Halil-linked Supabase MCP, per house rule). Four-phase plan (P0 creation, P1 settlement, P2 robustness/polish, P3 deferred closing-line), no NBA scope, no collision with in-flight branches `tmb_sep14_v9`/`v10`.
## For Kazim   Selma scoped out how to let users pick any bet on the odds board (not just our picks) and put it on its own scoreboard, in four small steps instead of one big change — found one real landmine along the way (a database join that would've made user coupons silently never settle) and designed around it before any code gets written.
## Files       docs/handoffs/user-coupons-plan_2026-09-14.md (this file). No other files touched — read-only research against src/lib/sports/soccer/{rates,cart}.ts, src/lib/analysis/soccer/{engine,settle}.ts, src/lib/scoring/{coupons,settle-coupons}.ts, src/components/cart/*, src/components/soccer/MatchRates.tsx, src/app/api/coupons/route.ts, src/db/migrations/{0007,0009,0016,0017,0018,0019}*.sql, and the live Postgres schema via a scratch script (deleted after use).
## Risks       See "Risks and unknowns" above — top one is the settlement/ranking join blind spot; must be fixed in P1, not deferred.
## Next        frontend-engineer (Natalia) for P0, paired with backend-integrations-engineer (Mariana) for the migration + endpoint rewrite — this plan is deliberately code-free so either can start directly from it.
## Human gate  none — this is a plan; the first real gate is the normal PR review once P0 has a diff.
