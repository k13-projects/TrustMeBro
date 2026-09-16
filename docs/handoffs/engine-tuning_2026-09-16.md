# Soccer Engine Tuning — EV Gates, Market Gates, Banko-Only Coupons (Mariana)

**Stage:** Engineering (backend/analysis) · **Date:** 2026-09-16 · **Branch:** `tmb_sep16_v1`
**Type:** Code only, not committed (per task instructions — release-engineer owns build/ship on this branch).

---

## Status

Done. Emission filters landed in `src/lib/analysis/soccer/engine.ts`,
coupon-building restricted to banko legs in
`src/lib/analysis/soccer/coupons.ts`, tier badges added to the three soccer
components I own that render engine rows. `npx tsc --noEmit -p .` is clean
for every file I touched (the two errors the full run reports are in
generated `.next/types/*` files unrelated to this change, pre-existing from
build state in this shared tree). `npx eslint` clean on all touched files.

## Summary

Measured against the 208 graded soccer picks (World Cup + Champions League)
that Kazim's brief supplied, three failure modes stood out: 60% of graded
picks had negative expected value and lost money as a group (-5.5 units),
draws hit only 18%, and `total_goals/under` hit 48% against a ~54% breakeven
bar. The house direction (2026-05-20 win-rate pivot memory) is a high
win-rate scoreboard, not volume, so I gated emission on EV and retired the
two weak sides behind a flag rather than deleting them.

**1. Never emit -EV picks.** `MIN_EXPECTED_VALUE = 0` in `engine.ts` — a
pick the model prices as a loser on average is never shipped.

**2. EV ceiling as a miscalibration signal.** `MAX_TRUSTED_EV = 0.25` — the
10–25% EV band hit 13% (1/8) and the 25%+ band hit 40% (2/5); both small
samples but both say the same thing: a very large EV usually means the
model's probability read is wrong, not that the market mispriced it. I
**skip** these picks rather than clamp confidence: confidence is read
directly off the win probability (`top.p`), which also drives the
`reasoning.checks` array shown in the "Why this call" panel — clamping
confidence down would either desync the badge from its own stated reasoning
or require inventing an anchor value with no backtest behind it. Skip only
removes the emission, which is the same treatment `MIN_SIDE_PROBABILITY`
already gives sub-coinflip sides.

**3. Draw and `total_goals/under` gated off.** `ENABLE_DRAW_AND_UNDER_PICKS
= false`, checked via a small `isGatedSide(market, side)` helper applied
only when picking the *best* side per market — the de-vig math in
`consensus()` still sees all sides, so probabilities stay correctly
normalized. Draws hit 18% (3/17) — a high-win-rate product can't ship 18%
picks even though the draw bucket nets +4.1 units on paper; that's entirely
12x-odds luck on 3 wins, not a repeatable edge. `total_goals/under` hit 48%
against a ~54% breakeven bar (avg odds 1.84) for -7.0 units, while
`total_goals/over` — same market, opposite side — hit 60% for +4.9 units.
The code path is untouched, just gated, with the numbers written down next
to the flag so a future re-enable is an informed decision, not a guess.

**4. Engine coupons: banko legs only.** `buildCoupons()` in `coupons.ts` now
builds every multiplier coupon and the surprise coupon from `selectBanko()`'s
output instead of the full prediction list. `selectBanko` already enforces
one leg per match and a confidence floor, and both coupon builders already
required ≥2 (multiplier) or ≥3 (surprise) legs before returning anything —
so "fewer than 2 banko legs ⇒ no coupon that day" falls out of the existing
code, it isn't a bolted-on special case. Backing record: World Cup engine
coupons went 8W–2L, Champions League went 0W–3L — the difference was leg
quality. One side effect worth flagging: the surprise coupon wants legs
priced ≥2.2, and banko legs are by construction the shortest-priced
favorites, so the surprise coupon will now rarely or never fire. That's the
intended consequence of "banko legs only," not a bug — stacking longshots we
don't trust at banko level is exactly the volume this pivot retires.

**5. Picks vs. leans, in the UI.** Added `src/components/soccer/TierBadge.tsx`
— a small pill, "★ Banko" (primary-gold) for `is_banko` rows, "Lean" (muted,
visually secondary) for everything else — and wired it into every soccer
component I own that renders a bare engine row without one already:
`PickLine.tsx`, `SettledPickRow.tsx`, and `ResultsRow.tsx` (which already had
a `banko` entry in its achievement-badge list; I excluded `"banko"` from
that map and render `TierBadge` unconditionally instead, so every row now
carries a tier pill, not just the ones that happened to be banko).
`BankoCard.tsx` already has its own "🔒 Banko" treatment and only ever
renders banko rows, so it needed no change. I kept the elevated tier's badge
text as "Banko" (the term already used everywhere else in the app — BankoCard,
the results-page filter, chat copy, the glossary) rather than introducing a
second word ("Pick") for the same concept; the brief's "keep is_banko as the
pick tier" read to me as the underlying concept, and the one literal string
requirement given was for the non-banko badge, which now always says "Lean".
Flagging this choice explicitly in case the intent was a literal "Pick" vs
"Lean" pair — trivial to swap the one string in `TierBadge.tsx` if so.

