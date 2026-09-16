# Soccer Odds Markets — What to Add Next (Nastiya, Research)

**Stage:** Research/Proposal (read-only) · **Date:** 2026-09-16 · **Branch:** `tmb_sep16_v5` (no changes made — this file only)

---

## Bottom line

**Add Both Teams To Score (BTTS) first.** It is not a code project — it is
already fully built (DB enum, TypeScript type, engine logic, grading, coupon
legs, UI labels, even chat FAQ copy already describe it as if it were live).
The only missing piece is real BTTS odds, which requires switching one fetch
path from the bulk odds endpoint to Odds API's per-event endpoint — verified
live, not assumed. That one architectural change (a **per-match** pull
instead of a **per-competition** pull) is also the thing that changes the
credit-cost shape for *any* market beyond the current two, so it's worth
understanding before adding anything else.

**Second: extend `total_goals` with one or two alternate lines** (e.g. Over
1.5 / Over 3.5), because it directly extends the one edge we've actually
measured (overs beat unders) rather than betting on an unproven new market.

**Skip, for now:** double chance / draw-no-bet (cheap to model but low
expected edge — see §3), Asian handicap (genuinely new modeling + thin book
depth + sharp-money market, see §3), correct score and team totals (near-zero
book coverage in what I could verify, high structural margin as a novelty
product).

Estimated cost of BTTS alone: **roughly +120–240 credits/month** depending on
region choice, against a ~450-credit headroom (500 minus the current
~45–50/month baseline). It fits, but it is a real commitment of the budget,
not a rounding error — see §4 for the math and the assumptions behind it.

---

## 1. What The Odds API actually offers (verified live, not from memory)

Checked with the real `ODDS_API_KEY` from `.env.local` against the live API.
**Total research cost: 16 credits** (one billed call; three others were free
— see the log at the bottom).

**Call 1 — `GET /v4/sports` (free, confirmed 0 cost).** All four of our
competitions are active sport keys: `soccer_uefa_champs_league`,
`soccer_uefa_europa_league`, `soccer_uefa_europa_conference_league`,
`soccer_turkey_super_league`.

**Call 2 — bulk `/v4/sports/soccer_turkey_super_league/odds` with
`markets=h2h,totals,btts,draw_no_bet,double_chance,alternate_totals,team_totals`
(free — 422, confirmed 0 cost, `x-requests-last: 0`).** The API rejected the
call outright:

> `"Markets not supported by this endpoint: alternate_totals, btts, double_chance, draw_no_bet, team_totals"`, `error_code: INVALID_MARKET`

This is the load-bearing fact for the whole proposal: **the bulk endpoint —
the one `track-odds` uses today for `match_winner`/`total_goals` — cannot
serve any additional market, full stop.** It's not a soccer-specific or
Süper-Lig-specific restriction; it's the endpoint itself. Confirmed live
against our own key, matching the reasoning already written into
`src/lib/signals/odds/soccer.ts`'s comment ("BTTS is an additional market
that needs the per-event endpoint + higher tier" — the "higher tier" half of
that comment is the one thing I can't confirm either way from a 422, but the
per-event-endpoint half is now verified, not assumed).

**Call 3 — `GET /v4/sports/soccer_uefa_champs_league/events` (free,
confirmed 0 cost).** Lists upcoming fixtures the odds board currently has
open (18 events at time of check, Arsenal v Lille among them).

**Call 4 — `GET /v4/sports/.../events/{id}/odds` for Arsenal v Lille,
`regions=uk,eu`, `markets=h2h,totals,btts,draw_no_bet,double_chance,
alternate_totals,team_totals,alternate_spreads,correct_score` (billed — 16
credits, confirmed via `x-requests-last: 16`).** This is the per-event
endpoint, and it does carry the additional markets. Per-market book counts
for this one match:

| Market | Books quoting it | Book depth | Notable |
|---|---|---|---|
| `h2h` (match_winner) | 32 | Deep | includes Pinnacle |
| `totals` | 12 | Moderate | includes Pinnacle |
| `alternate_totals` | 11 | Moderate | includes Pinnacle |
| `btts` | 8 | Thin-moderate | betfred_uk, onexbet, leovegas, virginbet, livescorebet, williamhill, coral, ladbrokes_uk — no Pinnacle |
| `alternate_spreads` (Asian handicap) | 4 | Thin | suprabets, onexbet, **pinnacle**, coolbet |
| `double_chance` | 4 | Thin | onexbet, virginbet, livescorebet, williamhill |
| `draw_no_bet` | 4 | Thin | virginbet, livescorebet, coral, ladbrokes_uk |
| `team_totals` | 0 | none observed | either not offered this far out (match is Oct 13), or not offered for this competition — I did not spend a second call confirming which |
| `correct_score` | 0 | none observed | same caveat |

