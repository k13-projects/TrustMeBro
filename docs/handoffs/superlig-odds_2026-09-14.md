# Süper Lig — Odds Wired, With a Real Cost Governor

**Author:** Mariana (backend-integrations-engineer) · **Date:** 2026-09-14 · **Branch:** `tmb_sep14_v8`

Turns `tur.1`'s odds seam on (`oddsKey: null` → `"soccer_turkey_super_league"`) and adds the
cadence gate that makes that safe to do on a Hobby-plan, 500-credit/month Odds API budget. No
commit/push — release-engineer owns that.

---

## The core problem, and why it isn't just a shorter window

`track-odds` already had one free skip: "no unfinished match in the lookahead window → no
call." That's why UEFA's cost stays low — Champions/Europa/Conference League matchdays cluster
every few weeks, so most days that skip fires for free. Süper Lig plays Fri–Mon **every week**
Aug–May, so the 8-day window (or even a 2-day one — I checked) has an unfinished match on
almost every single day. The existing skip essentially never fires for a weekly domestic
league, and at 4 credits/call that's ~120 credits/month just for this one competition — against
NBA needing that budget back for player props (10x the cost per credit).

**Fix: a per-competition rate limit on *time between calls*, not on the lookahead window.**
Registry field `oddsCadence` on `CompetitionMeta`
([src/lib/sports/soccer/competitions.ts](../../src/lib/sports/soccer/competitions.ts)):

```ts
export type OddsCadence = { minHours: number; freshWithinHours: number } | null;
```

- `null` for every UEFA competition and for `fifa.world` — **unthrottled, byte-for-byte the
  same code path as before this task.** The `if (cadence) { ... }` block in track-odds is
  skipped entirely when `oddsCadence` is null, so nothing about UEFA's behavior changed.
- `tur.1`: `{ minHours: 78, freshWithinHours: 24 }`.
  - `minHours` is a hard floor: a pull for this competition never happens sooner than 78 hours
    (3.25 days) after the last one, **full stop**, regardless of how many matches are
    "imminent." This is what actually bounds the credit spend — see arithmetic below.
  - `freshWithinHours` lets that pull move up to 24h *earlier* than its next scheduled slot,
    but only inside that 24h window before the slot — so a match kicking off soon still gets a
    reasonably fresh price instead of waiting out the full 78h. It never adds an extra pull, it
    only re-times the existing one.

Implementation: [src/lib/sports/soccer/odds-cadence.ts](../../src/lib/sports/soccer/odds-cadence.ts)
(`shouldPullOdds`, pure, no DB/fetch — unit-testable) + two small helpers in
[repo.ts](../../src/lib/sports/soccer/repo.ts) (`getLastOddsPullAt` / `recordOddsPull`) that
reuse the **existing** `ingest_state` table (migration 0021, already used for on-visit refresh
bookkeeping) with keys like `soccer_odds:tur.1` — no new migration, no new table.

### Why a flat "pull every ~3 days" alone doesn't get there

