# BTTS — Both Teams To Score is now a real, priced market

**Author:** Mariana (backend-integrations-engineer) · **Date:** 2026-09-16 · **Branch:** `tmb_sep16_v5`

Implements the "build first" item from `docs/handoffs/odds-markets-proposal_2026-09-16.md`. No
commit/push, no migration, no DB writes beyond one throwaway verification call — release-engineer
owns shipping this.

---

## Status

**Done, verified, ready for review.** `npx tsc --noEmit -p .` and `npx eslint` both clean on every
touched file. No `npm run build` run, per instructions.

## Summary

The app has advertised BTTS (DB enum, engine `SIDES` map, grading, coupon legs, UI labels, chat
FAQ copy) since migration 0016 without ever once fetching real BTTS odds — confirmed before and
after this change: `select count(*) from soccer_odds_snapshots where market='btts'` was `0`
going in. The gap was exactly what the research proposal said it was: the bulk odds endpoint
`track-odds` already calls (`/v4/sports/{sport}/odds`) 422s on any market outside its own small
allow-list — confirmed again live today — so BTTS can only come from the **per-event** endpoint
(`/v4/sports/{sport}/events/{eventId}/odds`), which is billed **per match**, not per competition
like the existing h2h/totals pull.

**What changed, concretely:**

1. **`src/lib/signals/odds/the-odds-api.ts`** — added one new export,
   `fetchEventOdds(sportKey, eventId, markets, regions)`, a sport-agnostic wrapper around the
   per-event endpoint. It reuses the file's existing `request()`/credit-header helpers and does
   not touch the NBA `TheOddsApiProvider` class at all — zero risk to NBA player-prop pulls.
   Also exported the previously-private `RawEventOddsResponse` type so soccer.ts can parse it.
2. **`src/lib/signals/odds/soccer.ts`** — added `fetchBttsOddsForEvent(sportKey, eventId)`,
   which calls `fetchEventOdds` with `markets=btts`, `regions=uk` (1 credit/call) and parses the
   response's `"Yes"`/`"No"` outcomes into the same `SoccerOddsQuote` shape the bulk h2h/totals
   pull already produces (`market: "btts"`, `side: "yes" | "no"`, `line: null`).
3. **`src/lib/sports/soccer/repo.ts`** — added `loadMatchIdsWithBttsSnapshot(matchIds)`: one
   `select match_id from soccer_odds_snapshots where market='btts' and match_id in (...)` query.
   This is the entire credit-control mechanism for requirement 2 — a match already in that set
   is never fetched again, for the life of the match.
4. **`src/app/api/cron/soccer/track-odds/route.ts`** — inside the existing per-competition loop,
   right after the bulk pull's event↔match resolution (same `resolveMatch` call, not a second
   one — `bttsCandidates` is collected in the same loop that builds the bulk `rows`/`history`
   arrays), added: look up which of those matches already have a `btts` snapshot, skip them,
   call `fetchBttsOddsForEvent` for the rest, insert whatever quotes come back via the existing
   `insertSoccerOdds` (same table, `btts` was already a valid enum value — no new repo function
   needed for the write side). Extended the JSON summary with a `btts` sub-object per competition:
   `matches_considered`, `already_priced`, `fetched`, `snapshots_inserted`, `credits_spent`.

**Requirement-by-requirement:**

- **(1) Per-event fetch, region `uk` only.** Done. Verified live that `uk` alone returns 7 books
  for BTTS on the one match checked (betfred_uk, leovegas, livescorebet, virginbet, williamhill,
  coral, ladbrokes_uk) — matches the proposal's read that BTTS liquidity here is UK-market
  brands, so `eu` would add little for double the credit cost.
- **(2) At most once per match, ever.** `loadMatchIdsWithBttsSnapshot` gate, described above.
  This is the single most important line in the diff; it's isolated in its own repo function so
  it's easy to audit in review.
- **(3) Never causes a pull on an otherwise-free day.** The whole BTTS block sits *after* the
  bulk `fetchSoccerOdds(oddsKey)` call inside the loop — every `continue` above it (no odds key,
  no unfinished matches in window, cadence not due) already exits before BTTS code is reached.
  It adds no new decision of its own.