**What I did not verify** (to keep the credit spend minimal, per the task's
own instruction): book depth for Süper Lig specifically, and whether
`team_totals`/`correct_score` are simply unposted this far from kickoff or
genuinely never offered for these competitions. I'm treating the endpoint-
level restriction (bulk vs. per-event) as sport-wide, since the 422 error
came back generically ("not supported by this endpoint"), not scoped to one
sport — that's the part I'm confident generalizes across our four
competitions. The exact book counts per market are a one-match sample and
will vary; treat the table as "which markets exist and are worth pricing
in principle," not a guarantee of depth on every match.

---

## 2. What our engine could actually model

Read `src/lib/analysis/soccer/engine.ts` end to end. The important finding:
**the engine's core machinery — `consensus()` (de-vig across books) and the
`SIDES` market registry — is already market-agnostic.** `SIDES` today reads:

```ts
export const SIDES: Record<SoccerMarket, MatchSide[]> = {
  match_winner: ["home", "draw", "away"],
  total_goals: ["over", "under"],
  btts: ["yes", "no"],
};
```

`btts` is already a key. `predictMatch()` loops `Object.keys(SIDES)`, so it
already tries to price BTTS on every run — it just always finds zero quotes
(`marketQuotes.length === 0`) because nothing ever fetches them, and silently
skips. Following the whole chain, BTTS turns out to be built essentially
everywhere already:

- **DB:** `soccer_market` enum already includes `'btts'` (migration `0016`).
- **Coupon legs:** the Zod schema in `coupon-legs.ts` already accepts `"btts"`.
- **Grading:** `settle.ts`'s `outcome()` already has a correct, tested `btts`
  branch (`both = home > 0 && away > 0`).
- **UI:** `labels.ts` has "Both Teams To Score" copy; `SettledPickRow.tsx`
  already renders btts rows; `MatchRates.tsx` renders whatever markets it's
  given generically (`markets.map((mk) => ...)`), no market list hardcoded.
- **Chat:** `source-faq.ts` already tells users "Both Teams To Score (btts):
  yes / no" exists — currently describing a market that never actually
  fires, since no odds ever arrive for it.

So the honest scope of "add BTTS" is: **one fetch-layer change** (get real
btts odds into the same `EngineQuote[]` shape `consensus()` already
consumes) **and one architecture change to `track-odds`** (per-match pulls,
see §4) — not new modeling, not a migration, not new UI.

**Alternate totals** (Over/Under at lines other than the modal 2.5) is the
same market type we already have (`total_goals`), just more lines. It needs
no new `SoccerMarket` value and no schema change. It does need a real (small)
engine change: today `predictMatch()` collapses to the single **modal** line
and stops (`modalLine()` + filter), so it would need to evaluate EV across
whichever lines actually have real odds and keep the best one — a bounded,
well-scoped change to one function, not a new module.

**Double chance / draw-no-bet** are pure algebra on the existing
`match_winner` consensus (1X = P(home)+P(draw), DNB scales out the draw) —
trivial to *compute a probability* for. But computing a **priceable EV**
pick still needs real market odds for that specific market (its own
bookmaker margin isn't derivable from `h2h`'s margin), so it doesn't save
the per-event-fetch cost — it only saves modeling effort, not credits.

**Asian handicap (`alternate_spreads`)** is the one genuinely new modeling
problem in this list. It needs a goal-supremacy (margin) distribution rather
than a 2/3-way outcome probability, and quarter-lines (e.g. -0.25, -0.75)
split the stake across two adjacent whole-number handicaps with partial
push/win/loss outcomes — `settle.ts`'s `outcome()` has no concept of a split
stake today, and would need one. Real new work, not a short step.

**Correct score / team totals** would need a full scoreline (or team-level)
probability distribution rather than a single side probability — a real step
up in modeling complexity, and (per §1) I found zero live book coverage for
either in the one match I checked.

---

## 3. Where edge is plausible — evidence vs. speculation, labeled

**What we actually have evidence for** (from the 208-pick backtest in
`docs/handoffs/engine-tuning_2026-09-16.md`): `total_goals/over` hit 60% for
+4.9 units while `total_goals/under` hit 48% for -7.0 units on the same
market; `match_winner` draws hit 18%. In plain terms: **our edge, such as it
is, lives on the "something happens" side of a match (goals, a clear
winner), not the "nothing happens" side (a low-scoring draw).**

That generalizes cautiously to new markets by *analogy*, not proof:
- **Alternate totals, lower lines (Over 1.5):** same market, same proven
  bias, just a shorter, higher-probability version of a bet we already know
  wins more than it should. This is the strongest evidence-backed pick in
  this proposal.
