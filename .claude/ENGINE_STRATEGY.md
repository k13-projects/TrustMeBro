# Engine Strategy — High Win-Rate Scoreboard

Generated 2026-05-20 from a measured audit of live results (settled picks 05-15 → 05-20,
read-only query against the K13 Projects DB). This doc supersedes the prediction-volume
posture of CLAUDE.md's 2026-05-14 decisions and is the source of truth for where the
engine is going. Refine here before writing engine code.

---

## TL;DR

The engine currently has **no edge** — it's a coin flip betting *at* sharp bookmaker
lines, with a confidence number that is not a probability and a 57% void rate from
picking players who never play. We are pivoting from "10+ picks/day ranked by
confidence" to **a small set of genuinely high-probability locks**, with confidence
calibrated against real outcomes so the number means what it says.

**Goal:** a scorecard that climbs at a **real, honest >75% win rate** — achieved by
*selectivity*, not by inflating confidence.

---

## The diagnosis (real numbers, 05-15 → 05-20)

| Metric | Value | Verdict |
| --- | --- | --- |
| Settled record | 77 W – 74 L = **51.0%** | Coin flip; +3.0 score is noise |
| Void rate | **201 / 352 = 57%** | We bet players who don't play (DNP) |
| Confidence 80–89 → real | **63%** | Inflated ~20 pts |
| Confidence 90+ → real | **57%** | *Worse* than 80–89 — anti-predictive at the top |
| `threes_made` | **44%** | Below coin flip — actively losing |
| `points` | 57% | Best market |
| Over : Under | 119 : 32 | Heavily over-biased |

### Root causes

1. **We bet *at* the line.** [predictions.ts](../src/lib/analysis/predictions.ts) picks the
   side by `last5.mean >= line`. The book sets that line so recent form splits ~50/50 at
   −110. Betting "is his average above the line" is a coin flip *by construction* — the
   market already priced L5/L10/season. **You cannot beat a sharp line with the public
   stat that built it.**
2. **Confidence is an agreement score, not a probability.**
   [confidence.ts](../src/lib/analysis/confidence.ts) computes
   `base = passedWeight / totalWeight * 100` (how many of 6 stat windows agree with the
   pick) minus margin/sample penalties, clamped to [10, 95]. "85" means "most windows
   agree," not "85% to hit." Therefore EV (`confidence/100 * decimal_odds − 1`,
   [predictions.ts:64](../src/lib/analysis/predictions.ts)) is fiction.
3. **No availability gate beyond `avgMin ≥ 18`** ([run.ts](../src/lib/analysis/run.ts)).
   Average minutes hides boom/bust rotation players who frequently DNP → 57% void.
4. **Volume over quality.** The 2026-05-14 "min 10 picks/day" rule forces us to surface
   coin flips to hit a count.

---

## The decision

**Optimize for a high win-rate scoreboard, not +EV value.** (Eren & Kazimiro, 2026-05-20.)

### The honest framing — read this before arguing about 75%

There are two incompatible targets:

- **Beat the book (+EV):** realistic ceiling ~54–56%. Even elite sharps live there. A
  "75% win rate that also profits on −110 lines" does not exist; claiming it means
  inflating the number — the exact thing we're fixing.
- **High win-rate scoreboard (CHOSEN):** *achievable and honest* — bet thresholds a
  locked-in starter clears ~80%+ of the time, **away from** the line. Those legs are
  genuinely high-probability. The trade: they carry juice (−250/−400), so each leg is
  low/negative EV. For a stats & education tool whose ledger is W/L (and where parlays
  chase the 2× goal), that's an acceptable trade.

We are NOT promising profit. We are promising a **truthful, climbing win rate** from a
curated set of locks. Confidence shown to the user must equal empirical hit rate.

### What this supersedes in CLAUDE.md