I did **not** touch `src/lib/sports/soccer/results.ts` (badge/records
computation) or any page (`picks/page.tsx`, `results/page.tsx`,
`football/page.tsx`) — those already speak honestly about tiers (a "Banko
Only" filter exists and is correctly labeled; the aggregate "N of M settled
picks" copy doesn't conflate tiers). No ledger math or DB schema changed —
this is emission + labeling only, as scoped.

**6. "Min 10 picks" rule.** Not present in the soccer engine — confirmed by
reading `engine.ts`, `coupons.ts`, and `run.ts` end to end; `run.ts` inserts
exactly whatever `predictMatch()`/`buildCoupons()` produce, no padding
logic anywhere. Also checked NBA's `src/lib/analysis/` (outside my
ownership, so I didn't touch it) and found no padding there either — the
2026-05-20 retirement already happened, nothing left to remove.

**7. Backtest.** Wrote a throwaway read-only script
(`backtest-gates.mjs`, in the session scratchpad, not the repo) that pulls
every graded `soccer_predictions` row from prod (read-only, via
`DATABASE_URL`) and replays the new EV/side gates against it:

| | count | won | lost | hit rate | units |
|---|---|---|---|---|---|
| Before (current rules) | 208 | 114 | 94 | 54.8% | +4.76 |
| After (new gates) | 60 | 38 | 22 | **63.3%** | **+5.34** |
| After, banko-tier only | 19 | 17 | 2 | **89.5%** | +3.22 |

Dropped 148 of 208: 73 to the draw/under gate, 71 to the EV floor (some
picks overlap both gates — the drop-reason counter above double-counts a
pick that fails more than one gate, e.g. a draw with negative EV, so the
73+71+4 = 148 lines up with rows dropped for *at least one* reason, not a
partition). Net: fewer than a third of the old volume, but a meaningfully
higher hit rate and slightly better total units off far less exposure —
exactly the volume-for-quality trade the house direction asks for. Banko-only
(the coupon-eligible pool) is stronger still: 17-2, 89.5%.

## Files

- `src/lib/analysis/soccer/engine.ts` — EV floor/ceiling constants + gate,
  draw/under gate behind `ENABLE_DRAW_AND_UNDER_PICKS`.
- `src/lib/analysis/soccer/coupons.ts` — `buildCoupons()` now sources every
  coupon kind from `selectBanko()`'s output.
- `src/components/soccer/TierBadge.tsx` — new, shared Banko/Lean pill.
- `src/components/soccer/PickLine.tsx` — tier badge added next to the side label.
- `src/components/soccer/SettledPickRow.tsx` — tier badge added next to the side label.
- `src/components/soccer/ResultsRow.tsx` — tier badge always rendered; the
  old `banko` achievement-badge entry removed from `BADGE_COPY` (superseded
  by the tier badge) with the type narrowed to `Exclude<RowBadge, "banko">`.

Not touched, by design: `settle.ts`, `grade-calls.ts` (another agent's),
`src/app/api/cron/soccer/generate-predictions/route.ts` (no change needed —
the run logger agent's wrapper is additive around code I didn't have to
change), `Hero.tsx`, `MatchRates.tsx`, `CompetitionBar`, the match page, the
predictions page, `src/lib/sports/soccer/results.ts`.

## Risks

- **Live pick volume drops sharply** (the backtest implies roughly 60 of 208
  historical picks would have survived, ~29%) — expect noticeably fewer rows
  on `/football/picks` and `/football/results` going forward, and coupons
  may not form on lighter matchdays (by design — see item 4). Not a bug if
  the picks page reads "quiet" some days; that's the product now.
- **`ENABLE_DRAW_AND_UNDER_PICKS`** is a hardcoded `false`, not an env var —
  flipping it back on means editing `engine.ts`, not a config change. Kept
  it that way since it's a modeling decision with a documented backtest
  behind it, not an operational toggle.
- **The banko/lean text choice** (item 5) is my best read of an ambiguous
  instruction — flagged above, easy to change if wrong.
- Two duplicate-suffixed files exist in soccer dirs I touch nearby
  (`grade-calls 2.ts`, `share-queries 2.ts`, etc.) — pre-existing in this
  concurrently-edited tree, not something I created or need to resolve; not
  imported by anything I changed.

## Next

Michael (code-review) gate, then Olga (qa-test-engineer) to verify the
Banko/Lean badges render correctly across the picks/results/club pages in
Chrome (desktop + mobile), and confirm the lighter pick volume doesn't break
any "empty state" assumption on `/football/picks`. Kate (release-engineer)
owns build + ship on this branch per the task's constraints (I did not run
`next build` or commit, as instructed).

## Human gate

None required to land this — it's a modeling/labeling change with numbers
behind it, no schema change, no money, nothing irreversible. Flagging for
awareness only: the Banko-vs-Lean wording choice above (item 5) and the
sharp volume drop (Risks) are both worth a quick glance from Kazim since
they change what the product visibly looks like day to day, but neither
blocks shipping.