- **BTTS "yes"** correlates with goals being scored generally, so it's
  plausible some of the same bias carries over — but this is genuinely a
  **different market with its own bookmaker margin and its own dynamics**
  (a 1-0 win is "no" on BTTS but would be "over 0.5" on totals), and we have
  **zero direct evidence** on it. I'm not claiming BTTS is soft; I'm
  recommending it because it's nearly free to ship and because the existing
  EV floor/ceiling and banko threshold (already proven to filter well on the
  other two markets) will do the same filtering job here without new code.
  Worth flagging for whoever builds it: **BTTS "no" is the market's version
  of "under"/"draw"** (a goalless-for-one-side, lower-event outcome) and
  probably deserves the same `isGatedSide()` treatment once there's real
  data to check it against — not something to guess at without a backtest.

**On "less popular = softer" — real, but it cuts both ways.** The reasoning
holds for markets that are less *popular with casual bettors* but still
efficiently traded (Asian handicap is the textbook case: professional
bettors prefer it precisely because it removes draw variance, so Pinnacle —
the sharpest book in our own data — is one of only 4 books quoting it, and
sharp-book presence is usually a sign a market is *more* efficiently priced,
not less). It does **not** hold for "novelty" markets that are less popular
because they're recreational side-bets: **correct score** is the classic
example — many possible outcomes, thin liquidity per outcome, and books are
known to price it with wider margins than 1X2/totals precisely because
casual bettors chase it for fun rather than value. So: Asian handicap is
probably *harder* to beat despite looking underserved, and correct score is
probably *worse* to bet despite looking underserved. Both are reasons to
deprioritize them beyond the modeling-complexity case in §2 — this part is
inference from market-structure reasoning, not something I measured.

**Double chance / draw-no-bet:** structurally these are draw-insurance
products — priced tightly against the same `match_winner` consensus, bought
mostly by risk-averse bettors. No strong reason to expect softness, and they
only really matter in exactly the match states (close to a draw) where our
own data says we're weakest. Low priority.

---

## 4. Credit budget

**The pricing model, confirmed live:** cost = (valid markets requested) ×
(regions requested), whether bulk or per-event. The difference that matters:
**the bulk endpoint prices per competition regardless of match count** (one
call covers every match in the sport in one shot — this is why
`match_winner`+`total_goals` costs a flat 4 credits per pull no matter how
many matches are in the window). **The per-event endpoint prices per match**
— there is no bulk option for additional markets, confirmed in §1. This is
the whole reason "add BTTS" is a bigger commitment than it looks from the
code: it's not a bigger `markets=` string on the existing call, it's a
new per-match loop.

**Baseline today:** ~45–50 credits/month for the existing two markets across
four competitions (per `CLAUDE.md`'s own recorded 2026-09-15 number, and
consistent with what I observed: 52 used before my research, headroom of
448 remaining out of 500).

**Estimated match volume/month, in-season** (I did not verify this against a
season-long fixture count — this is a reasoned estimate, flagged as such):
- Süper Lig: 18 clubs, ~weekly rounds → ~9 matches/round × ~4.3 weeks ≈ **~39/month**
- UCL + UEL + UECL: 36-club league phase, 18 matches/matchday, matchdays
  clustered a few weeks apart per the competition registry's own comment →
  roughly 1.5 matchdays/month/competition on average across the season ≈
  **~27/month/competition × 3 ≈ ~81/month**
- **Total ≈ ~120 matches/month** in a typical in-season month (far less in
  international breaks and the off-season, similar to how UEFA's own
  unthrottled cadence already goes quiet between matchdays today).

**Cost of BTTS at once-per-match** (dedup by checking whether a
`soccer_odds_snapshots` row for that match+`btts` already exists — the
snapshot table already supports this, no new table or migration needed; this
is also what stops the cost from multiplying the way `match_winner`'s daily
re-pull does, since a per-event pull only needs to happen once, not once per
day the match sits in an 8-day window):

| Regions | Credits/match | Est. matches/month | Monthly cost | Plus baseline | Headroom left |
|---|---|---|---|---|---|
| `uk` only | 1 | ~120 | **~120** | ~165–170 | **~330/month** |
| `uk,eu` (matches current practice) | 2 | ~120 | **~240** | ~285–290 | **~210/month** |

I'd start with **`uk` only**: every book that quoted BTTS in my one-match
sample (betfred_uk, onexbet, leovegas, virginbet, livescorebet, williamhill,
coral, ladbrokes_uk) reads as a UK-market brand, so `eu` may add little or no
real coverage for this specific market — worth a single cheap confirmation
call before shipping (1 market × 1 region = 1 credit) rather than assuming.

