# NBA Engine — Soccer-Gate Backtest + Soccer Cron Safety Check (Mariana)

**Stage:** Engineering (backend/analysis) · **Date:** 2026-09-16 · **Branch:** `tmb_sep16_v5`
**Type:** Read-only backtest + one documentation-only code comment. No commit (per task instructions — not mine to ship on this branch).

---

## Status

Done. Task 2 (cron safety) answered from reading the route + `run.ts` +
live DB constraints — no code changed for that part. Task 1 (NBA gate
backtest) is a null result: none of the soccer-style emission gates are
supported by the NBA data, so **no functional gate was added**. I left one
documentation-only comment in `src/lib/analysis/predictions.ts` recording
the finding and the numbers, in the same style as the soccer engine's
backtest comments, so the question isn't re-asked blind next season. `npx
tsc --noEmit -p .` and `npx eslint` are clean on the one file I touched.

## Summary

### Task 2 — is `/api/cron/soccer/generate-predictions` safe to run right now?

**It does not create duplicates — it deletes and regenerates.** No unique
constraint exists on `soccer_predictions` at the DB level (checked
`pg_constraint`: only a PK, an FK to `soccer_matches`, and two range
checks); dedup is entirely app-level in
`src/lib/analysis/soccer/run.ts::generateSoccerPredictions()`:

1. It loads unfinished matches for the competition in the requested date
   window (default: today + 8 days, matching `track-odds`'s window).
2. It **deletes** `engine_coupons` where `sport='soccer' AND competition=<c>
   AND status='pending'` — this is **not** scoped to the date window or to
   specific matches, it clears every pending coupon for that competition.
3. It **deletes** `soccer_predictions` where `status='pending' AND
   match_id IN (<matches in the window>)`.
4. It re-runs the engine and inserts fresh rows.

So running it now (no `?competition=` filter → runs over
`liveCompetitions()`, i.e. all four: UCL, Europa, Conference, Süper Lig)
would **wipe and replace**, not duplicate:
- The 8 pending Europa picks (matches dated today, in play tonight — still
  `finished=false` in the DB, so they're in scope).
- All 10 pending Süper Lig picks (Sep 18–20, inside the default 8-day
  window).
- All 4 pending `tur.1` engine coupons.

I confirmed the live counts directly: 8 pending `uefa.europa` predictions
(today), 10 pending `tur.1` predictions (1 on the 18th, 5 on the 19th, 4 on
the 20th), 4 pending `tur.1` coupons — matches the brief's "18 picks / 4
coupons."

**One more thing worth flagging, found while reading `git status`:**
another session just landed a house decision in `CLAUDE.md` (dated
2026-09-16, present on this branch right now) that says explicitly: *"Picks
made under the old rules ride out... They are not voided or regenerated...
The gates apply to everything generated from here."* Running this cron now
would directly contradict that just-written decision — it would regenerate
those exact 18 old-rules picks and wipe the 4 coupons, the opposite of
"ride out." That's a second, independent reason not to run it right now,
on top of the plain mechanics of delete-then-insert.

**Answer: no duplicates, but not a no-op either — do not run it if the
intent is to leave the 18 pending picks and 4 coupons alone.** I did not
run the cron.

### Task 1 — should the NBA engine adopt soccer's gates?

**No. None of the soccer-style gates are supported by the NBA data — this
is a documented null result, not "leave it alone by default."**

Population: 513 graded NBA picks (339 won / 174 lost / 178 void, season
ended June 2026). Of the 513 won/lost rows, **176 (34%) have `expected_value
= NULL` and carry no bookmaker odds at all** — every one of them is dated
2026-05-15, the launch-day synthetic-line era before the "Prediction Engine
Contract" rewrite (real-odds gating, retired `floor(L10)+0.5` line). They
can't contribute to an EV or units analysis (no price = no units), so I
report them separately rather than dropping them silently:

| market | n | won | hit% | (no units — no odds recorded) |
|---|---|---|---|---|
| points | 37 | 22 | 59.5% | |
| rebounds | 37 | 13 | 35.1% | |
| assists | 35 | 22 | 62.9% | |
| threes_made | 30 | 11 | 36.7% | |
| pra (legacy market, not in current `prop_market` emission) | 37 | 22 | 59.5% | |

The remaining **337 graded picks (May 16 – Jun 13) have real odds and a
real `expected_value`** — this is the population the gate question is
actually about.

**Baseline, flat 1-unit stake, real odds:**

| | n | hit% | units |
|---|---|---|---|
| **All 337** | 337 | 73.9% | **-21.37** |

By market:

| market | n | hit% | units |
|---|---|---|---|
| points | 129 | 72.9% | -7.87 |
| rebounds | 65 | 83.1% | **+5.41** |
| assists | 82 | 69.5% | -13.18 |
| threes_made | 61 | 72.1% | -5.73 |

By side:

| side | n | hit% | units |
|---|---|---|---|
| over | 268 | 70.5% | -19.83 |
| under | 69 | 87.0% | -1.54 |

By market × side (the granular version — this is where the story actually
is):

| market | side | n | hit% | units | breakeven%* |
|---|---|---|---|---|---|
| points | over | 108 | 69.4% | -8.69 | 76.4% |
| points | under | 21 | 90.5% | +0.82 | 87.3% |
| rebounds | over | 50 | 80.0% | +4.95 | 75.6% |
| rebounds | under | 15 | 93.3% | +0.46 | 90.8% |
| assists | over | 65 | 64.6% | **-12.81** | 77.4% |
| assists | under | 17 | 88.2% | -0.37 | 90.4% |
| threes_made | over | 45 | 71.1% | -3.28 | 72.2% |
| threes_made | under | 16 | 75.0% | -2.45 | 89.2% |

*breakeven% = average implied probability of the price taken (1/decimal
odds) — hit% below this loses money even on a "good" pick.

By confidence bucket and by EV bucket — full tables run, headline: the
**EV<0 bucket has the highest hit rate of any bucket (81.2%, n=207) and the
single worst unit result (-14.83u)**, while the **EV 25%+ bucket has the
lowest hit rate (55.6%, n=63) and is the only bucket with positive units
(+1.54u)**. That is the exact inverse of what the soccer backtest found.

**Gate simulations (soccer's constants, transplanted as-is):**

| gate | n | hit% | units | units/pick |
|---|---|---|---|---|
| baseline (no gate) | 337 | 73.9% | -21.37 | -0.063 |
| `MIN_EXPECTED_VALUE = 0` alone | 130 | 62.3% | -6.54 | -0.050 |
| `MAX_TRUSTED_EV = 0.25` alone | 274 | 78.1% | -22.91 | **-0.084 (worse)** |
| both together (soccer's exact `0≤EV≤0.25`) | 67 | 68.7% | -8.08 | **-0.121 (worse)** |
| `EV ≥ 0.10` (a softer floor) | 88 | 59.1% | +1.11 | +0.013 |
| drop `assists/over` + `points/over` (the two worst combos) | 164 | 80.5% | +0.13 | ~0.000 (noise) |
| `EV≥0.10` AND drop those two combos, stacked | 33 | 66.7% | +6.20 | +0.188 — **but n=33, two post-hoc filters mined from the same 337-row sample; flagging as an overfit example, not a recommendation** |

Sanity check that this isn't one bad week: split the odds-era in half —
first half (n=224) -15.87u, second half (n=113) -5.50u. Negative in both
halves; not a single-patch artifact.

**Why this is the opposite of soccer, and why I'm not implementing a gate:**
soccer's `expected_value` is priced off a de-vigged market consensus
(calibrated by construction, so a probability estimate that's "too good to
be true" really is a red flag). NBA's `expected_value` in
`src/lib/analysis/predictions.ts` is `(confidence/100) * price_decimal - 1`,
where `confidence` is a heuristic composite score (weighted window-mean
checks + margin/sample penalties in `confidence.ts`), not a calibrated
probability. Treating it like one for a gate produces exactly the wrong
signal here — the ceiling removes NBA's one profitable band, and the floor
alone still leaves the ledger net negative. The actual loss driver is
structural and different from soccer's: NBA books price short favorites
(`points/over`, `assists/over`) tight enough that even ~70% hit rates don't
clear the vig — a pricing/margin problem, not a confidence-miscalibration
problem, and not one an EV gate fixes.

**Recommendation: adopt none of soccer's gates on the NBA engine.** The
closest thing to a positive result (`EV ≥ 0.10`, +1.11u/88, or the
market/side cut at breakeven/164) is too thin and too sample-limited (one
~4-week stretch of one now-ended season) to hardcode as a rule the way
soccer's 208-pick, clearly-separated result supported its gates. I did not
add `MIN_EXPECTED_VALUE`, `MAX_TRUSTED_EV`, or a market/side gate to
`predictions.ts` / `confidence.ts`. I added one comment (no functional
change) in `predictions.ts` right after the `expected_value` computation,
recording this backtest and its numbers, in the same "named
constant/documented number" style the soccer engine uses, so a future
session doesn't re-derive this or copy soccer's constants on faith.

**NBA is dormant** (`NBA_LIGHT_MODE=true`, crons early-exit; season
restarts late October) — none of this analysis changes any live behavior
today regardless, since I made no functional change.

## Files

- `src/lib/analysis/predictions.ts` — added a documentation-only comment
  after the `expected_value` computation (no logic change). Everything
  else in `src/lib/analysis/` untouched.
- `src/lib/analysis/soccer/**`, `src/lib/ingest/**`,
  `src/lib/sports/soccer/**`, all components/pages — not touched, out of
  scope per the task.
- Read-only backtest queries run via the scratchpad `q.mjs` helper against
  prod (`DATABASE_URL`), no writes.

## Risks

- The full backtest population (337 real-odds picks) spans one ~4-week
  window of one season (May 16 – Jun 13 2026). Any gate mined from it —
  including the ones I explicitly rejected — is on thin footing compared
  to soccer's 208-pick, multi-competition sample. I've tried to be
  conservative about that rather than ship something that "backtests well"
  on n=33-88.
- `pra`, `steals`, `blocks` exist in the `prop_market` DB enum but never
  appear in the odds-era data and aren't in the current
  `points|rebounds|assists|threes_made|minutes` contract — `pra` was a
  legacy pre-rewrite market (2 days, May 15–16). Not something I changed,
  flagging for awareness only.
- Task 2: I did not run the cron, per instructions. The CLAUDE.md decision
  I found mid-task (picks "ride out") was written by another session on
  this same branch, not by me — I'm reporting it because it's directly
  relevant to whether running the cron now is a good idea, not because I
  touched it.

## Next

Michael (code-review) gate on the one-comment diff (trivial). No further
engineering follow-up needed on the NBA side unless Kazim wants a deeper,
season-scale backtest once the new season provides more data than one
month — at that point re-running this same query set would be the way to
revisit the question, not copying soccer's constants.

## Human gate

None required — no functional change, no schema change, no money, nothing
irreversible, no cron was run. Flagging for awareness: whoever runs
`/api/cron/soccer/generate-predictions` next should know it will wipe the
18 pending picks + 4 coupons the other session just decided should "ride
out" under the old rules, per Task 2 above.