I simulated this by hand first and it's counterintuitive: with matches on 4 of 7 days a week,
an "always pull if a match is within 24h" override — read literally — re-triggers on every one
of those 4 days (each day's own match is imminent), which defeats any minHours floor. The fix
that actually holds the line: the "bring the pull forward" window is capped at `freshWithinHours`
hours *before the next already-scheduled slot*, not "any time a match is imminent." That means
the early-trigger can only ever consume the slot that was coming anyway — it can't manufacture
extra ones. Net effect: the pull rate is mathematically capped at `1 / minHours`, period.

### Proof, not just the claim — simulated a full season

I didn't trust the hand arithmetic alone. `shouldPullOdds` is pure, so I ran it against a
synthetic 300-day season (Fri/Sat/Sun/Mon matches every single week, **no international
breaks** — deliberately worst-case) at the real cron cadence (once/day):

| `minHours` | credits/month |
|---|---|
| 72 | 52.3 (resonates badly with the 7-day round cycle — misses the target) |
| 73–96 | **34.9** |
| 108+ | 26.3 |

Picked **78** (3.25 days) — comfortably inside the ≤40/month target with headroom, and a real
season has international breaks and Turkish Cup weekends this simulation doesn't, so real
spend will be lower still.

**Expected: ~35 credits/month for Süper Lig**, against a ≤40 target and a 500/month free-tier
ceiling shared with NBA + 3 UEFA competitions.

---

## Live verification (not simulated) — what actually happened against the real system

Spent **8 credits total** this session (of 468 available at task start): one to pull the live
Süper Lig feed and cache it for repeat testing, one real `track-odds` run through the actual
cron endpoint. Ended at **460/500 remaining**.

1. **One live Odds API call**, cached to a fixture file, never re-called:
   `soccer_turkey_super_league`, `regions=uk,eu`, `markets=h2h,totals` → **9 matches, 34 distinct
   bookmakers** (Pinnacle included), 4 credits.
2. **Team-name matching, proven against real data** (§ below) — 0 unmatched.
3. **Real `track-odds` run** (`?competition=tur.1`) against the live dev server + live DB: **9
   events, 1,126 quotes, 1,126 snapshots inserted, 45 odds-history rows, 0 unmatched**, 4 credits.
   `ingest_state` row `soccer_odds:tur.1` now holds `last_run_at`.
4. **Immediate second `track-odds` run**, same competition: `"skipped": "cadence: next pull not
   due yet (min 78h between pulls, last pulled 2026-09-14T22:22:38.363Z)"`, **0 credits** — the
   cadence gate genuinely fires, not just in theory.
5. **`generate-predictions?competition=tur.1`** against the odds just pulled: **9 matches, 10
   predictions, 4 coupons, 2 banko** — real picks, not zero. Confidence range 51.7–79.1%,
   expected_value computed per the engine contract (mostly small negative, one +0.0175 — sane,
   not fabricated):
   - Fenerbahce ML (home), conf 79.1, odds 1.21 @ betfair_ex_eu, EV −0.043
   - İstanbul Başakşehir ML (home), conf 60.3, odds 1.56 @ unibet_se, EV −0.059
   - Trabzonspor v Galatasaray under 3.5, conf 55.3, odds 1.84 @ onexbet, EV **+0.018**
   - (7 more, all in the 51–57 range)
6. **`settle-bets?competition=tur.1`**: `refreshed_matches: 4, predictions_settled: 0,
   calls_graded: 0` — no errors; 0 settled is correct, since the newly-priced matches (Sep
   18–20) haven't kicked off yet. This call makes zero Odds API calls (ESPN + DB only), so it
   costs nothing regardless of competition — no guard needed here, matches the existing P0
   build's reasoning for why `settle-bets` was left unguarded.
7. **UEFA unaffected — proven by code path, not by spending a UEFA credit unnecessarily.**
   `oddsCadence: null` for all three UEFA competitions means `shouldPullOdds` returns `true` on
   its first line — the exact same behavior as before this task — and the `if (cadence) await
   recordOddsPull(...)` write is skipped too, so there's no new side effect for UEFA runs
   either. I did exercise the *shared* "no unfinished matches" skip (still the same free guard
   UEFA has always used) against a UEFA competition with an empty date range, confirming that
   pre-existing code path is untouched. Spending a live UEFA credit to prove a structurally
   unreachable code path felt like the wrong tradeoff against "mind the credit budget."

---

## Team-name matching — the four real mismatches, plus two for consistency

Verified against the live feed's 9 matches / 18 clubs, diffed against the actual ESPN names in
the DB (`select distinct name from soccer_teams ... where competition='tur.1'` — 18 rows).
`Fenerbahce`/`Galatasaray`/`Besiktas` already had aliases from UEFA play. Of the remaining 15,
most already clear the fuzzy-match threshold on their own (`NOISE` already strips generic
suffixes like `sk`/`fk`), but four genuinely diverge and needed an explicit alias in
[team-match.ts](../../src/lib/sports/soccer/team-match.ts):

| Bookmaker spelling | ESPN spelling | Why it diverges |
|---|---|---|
| `Amed SK` | `Amed SFK` | Suffix isn't the generic noise-stripped `SK` — it's part of the club's actual name (SFK), not caught by the noise list |
| `Basaksehir` | `Istanbul Basaksehir` | ESPN carries the city prefix, the book drops it |
| `Gazişehir Gaziantep` | `Gaziantep FK` | Book uses the old/full club name, not the current branding |
| `Torku Konyaspor` | `Konyaspor` | Sponsor prefix |

Two more added for **consistency** with the existing pattern (`besiktas jk` → `besiktas`,
`fenerbahce sk` → `fenerbahce` already in the table), even though token-overlap already
resolves them on their own (`sk` is in the `NOISE` set):

- `kasimpasa sk` → `kasimpasa`
- `genclerbirligi sk` → `genclerbirligi`

**Fails safe, not by luck:** `resolveMatch` still requires both sides of a fixture to clear a
0.6 similarity floor and refuses a tie/near-tie against a runner-up — I didn't touch that logic.
The dotless-ı fix from the prior QA pass on this branch was left exactly as is; I built on it,
didn't undo it.

**Proof, run against real data, twice:**
- All 18 bookmaker names now resolve to their ESPN counterpart at similarity `1.00` (canonical
  string equality via the new aliases) — checked with a standalone script against the cached
  live feed, before *and* after the alias additions (before: 12 already at 1.00, 6 at 0.75 via
  the fuzzy "contained" floor, all above the 0.6 threshold; after: all 18 at 1.00).
- Ran the actual `resolveMatch` function from `team-match.ts` against real `soccer_matches` rows
  (backfilled via a real `sync-fixtures` call for the Sep 14–21 window) and the 9 real bookmaker
  events: **0 unmatched, 9/9 matched**, each to the correct `match_id`.
- The real `track-odds` cron run (§ above) reports `"unmatched": []` for `tur.1` — the same
  proof, from the production code path, not a side script.

---

## Files

- `src/lib/sports/soccer/competitions.ts` — `OddsCadence` type, `oddsCadence` field on
  `CompetitionMeta`, `tur.1.oddsKey` → `"soccer_turkey_super_league"`, `tur.1.oddsCadence` set,
  all four other competitions get `oddsCadence: null` (explicit, no behavior change).
- `src/lib/sports/soccer/odds-cadence.ts` — new. `shouldPullOdds`, pure.
- `src/lib/sports/soccer/repo.ts` — `getLastOddsPullAt` / `recordOddsPull`, reusing
  `ingest_state`.
- `src/app/api/cron/soccer/track-odds/route.ts` — candidate query now also selects `datetime`;
  cadence check + skip result before spending a credit; `recordOddsPull` after a successful
  fetch, gated behind `if (cadence)` so UEFA's run has zero new side effects.
- `src/lib/sports/soccer/team-match.ts` — 6 new `CLUB_ALIASES` entries for `tur.1` (see table
  above), commented as a block, dotless-ı fix from the prior QA pass untouched.

No migration — `ingest_state` (migration 0021) already had exactly the shape needed
(`key text primary key, last_run_at timestamptz`) for a generic per-job cadence clock.

## Verified

- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes compile.
- `npm run lint` — clean.
- Real `track-odds`, `generate-predictions`, `settle-bets` runs against `tur.1` on the live dev
  server + live Supabase DB — see the numbered list above, not just 200s.
- Credits spent this session: **8** (4 to cache the live feed, 4 for the real `track-odds`
  proof run). Started the session at 468 remaining (32 used); ended at 460 remaining (40 used).
  Confirmed via `x-requests-remaining`/`x-requests-used` response headers on both calls, and via
  a re-run immediately after that shows the cadence gate blocking a third would-be call.

## Risks

- **The 78h/24h numbers are tuned against a synthetic worst-case season** (matches every single
  week, no international breaks). Real Süper Lig calendars do have FIFA windows and Turkish Cup
  weekends, so actual spend should run *below* the simulated ~35 credits/month, not above it —
  but worth a real spot-check of `x-requests-used` a few weeks into live running, same house
  rule as "verify from the source, not the note."
- **`ingest_state` is now dual-purpose** (on-visit refresh bookkeeping *and* cron cadence
  clocks). Both uses key off the same `key text primary key` shape and neither reads the other's
  keys (`soccer_odds:*` vs. the existing `soccer_news`/`soccer_fixtures:*` keys), so there's no
  collision — but flagging the dual use so the next person touching `ingest_state` knows both
  consumers exist.
- **Real settlement of these picks is still pending** — the 10 predictions generated this
  session are for matches Sep 18–20, so `settle-bets` correctly reported 0 settled. The full
  win/loss/EV story for these specific picks can't be verified until those matches finish;
  flagging so nobody reads "0 settled" as a bug.
- Six team-name aliases are new, narrow, and specific to this one league — no changes to the
  fuzzy-matching thresholds or `NOISE` list themselves, so no cross-competition blast radius.

## Next

**qa-test-engineer** (Olga) — this branch already has a QA pass for the odds-free Phase 1
build; worth a short follow-up specifically on the now-populated Value/Picks/Rates pages for
Süper Lig (empty-state copy fix from the P1 backlog is still open, unrelated to this task).
Then **code-review** (Michael) gate, then **release-engineer** (Kate) for branch/commit/PR — no
commits made this session per the task brief.

## Human gate

None. The $0 path (cadence tuning, this task) was explicitly what Kazim approved turning on;
no plan-upgrade or paid-tier decision was made or needed here. Everything in this handoff is
implementation, not a spend decision.