- **(4) Reuses `team-match.ts` reconciliation.** `bttsCandidates` is built from the exact same
  `resolveMatch(ev, candidates...)` result already computed for the bulk rows — not a second,
  possibly-disagreeing resolution. Unmatched events are already counted in the existing
  `unmatched` array (an event `resolveMatch` can't place never becomes a BTTS candidate either).
- **(5) Honest credit reporting.** Each `fetchBttsOddsForEvent` call's `x-requests-last` header
  is summed into `credits_spent`; `matches_considered` / `already_priced` / `fetched` make the
  skip logic auditable straight from the `cron_runs.summary` JSON `/api/health` already surfaces
  pass/fail for. (`/api/health` itself only reads ok/overdue per job, not the summary body — no
  change needed there; the detail lives in `cron_runs.summary`, queryable directly.)
- **(6) No side gate for `btts: "no"`.** Not touched. `src/lib/analysis/soccer/engine.ts`
  `isGatedSide()` still only gates `match_winner/draw` and `total_goals/under` — those numbers
  came from a 208-pick backtest that doesn't exist for BTTS yet. Confirmed zero engine changes
  were needed at all: `predictMatch()` already loops `Object.keys(SIDES)` (which already
  includes `btts`) and will start pricing it the moment real quotes exist, which they now will.
- **(7) Odds-movement history.** Deliberately **not** written for BTTS. `soccer_odds_history`
  exists so the match-page chart can plot price movement over multiple daily pulls; BTTS is
  pulled once per match, ever, so there is never a second point — a one-point "movement" series
  is noise, not a chart. Documented inline in the cron route where the bulk pull's history rows
  are inserted and the BTTS loop deliberately doesn't call `insertOddsHistory`.

## Verification

- `select count(*) from soccer_odds_snapshots where market='btts'` and the equivalent for
  `soccer_predictions` both read `0` before this change (confirmed live against prod via the
  read-only `q.mjs` helper, no writes).
- Live API check (spent exactly **1 credit**, `x-requests-used` 68→69): `GET
  /v4/sports/soccer_uefa_champs_league/events` (free) → picked the first upcoming fixture (RC
  Lens v Sporting Lisbon, Oct 13) → `GET .../events/{id}/odds?regions=uk&markets=btts` (1
  credit) → confirmed the response shape matches what `parseBttsQuotes` expects: outcomes named
  exactly `"Yes"` / `"No"`, 7 UK books quoting it a full month before kickoff. This is the
  concrete evidence behind the "assume books have already posted BTTS by the time a match enters
  the 8-day window" assumption the cost math below leans on.
- `npx tsc --noEmit -p .` — clean.
- `npx eslint src/lib/signals/odds/the-odds-api.ts src/lib/signals/odds/soccer.ts
  src/lib/sports/soccer/repo.ts src/app/api/cron/soccer/track-odds/route.ts` — clean.
- No production cron endpoint was invoked. No migration applied (none needed — `btts` has been a
  valid `soccer_market` value since migration 0016). No DB writes.

**Projected monthly credit cost: ≈187 of 500** (baseline ~52 this month + ~135 matches/month at
peak × 1 credit each for BTTS at `uk`-only). This is under the ~250 stop-and-report threshold in
the task, consistent with the research proposal's estimate, and leaves ~300+ credits of headroom
in an average (non-peak) month.

## Files

- `src/lib/signals/odds/the-odds-api.ts` — new `fetchEventOdds()` export, `RawEventOddsResponse`
  type made public.
- `src/lib/signals/odds/soccer.ts` — new `fetchBttsOddsForEvent()` export + `parseBttsQuotes()`,
  `BTTS_MARKETS`/`BTTS_REGIONS` constants.
- `src/lib/sports/soccer/repo.ts` — new `loadMatchIdsWithBttsSnapshot()`.
- `src/app/api/cron/soccer/track-odds/route.ts` — BTTS fetch/dedup/insert wired into the
  per-competition loop, `BttsResult` type, extended `CompetitionOddsResult`.
- Read-only, not modified: `src/lib/analysis/soccer/engine.ts`, `src/lib/analysis/soccer/settle.ts`,
  `src/lib/sports/soccer/coupon-legs.ts`, `src/lib/sports/soccer/team-match.ts`, UI/labels/FAQ
  copy files — all already correct for BTTS, exactly as the research proposal found.

## Risks

- **Repeat-attempt risk on thin/slow markets.** The cost math assumes ~1 credit per match, ever.
  If a match sits in the 8-day window for several days *before* any book posts BTTS, the dedup
  gate (no row exists yet) would let it retry daily until a book finally quotes it, costing more
  than 1 credit for that match. The one live check done today argues this is rare in practice —
  BTTS was already quoted by 7 books a full month before kickoff — but that's a one-match, one
  competition sample. Worth watching the `already_priced` vs `fetched` counts in the first few
  weeks of real runs to confirm the assumption holds at scale; if it doesn't, the fix is a
  kickoff-proximity floor (e.g. don't attempt BTTS more than N days out), not a paid tier.
- **Sequential per-match fetching inside one cron invocation.** `toFetch` is awaited one match at
  a time (not `Promise.all`), for simplicity and to keep credit accounting exact. On the very
  first run, every unpriced match currently in the window fires at once (no back-pressure from
  the "once ever" gate yet) — worst case across all four competitions is on the order of 50–100
  sequential calls, well inside the Hobby 300s ceiling but worth knowing about if track-odds ever
  starts running slow. Steady-state volume is much lower since most matches will already be
  priced.
- **No alternate-totals or other markets included.** Out of scope per the task; the proposal
  ranks alternate totals second and recommends waiting for real BTTS usage data first.
- **`CLAUDE.md`'s env-var note** ("Usage on 2026-09-15: ~40 of 500 used, with four live football
  competitions") is now stale the moment this ships and starts pulling. Left untouched per scope
  discipline — flagging so whoever ships this updates the number once real usage is observed,
  rather than guessing.

## Next

**Michael (code-review gate)**, then **Olga (qa-test-engineer)** to confirm BTTS picks actually
start appearing on `/football/*` pages once real odds land (needs at least one live cron run —
can't be verified from this branch alone since no cron was invoked), then **Irina
(security-auditor)** only if the review surfaces anything odds/credit-adjacent worth a second
look (nothing here touches auth, RLS, or user input, so this is likely a short pass).

## Human gate

None required to *ship the code* — no migration, no new dependency, no destructive operation.
The one thing worth a conscious yes from Kazim before merge: this cron will start actually
spending the ~135 credits/month this proposal estimated, on a free-tier key with hard monthly
caps. Recommend watching the first week of real `cron_runs.summary.btts` numbers against the
~187/month projection before considering any further market (alternate totals, etc.).
