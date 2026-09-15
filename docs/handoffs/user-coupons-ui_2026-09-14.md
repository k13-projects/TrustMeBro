# User-Built Coupons — Rates Board UI + Display-Join Fixes (Natalia)

**Stage:** Engineering (frontend) · **Date:** 2026-09-14 · **Branch:** `tmb_sep14_v11`
**Type:** Code only, not committed (per task instructions — no branch/commit/push from this agent).
Builds the UI against the contract in
`docs/handoffs/user-coupons-backend_2026-09-14.md` (Mariana), following
`docs/handoffs/user-coupons-plan_2026-09-14.md` §4 (Selma).

---

## What Kazim asked for

The rates/odds board painted the engine's highest-probability outcome as if
it were *selected* — gold fill, gold text — with no way to click anything.
He wants every outcome equally selectable so users can build their own
coupons, and the engine's opinion reduced to a small, subtle marker that
never reads as a pre-selected state, because conflating "our pick" with "the
user's selection" made it unclear whose decision a highlighted tile
represented.

## What shipped

1. **`MatchRates.tsx` is now interactive.** Every outcome tile on
   `/football/rates` and the match-detail page's Odds section (same shared
   component) is a real button wired to the existing cart
   (`useCart`/`CartContext`). The old `isTop`-primary-gold-fill logic is
   gone entirely — nothing is pre-selected on load. Selection uses the same
   amber treatment `AddToCouponButton` already uses everywhere else, so "in
   your coupon" looks identical across the app. A small ★ dot (themed via
   `text-primary`, so it re-colors correctly per competition — red on Süper
   Lig, gold elsewhere, verified live) appears only when a real
   `soccer_predictions` row exists for that exact (match, market, side,
   line) — not "highest number on the board." Clicking any tile from the
   board always adds a `kind: "user"` leg (server-priced fresh against
   consensus odds), regardless of whether it happens to carry the ★ — the
   marker is informational only, never a different code path.