- **Retires** "Günlük min. 10 pick" (2026-05-14). Some days will be 0–4 picks. Quality over count.
- **Reframes** confidence: 0–100 calibrated *probability*, not a check-pass tally.
- **Reframes** EV: only meaningful once confidence is calibrated; for the scoreboard path
  it is secondary (we expect mostly −EV juiced locks and that's fine).

> When Phase 2 ships, add a dated entry to the CLAUDE.md "Source Decisions" log recording
> this pivot and the metrics that justified it.

---

## Plan — phased, each phase shippable and measured

### Phase 0 — Measurement harness *(do first; small)*

Without a calibration readout we can't prove any change helps.

- New `GET /api/admin/calibration` (CRON_SECRET / admin-gated) returning the audit query:
  hit% by 10-pt confidence band, by market, over/under split, void rate, BotD record,
  rolling last-N-days. JSON + a simple table view.
- Optionally a `/score`-adjacent internal page; not user-facing for now.

**Acceptance:** one call shows the same breakdown we ran by hand today, refreshable any day.

---

### Phase 1 — Fix the void rate (root cause was NOT pick quality)

> **Corrected 2026-05-20 by measurement.** The "57% void" is almost entirely a
> **settlement-timing bug + one cancelled game**, NOT players who don't play. Evidence:
> - Voided players average **28.1 min**; settled players average **28.2 min** — identical.
>   A minutes-floor gate would fix nothing. (The original "availability gate" plan was
>   based on a wrong hypothesis — discarded.)
> - **194 of 201 voids (96%)** come from just **3 games where every pick voided**:
>   - 401871157 & 401871338 — **Final**, box scores ingested *after* settle ran, so 125
>     picks were voided as "DNP" before stats existed and stuck (settle is idempotent,
>     only touches `pending`). **All 125 are recoverable: 63 would win, 62 would lose, 0 true DNP.**
>   - 401871158 — **Cancelled** playoff game (series ended). 69 picks correctly void, but
>     we wasted generation on a game that never happened.
> - True player-DNP voids: **7** (~2.5%). Normal.

Real fixes:

1. **Stop premature voiding** in [settle.ts](../src/lib/scoring/settle.ts): only void a pick
   as DNP when the game is Final **and the game has ingested box-score rows**. If a Final
   game has *zero* stat rows, that's ingest lag → **keep the pick `pending`** so a later
   run settles it. (Discriminator: a player missing from a game that *does* have other stat
   rows = true DNP → void; a game with no rows at all = stats haven't landed → wait.)
2. **Handle cancelled / postponed games:** void their pending picks (no score change) so
   they don't sit pending forever, and exclude them from quality metrics. Ideally skip
   generating for games already flagged cancelled.
3. **Recover the 125 stuck voids** via a re-settle repair (re-grade voided picks on Final
   games that now have stats). ⚠️ Mutates the live scoreboard (77-74 → ~140-136) — run only
   on explicit OK.

**Acceptance:** true void rate (excluding cancelled games) **< 5%**; the 125 stuck voids
re-settle to 63 W / 62 L; settled sample grows 151 → ~276 so calibration is meaningful.

> Note: recovering the stuck voids does **not** improve the hit rate — it stays ~50.7% on
> the larger sample. The core "coin flip at the line" problem (Phase 2) is unchanged and
> now confirmed on 276 settled picks.

---

### Phase 2 — Honest probability + selectivity *(the core change)*

1. **Distribution-based probability** replaces the agreement score in
   [confidence.ts](../src/lib/analysis/confidence.ts):
   - Normal model for points / rebounds (mean + stdev from the feature windows).
   - Poisson (or empirical) for assists / threes — counting stats with low means.
   - `P(clear line)` for the chosen side becomes the raw probability.
2. **Calibration layer:** fit raw probability → empirical hit rate on the settled history
   (binned / isotonic to start; refit on a schedule as data grows). Store
   `confidence` = calibrated probability so "80" empirically hits ~80%.
3. **Selectivity threshold:** only emit picks with calibrated probability ≥ threshold
   (start ~70%, tune up toward the 75%+ target as volume allows). **Retire min-10.**
4. **Market triage:** drop `threes_made`; keep points / rebounds / assists / pra under review.

**Acceptance:** in the Phase 0 readout, the displayed confidence band hit% lands within
~±5 pts of the band label (calibrated), and the surfaced (above-threshold) cohort hits
materially above 51% — target trending to 75%+.

#### Phase 2 RESULTS (backtested 2026-05-20 on the recovered 276-pick sample)

Built [probability.ts](../src/lib/analysis/probability.ts) (Normal P(clear line), recency-
weighted mean, floored sigma) and backtested two ways:

- **Main lines — DEAD END.** Re-deciding the side with the distribution model scores
  **53.3%** overall and is **flat above 60% confidence** (model "70-75%" → real 47.6%).
  A model built on the same box scores the bookmaker used to set the line cannot pick the
  right side of that line. Confirmed: you can't beat a sharp main line with public stats.
- **Deep alt lines — VALIDATED.** Betting "over (projection − z·σ)" — i.e. a line well
  below projection — the model is **calibrated in the tail, ~5-6 pts overconfident**:

  | model P | real hit% |
  |---|---|
  | 90% | 84.5% |
  | 85% | 79.5% |
  | 80% | 74.2% |
  | 75% | 70.3% |

  And **every market works at depth** (@85% target: points 78%, rebounds 82%, assists 78%,
  threes 83%, pra 78%) — the main-line market-quality problem disappears with margin.

**Revised plan:** the high-win-rate scoreboard is delivered by **deep alt lines**, not main
lines. Main-line side-picking is abandoned. We need (a) alternate-line odds (Phase 4, now
**required**), (b) a calibration haircut (~+6 pts, i.e. aim model-90% to land real-85%), and
(c) a target — pick the deepest line where calibrated-P ≥ target. Market triage (drop threes)
is **moot** for the alt-line approach. Cost is contained by Phase 3 (only fetch alt lines for
the locked-starter shortlist).

---

### Phase 3 — Preprocess → shortlist → fetch odds *(cost)*

Reorder the pipeline so we spend Odds-API quota only on real candidates:

1. Build the candidate shortlist from **free local stats** (Phase 1 availability + Phase 2
   distribution edge) — no external calls.
2. Fetch odds (`/api/cron/track-odds`) **only** for shortlisted `(game, player, market)`.
3. Generate picks for the shortlist.

Player props cost 10× on The Odds API; this is where the bill drops. Matches the
"preprocess, then load" instinct.

**Acceptance:** measurable drop in Odds-API request count per day with equal-or-better
pick quality.

---

### Phase 4 — Alternate lines *(REQUIRED — Phase 2 proved main lines can't hit 75%)*

The backtest settled this: main lines top out at ~53%, alt lines calibrate to 75-85%. So:

- Extend the odds provider to pull `*_alternate` player-prop markets from The Odds API.
- For each locked starter (Phase 1) + good market, compute the distribution
  ([probability.ts](../src/lib/analysis/probability.ts)) and select the deepest available alt
  line whose **calibrated** P ≥ target (e.g. a 26-ppg star's "over 14.5 pts" ≈ real 85%).
- `confidence` = calibrated P (raw model P minus the ~6-pt haircut from the backtest).
- Reliable lock volume across all markets, at the cost of more API spend and heavy juice
  (−400+). Juice/EV is irrelevant on the scoreboard path; win rate is the product.

**Cost control:** combine with Phase 3 — only request alt lines for the locked-starter
shortlist, not the whole slate. Open question: how deep to bet (higher target = safer but
more juice / fewer "interesting" picks) — pick a target win rate with the user.

---

## Success metrics

- **Primary:** rolling 14-day settled win rate (engine ledger) trending to and holding **>75%**.
- **Void rate < 15%.**
- **Calibration error** (|band label − real hit%|) within ~±5 pts.
- **Odds-API requests/day** down vs. the pre-Phase-3 baseline.
- Scorecard score (`wins − losses`) monotonically climbing week over week.

## Risks & open questions

- **Lock volume:** honest ≥75% spots on main lines may be rare → some empty days. Acceptable
  per the decision, but UX should handle "no locks today" gracefully.
- **Calibration data is thin** (~150 settled). Early calibration will be noisy; widen the
  window and refit as it grows. Don't over-trust small bands.
- **Injury feed reliability:** the gate is only as good as the scrape. Stale/incorrect
  status reintroduces voids.
- **2× goal vs. high win rate:** safe legs are juiced; reaching 2× still needs parlay
  construction (0.8³ ≈ 51%). The Bro Board coupon math interacts here — revisit when we
  wire locks into combos.

## Recommended start

**Phase 0 + Phase 1 together.** Low risk, immediately cut API cost (fewer void picks),
clean the scorecard, and stand up the measurement loop so Phase 2's confidence rewrite is
graded against real outcomes rather than vibes.