**If adding alternate totals too:** same per-match, per-region cost
structure, so BTTS + alternate totals together at `uk`-only ≈ ~240/month +
baseline ≈ ~290/month, still under 500 but with less margin. **Recommend
sequencing, not simultaneous shipping:** ship BTTS, run it for real usage,
confirm the estimate above against the actual `x-requests-used` counter (the
same discipline already used to validate the Süper Lig cadence), then decide
on alternate totals with real numbers instead of two stacked estimates.

**If the estimate runs hot:** the lever is the same one already built for
Süper Lig — narrow further with a per-match cadence gate (e.g. only pull
within 48h of kickoff, or only for matches that already have a qualifying
`match_winner`/`total_goals` snapshot), not a paid tier.

---

## 5. Ranked recommendation

**1. BTTS — build first.** Everything except the odds fetch already exists
(§2). Implementation, concretely:
- `src/lib/signals/odds/soccer.ts`: add a per-event fetch function (new
  request against `/v4/sports/{sportKey}/events/{eventId}/odds`,
  `markets=btts`, `regions=uk` to start) alongside the existing bulk
  `fetchSoccerOdds()` — parses into the same `SoccerOddsQuote` shape
  (`market: "btts"`, `side: "yes" | "no"`, `line: null`).
- `src/app/api/cron/soccer/track-odds/route.ts`: after (or instead of, on
  alternating logic) the existing per-competition bulk call, add a loop over
  that competition's unfinished matches in the window, skip any match that
  already has a `btts` snapshot, call the new per-event fetch, insert rows
  the same way `insertSoccerOdds()` already does today (no new repo function
  needed — same table, market value already in the enum).
- **No migration.** `soccer_market` already has `'btts'`.
- **No engine change.** `predictMatch()` already prices it once quotes exist.
- **No UI change.** Already renders/labels it.
- Worth a deliberate decision (not a silent default) on whether `btts/no`
  should launch gated like `total_goals/under` is — I'd wait for real graded
  data rather than guessing, same discipline the Sep-16 tuning work used.

**2. Alternate totals (Over 1.5 / Over 3.5) — build second, after BTTS has
real usage data.** Extends the one edge we've actually measured. Needs a
real (small) change to `predictMatch()`'s totals branch to evaluate EV
across multiple real lines instead of only the modal one, plus the same
per-event fetch-and-dedup pattern as BTTS. No migration (still
`total_goals`).

**3. Double chance / draw-no-bet — skip for now.** Cheap to model, no strong
edge case for either direction (§3), and they cluster around exactly the
draw-adjacent match states our own data says we're weakest on.

**4. Asian handicap — skip.** Real new modeling (push/split-stake grading),
thinnest book depth we saw (4 books), and the one market where sharp-money
presence argues the *opposite* of "underserved and soft" (§3).

**5. Correct score / team totals — skip.** No live book coverage found for
either in what I checked, and correct score in particular is a
structurally high-margin novelty product, not a plausible soft spot.

**If the honest alternative is "the current two markets are enough" —** I
don't think that's the right call here, because BTTS specifically costs
almost nothing to ship (it's already built) and the credit budget clears
comfortably at `uk`-only regions. But I'd treat "ship BTTS, watch real
usage and real hit-rate for a month before touching anything else" as the
conservative reading of this proposal, not "ship BTTS + alternate totals
simultaneously" — that's where the credit-budget estimate gets stacked and
least certain.

---

## Verification log (credits)

| # | Call | Cost | Confirmed via |
|---|---|---|---|
| 1 | `GET /v4/sports` | 0 | `x-requests-remaining` unchanged (448) |
| 2 | Bulk odds, extra markets (422 rejected) | 0 | `x-requests-last: 0`, remaining unchanged |
| 3 | `GET /v4/sports/soccer_uefa_champs_league/events` | 0 | `x-requests-last: 0`, remaining unchanged |
| 4 | Per-event odds, 9 markets × 2 regions, 1 match | 16 | `x-requests-last: 16`, used 52→68 |
| **Total** | | **16** | |

---

## Human gate

None required to *read* this proposal — it's research, no code or DB
changes were made (confirmed: only this file was written). The gate is on
whatever gets built from it: BTTS touches a cron (real money-adjacent
scheduling, API credit spend) and should go through the normal
solutions-architect → frontend/backend-engineer → code-review → release
pipeline before shipping, same as the Sep-16 engine tuning work did.

## Next

Hand to **solutions-architect** (Selma) to scope the BTTS implementation
(files named above) as a normal ticket, or straight to a backend engineer if
Kazim wants to skip scoping given how bounded the change is.