2. **A match that has kicked off is not offered.** `selectable =
   match.state === "pre"`; a non-pre match's tiles render inert with an
   explanatory line ("This match has kicked off — its prices are no longer
   selectable"), matching the server's own kickoff rejection so the UI
   never dangles an option the backend will refuse.
3. **`CartContext`/`cart.ts` widened** for the engine/user leg split:
   `SoccerCartPick` is now `{...} & ({kind:"engine"; confidence; best_odds} |
   {kind:"user"; odds_taken})`. `combinedConfidence()` returns `null` (not a
   partial number) the moment any leg in the coupon has no engine
   probability, and `CouponDrawer` hides that row entirely rather than show
   a misleading combined percentage. `toSoccerCartPick()` (used by
   `PickLine`/`BankoCard`/`PickRow`/the homepage — all untouched otherwise)
   now stamps `kind: "engine"`.
4. **`CouponDrawer.onSave`** sends the new discriminated `legs: SoccerLegInput[]`
   shape for soccer coupons (mixing engine + user legs freely in one
   request, matching `src/lib/sports/soccer/coupon-legs.ts` exactly) and
   keeps the legacy `prediction_ids` shape for NBA (which has no rates board
   and can't carry user legs). Server error codes are mapped to actionable
   copy (`ERROR_MESSAGES`) — `match_already_started`, `odds_mismatch`,
   `line_mismatch`, `no_odds_for_leg`, etc. all render a real sentence in
   the drawer's error row instead of a raw code or a silent failure; any
   unmapped code still shows the code text rather than disappearing.
5. **Per-leg source is legible, quietly, everywhere a coupon renders**: a
   small `★ engine pick` / `your pick` tag in the coupon drawer
   (`CouponDrawer`), on `/history` coupon cards, and on Bro Board shared
   coupons (`SharedCouponCard`) — text-only, no loud badge, matching the
   existing "hit/miss" tag treatment already on those rows.
6. **Fixed the two silent-drop joins** the backend handoff flagged as not
   optional: `src/app/history/page.tsx` and `src/lib/bros/loaders.ts` both
   used to inner-join `soccer_coupon_legs → soccer_predictions`, so a
   user-picked leg (`soccer_prediction_id = null`) would render as
   *missing* from a user's own history and from the Bro Board — the exact
   failure class this feature was built to avoid. Both now read the leg's
   own columns (`match_id, market, side, line, leg_source, status`) directly
   and join `soccer_matches` for team names, matching how settlement already
   reads them post-migration-0030. `SharedCouponSoccerPick` and
   `SoccerLegView` gained `leg_source`; the id used for a soccer leg's React
   key is now the leg's own row id (`soccer_coupon_legs.id` /
   `pick_order`), since a user leg has no `soccer_predictions.id` to key on.

## What I verified, and how

**In the browser (headless Playwright, `npm run dev -p 9136`):**
- `/football/rates` on Champions League/Europa/Conference had zero priced
  matches at test time (between matchdays) — confirmed the correct
  "no priced matches, next round starts …" empty state renders (unrelated
  to my change, still correct).
- **Süper Lig is the real zero/near-zero-engine-picks case in production
  right now** and it's fully populated (8 matches, 40 outcome tiles): every
  tile selectable, 9 of 40 outcomes correctly ★-marked (verified against
  the actual `soccer_predictions` rows — e.g. "Under 2.5" ★-marked at 54%
  while "Over 2.5" at 46% is not, proving the marker follows real
  predictions and not "top probability" the way the old `isTop` logic did).
  Screenshot: desktop board, zero pre-selected tiles, ★ dots themed in the
  competition's own red accent (proves theme-safety — no hardcoded hex).
- **Built a real 2-pick, cross-match, all-user coupon** by clicking two
  tiles in two different matches: drawer showed correct match/side/market/
  price for both, correct `$10 × 3× → $30.00` payout math, both legs tagged
  "your pick," and the combined-confidence row correctly absent (both legs
  lack engine confidence).
- **Built a real mixed engine+user coupon** by clicking one ★-marked tile
  and one plain tile: both legs still correctly submit as `kind: "user"`
  (clicking the board never creates an engine leg — the ★ is purely
  informational, matching the plan's intent) and both render "your pick" —
  confirms the marker/selection separation holds under a mixed pick too.
- **Mobile 320px and 375px**: zero horizontal overflow at either width
  (`scrollWidth - clientWidth === 0`), sampled tile tap targets 79px tall
  × 79–150px wide — well over the 44px WCAG 2.5.8 floor. Screenshot at
  320px confirms no layout breakage.
- **Match-detail page reuse**: `/football/match/401888290` (the same
  Kasimpasa v Konyaspor fixture) renders the identical interactive board in
  its Odds section, correctly ★-marking the one predicted outcome,
  side-by-side with the pre-existing "Engine on this match" card (a
  different, untouched component) — confirms the shared `MatchRates`
  component didn't regress that page.
- **Server rejection surfaces a real error, live**: sent a raw
  `fetch('/api/coupons', ...)` from the browser (same shape `onSave` sends)
  referencing two matches with stale/no current odds — got back
  `{status: 400, error: "no_odds_for_leg"}`, which is in `ERROR_MESSAGES`
  and renders as "We no longer have live odds for one of your picks —
  remove it and try again." rather than a silent failure or raw code.

**By other means (documented, not click-through — see Risks for why):**
- **`/history` and Bro Board display fix, proven against the real
  production database** (read + a temporary, cleaned-up write), not just
  read: ran the exact corrected Supabase select strings from both files
  against live data — confirmed existing engine-only coupons return
  identically (no regression). Then inserted a real temporary 2-leg
  `leg_source: 'user'` coupon (`is_public: false`, guest-owned, no RLS
  bypass needed beyond service role for the throwaway insert) and re-ran
  both queries: **both correctly returned the user legs with
  `leg_source: "user"` and full match/team data** — the old
  `soccer_predictions`-join queries would have returned nothing for these
  rows. Deleted the test coupon and its legs immediately after; verified no
  residual rows.
- **Full save→/history→Bro Board click-through with a real Supabase-authed
  user was not possible in this environment**: `CouponDrawer`'s Save button
  gates on a live Supabase auth session (`liveSignedIn`, Google OAuth only —
  pre-existing, not something I touched) and redirects to `/login` before
  ever calling `fetch` for anyone who isn't signed in; a guest identity
  (which the backend does accept for other things) doesn't satisfy that
  gate. No OAuth credentials or test account exist in this sandboxed
  session. I verified the two halves that combine to prove the same thing:
  the drawer builds the exact correct request (shown above, live), and the
  corrected read-side queries return that data correctly once persisted
  (shown above, against real rows). The backend handoff already proved the
  write side end-to-end (insert → settle → `bro_stats`) with a simulated
  auth session against the real database.
- **`match_already_started` specifically** (as opposed to `no_odds_for_leg`)
  wasn't independently reproduced live — no currently-live match with a
  fresh (within-24h) odds snapshot existed at test time to trigger it
  through a real request. The backend handoff already proved this exact
  code path for both leg sources with a controlled, reverted test; I
  verified the client-side gate (`selectable = match.state === "pre"`)
  by code review and confirmed it follows the identical disabled-tile
  pattern already shipped in `AddToCouponButton`.
- `prefers-reduced-motion`: no new transform/scale/keyframe animation was
  added — the only new motion-adjacent class is `transition-colors` on the
  tile buttons, the same utility `AddToCouponButton` already uses unguarded
  elsewhere in this codebase, so this is consistent with (not a regression
  of) the existing convention rather than a new gap.

**Static checks:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all
clean after every change (last run included all files below).

## Files

- `src/components/soccer/MatchRates.tsx` — rewritten: `"use client"`,
  interactive `RateTile`, ★ marker, kickoff gate, mobile-safe tap targets.
- `src/lib/sports/soccer/rates.ts` — `RateOutcome` gained `isEnginePick`;
  new `loadEnginePickedKeys()` batch lookup against `soccer_predictions`.
- `src/lib/sports/soccer/coupon-legs.ts` — added `outcomeKey()`, the shared
  (match, market, side, line) identity used by both the rates-board marker
  and the cart's synthetic user-leg key.
- `src/components/cart/CartContext.tsx` — `SoccerCartPick` split into
  `kind: "engine" | "user"`; `combinedConfidence()` now `number | null`.
- `src/lib/sports/soccer/cart.ts` — `toSoccerCartPick()` stamps
  `kind: "engine"`.
- `src/components/cart/CouponDrawer.tsx` — soccer `legs` request shape,
  `ERROR_MESSAGES` map, per-leg `LegSourceTag`, guarded confidence row.
- `src/components/chat/ChatPanel.tsx` — small follow-on fix so the coupon
  context it hands the chat bot compiles against the new discriminated
  `SoccerCartPick` (branches `confidence`/`best_odds` on `p.kind`).
- `src/app/history/page.tsx` — soccer-leg query reads the leg's own columns
  instead of joining through `soccer_predictions`; added `leg_source` tag.
- `src/lib/bros/loaders.ts`, `src/lib/bros/types.ts`,
  `src/components/bros/SharedCouponCard.tsx` — same join fix on the Bro
  Board path; `SharedCouponSoccerPick` gained `leg_source`; quiet
  `★ engine` tag added next to soccer legs.

No DB migrations, no API route changes — this is entirely a UI layer on top
of the already-applied, already-live backend from
`docs/handoffs/user-coupons-backend_2026-09-14.md`.

## Risks

- **Full authenticated save→history→Bro-Board click-through is unverified
  in-browser** (see above) — the two halves that combine to prove it are
  each independently verified (client request correctness live; corrected
  read-query correctness against real, temporarily-inserted rows). Lowest
  residual risk in the diff, since the write path itself was already
  proven end-to-end by the backend handoff. Recommend Olga's Chrome QA
  pass use a real signed-in test account to close this specific gap.
- **`match_already_started` UI/server round-trip not independently
  reproduced live** for the reason above (no currently-live, freshly-priced
  match existed at test time). Server-side behavior for this exact code was
  already proven by the backend handoff for both leg sources.
- Clicking a ★-marked tile on the rates board always creates a `kind:
  "user"` leg (never automatically an engine leg with its real
  `prediction_id`) — a deliberate simplification consistent with the plan
  ("selected state... engine pick or not," §4) so the board doesn't need to
  carry prediction ids around; the leg still settles and prices correctly
  either way. If a future pass wants "engine also had this" to link back to
  the actual prediction row for that annotation, `outcomeKey()` already
  gives a stable join point — no schema change needed.
- Pre-existing, not touched: `CouponDrawer`'s empty-state copy still says
  "2–6 picks, one per game" even though the cart already allows same-game
  parlays (per `CartContext`'s own comment) — noticed, out of scope for this
  task, flagging rather than silently leaving it or silently fixing
  unrelated copy.

## Next

`code-review` (Michael) gate, then `qa-test-engineer` (Olga) for the
two-agent Chrome QA pass — specifically to close the one verification gap
above with a real signed-in account (save → `/history` → share → Bro Board,
full click-through) and to run the standard desktop+mobile design-review
checklist. `security-auditor` (Irina) can review in parallel since the
trust/RLS model itself is unchanged by this UI-only pass.

## Human gate

None. No irreversible/destructive step, no money, no scope change beyond
what was asked. The one test mutation made against the live database (a
throwaway 2-leg coupon to prove the join fix) was inserted and deleted
within the same script, verified clean afterward.
