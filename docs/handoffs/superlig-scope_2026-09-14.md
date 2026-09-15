# Süper Lig — Implementation Scope (ESPN-only, Phase 1)

**Author:** Selma (solutions-architect) · **Date:** 2026-09-14 · **Status:** plan only, no code written

Turkish Süper Lig joins the football section as a 4th live competition, ESPN-only:
fixtures, standings, rounds, news, and the community score-prediction game all work
day one. No bookmaker odds, so **no engine picks, no value board, no bracket** in
phase 1 — those come back on their own once a separate track wires an odds source.
Everything below is verified against the live ESPN API and the actual source files,
not assumed.

Two real bugs surfaced during this scope, not hypothetical — see §3 and §4. Both are
must-fix-before-ship, not polish.

---

## 1. Registry entry

```ts
// src/lib/sports/soccer/competitions.ts

export type SoccerCompetition =
  | "fifa.world"
  | "uefa.champions"
  | "uefa.europa"
  | "uefa.europa.conf"
  | "tur.1";

export type CompetitionTheme = "wc" | "ucl" | "uel" | "uecl" | "sl";

// CompetitionMeta.oddsKey becomes `string | null` — see §8.

"tur.1": {
  id: "tur.1",
  label: "Süper Lig",
  fullName: "Turkish Süper Lig",
  shortLabel: "SL",
  season: 2026,
  seasonLabel: "2026-27",          // ESPN's own displayName: "2026-27 Turkish Super Lig"
  status: "live",
  kind: "club",
  espnSlugs: ["tur.1"],             // no qualifying feed — verified: tur.1_qual 400s
  oddsKey: null,                    // no source yet; see §8
  logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/18.png",
  emoji: "🔴",
  theme: "sl",
  tagline: "18 clubs, one table, every Turkish derby",
  phaseLabel: "Regular Season",     // ESPN carries no stage/round taxonomy for this league — see §3
},
```

Add `"tur.1"` to `COMPETITION_ORDER` (after `uefa.europa.conf`, before `fifa.world`
— keep the archive last) so the switcher and every `COMPETITION_ORDER.map()` consumer
picks it up automatically (`CompetitionSwitcher.tsx`, `liveCompetitions()`).

**Verified facts (live calls made today, not re-quoting the brief):**
- `season.slug` on every `tur.1` fixture = `"2026-27-turkish-super-lig"` — constant
  all season, never `"league-phase"`. This is the root cause of §3 and §4.
- League logo id is **18** (`.../500-dark/18.png`, confirmed against the scoreboard
  payload's own `leagues[0].logos`), not one of the ids in the brief's example list.
- No `tur.1_qual` feed exists (400 on request) — a single-slug domestic league has
  no qualifying rounds, confirming the brief's guess.
- 45 fixtures already played/scheduled Aug 1 – Sep 14, out of 34 rounds × 9
  matches/round = 306 total for the season.

---

## 2. Theme — Süper Lig red, kept off the banned/reserved palette

Existing pattern: `[data-competition="<id>"]` block in `globals.css` re-tokens
`--primary`, `--surface`/`--surface-2`, `--chart-1`, `--font-display` (see UCL/UEL/UECL
blocks at `src/app/globals.css:192-310`).

**Constraint check:** CLAUDE.md bans purple/fuchsia/violet/indigo outside real team
colors, and reserves emerald for positive-delta data semantics. Turkish football red
doesn't touch either — UEL already owns orange, UECL owns green (which is *also* the
emerald-adjacent hue banked for deltas, worth noting it's already a precedent: UECL's
`#22c55e` primary sits right next to the positive-delta emerald `text-emerald-500`.
Red has no such collision — Süper Lig is the only competition on red, and rose/negative
semantics (`text-rose-400/500`) use a *pinker*, cooler red than the flag-red proposed
here, so the two stay visually distinct as long as the specific hex is chosen away from
Tailwind's rose-400 (`#fb7185`).

Proposed tokens, mirroring the UEL block's shape:

```css
[data-competition="tur.1"] {
  --primary: #E30A17;            /* Turkish flag red — distinct from rose-400 #fb7185 */
  --primary-foreground: #fff5f5;
  --primary-hover: #ff2e3d;

  --accent-foreground: var(--primary);
  --ring: var(--primary);
  --sidebar-primary: var(--primary);
  --sidebar-accent-foreground: var(--primary);

  --surface: #170808;
  --surface-2: #200d0d;
  --card: var(--surface);
  --popover: var(--surface);

  --chart-1: var(--primary);
  --font-display: var(--font-ucl);   /* reuse existing UEFA display face — no new font load */
  --font-heading: var(--font-ucl);
}

[data-competition="tur.1"] .font-display {
  /* same letter-spacing/weight override the UCL/UEL blocks apply, copy verbatim */
}
```

No new font file needed — reusing `--font-ucl` (Barlow Condensed) keeps every
competition's display type in the same family, which is already the house pattern
(UEL and UECL both reuse it too, per the CSS above).

---

## 3. Rounds — `groupIntoRounds()` breaks for this league, confirmed

Read `src/lib/sports/soccer/queries.ts:186-227`. The function only buckets by ISO
week when `m.stage === "league-phase"` (UEFA's literal slug). Everything else falls
into the `else` branch: `key = m.stage ?? "other"`, one bucket **per distinct stage
value**, labeled via `KNOCKOUT_LABEL[key]` or a title-cased fallback.

Süper Lig's `stage` is the same string (`"2026-27-turkish-super-lig"`) on every one
of its ~306 fixtures. Unpatched, `groupIntoRounds()` would return **one giant "round"**
containing the entire season — `/football` schedule mode, `/football/predictions`
(which reads `currentRound()`), and `RoundNav` would all break or show nonsense.

**Fix required (P0, not optional):** generalize the ISO-week bucketing condition from
`m.stage === "league-phase"` to "any stage that isn't a known qualifying/knockout
stage slug" — i.e. flip the check to `!QUALIFYING_STAGES.has(m.stage) &&
!(m.stage in KNOCKOUT_LABEL)` (or simpler: key it off `competition.kind`/a new
`format` field, see §4). Either way, Süper Lig's 306 fixtures need to land in ~34
weekly buckets, not one.

**Even after that fix, two edge cases will bite a weekly single-table league harder
than UEFA's competitions ever hit them** (UEFA matchdays are cleanly one-per-week by
design; a domestic league scheduled Fri–Mon is not):
1. **Postponements.** A rained-out fixture replayed weeks later carries the *original*
   round's identity in real life, but `groupIntoRounds()` has no round number in the
   ESPN payload to anchor to — it will bucket the replay into whatever ISO week it's
   actually played, mislabeling it (e.g. a Round 12 makeup match played during Round
   18's week shows up as part of "Matchday 18").
2. **Monday fixtures crossing the ISO week boundary.** Süper Lig commonly plays one
   match on Monday. ISO weeks run Mon–Sun, so a Monday match is already in the
   *following* week from the Fri/Sat/Sun games of the same round — it'll compute as
   its own round-of-one, or worse, get merged with the next round's Friday game if that
   one also falls Mon–Sun of the same ISO week.

Neither is fully fixable without a real round number from a data source (ESPN doesn't
expose one for this league — verified, no `week`/`matchday` field in the scoreboard
payload). Recommend: ship the ISO-week heuristic anyway (right most of the time), and
treat mislabeled edge rounds as a known, accepted limitation — not worth a bespoke
round-detection system for phase 1. Flag it in the P0 QA pass so it's a documented
gap, not a surprise bug report later.

---

## 4. What breaks / degrades / works, route by route

| Route | Behavior for Süper Lig (no odds) | Verdict |
|---|---|---|
| `/football` home (3 modes) | Slate mode reads fixtures directly — fine once §3 is fixed. Between-matchdays mode (countdown, last-round-replayed, table movement) depends on `getRounds()` — same §3 dependency, otherwise fine. | Works once §3 fixed |
| `/football/match/[id]` | ESPN summary (form/stats/lineups/commentary) is odds-independent; the "our picks" + "odds movement" panels on the page render as their own empty states already (no rows to join). | Degrades gracefully |
| `/football/club/[id]` | Profile, schedule, squad, news — all ESPN/DB, no odds dependency. Engine record panel shows zero/empty, same pattern as day-one UCL before its first pick. | Degrades gracefully |
| `/football/value` | Read the source (`src/app/football/value/page.tsx:96-104`): already has an explicit empty state — *"Prices load in the days before a matchday"* when `rows.length === 0`. Renders correctly empty, but that copy **implies odds are coming soon**, which is false for this competition in phase 1. | Works, but copy is misleading — low-priority polish, not a blocker |
| `/football/bracket` | **Confirmed bug, not a hypothesis.** `isKnockoutStage()` (`bracket.ts:55-57`) is a *denylist*: `stage !== "league-phase" && stage !== "group-stage"` counts as knockout. Süper Lig's constant stage string (`"2026-27-turkish-super-lig"`) matches neither exclusion, so **every single fixture reads as a knockout tie**. `groupIntoTies()` then keys ties by an *unordered* team pair (`bracket.ts:67`), so a club's home leg in September and its return away leg in February — normal domestic double round-robin — get merged into one fake "tie" with a bogus aggregate score. This is not an empty page, it's **wrong data rendered as real**. | **Actively broken — must gate before ship, not just leave to render** |
| `/football/predictions` (Call the Scores) | Fully ESPN/DB-driven — round, matches, user guesses, leaderboard. Zero odds dependency anywhere in the page. | Works fully, day one |
| Scoreboard breakdown (`getEngineBreakdown`) | Filters `soccer_predictions` by competition + status; zero rows for Süper Lig ⇒ empty buckets, same shape as any competition with no settled picks yet. No odds-specific code path. | Degrades gracefully |
| `/score` | This is the **legacy NBA** route (`src/app/score/page.tsx` redirects to `/scorecard`) — unrelated to football entirely. Not in scope. | N/A |

**Nav:** confirmed the existing pattern (`src/lib/sports/registry.ts:89-117`) does
**not** filter nav items per competition — the archived World Cup shows the exact
same Bracket/Value/Picks/Rates links as live UCL, relying on each page's own
empty-state. Following that established convention, **do not** hide Value/Picks/Rates
from nav for Süper Lig either — consistent with how the archive already behaves.

**Bracket is the one exception to "leave it visible."** Because the bug above
produces *wrong* data rather than an empty page, Bracket needs an actual gate before
ship — not a nav hide (inconsistent with house pattern) but a data-level fix: add an
explicit **allowlist** of real knockout-stage slugs to `isKnockoutStage()` instead of
the current denylist (the qualifying/knockout label maps already enumerate every
legitimate UEFA stage name — flip the function to check membership in those maps
instead of excluding two strings). That one change fixes it correctly for every
current and future single-table competition, not just this one.

---

## 5. Data backfill

Season started **August 2026** (`startDate: 2026-07-01` per ESPN's league object,
first actual fixtures early August). Verified: `GET .../scoreboard?dates=20260801-20260914`
in **one call** returned all **45** fixtures played/scheduled so far — ESPN's
site.web API accepts a date-range query directly, no need to page day-by-day.

- `sync-fixtures?competition=tur.1&from=2026-08-01&to=2026-09-14` (the endpoint
  already supports `from`/`to` — confirmed in `src/app/api/cron/soccer/sync-fixtures/route.ts`)
  does the whole backfill in the same handful of ESPN calls the live cron already
  makes per day (1 scoreboard call for the range + 1 standings call).
- **Row count: trivial.** 45 matches this far into the season, ~306 for the full
  season. Compare to the World Cup's 92 matches / 198 graded picks / 11k news rows
  that already live in this DB without incident. This is roughly 5x smaller than one
  UEFA competition's full season (which runs 2 ESPN slugs × qualifying + league phase).
  **No egress concern** — the house lesson about bulk backfills burning Supabase
  egress was about the *initial* multi-competition World Cup buildout pulling
  everything at once; one 45-row domestic-league catch-up is not that.

---

## 6. Cron impact

All four soccer crons (`sync-fixtures`, `track-odds`, `generate-predictions`,
`settle-bets`, `scrape-news`) loop over `liveCompetitions()`. Adding `tur.1` adds
one iteration to each loop.

- **`sync-fixtures`** (`maxDuration = 120`, Hobby ceiling 300s): each live competition
  costs 1 scoreboard call (date range) + 1 standings call per `espnSlugs` entry.
  UCL/UEL/UECL each carry **2** slugs (main + qualifying) = up to 4 calls each; Süper
  Lig carries **1** slug = 2 calls. Adding it is proportionally *less* than a 4th of
  current load, not more. ESPN calls are fast (sub-second, observed) and free — no
  credit ceiling like the Odds API. Comfortably inside 120s; no split needed.
- **`scrape-news`** (`maxDuration = 60`): same shape, one more RSS-fetch pass per
  competition, isolated per-feed already (`runSoccerNewsIngest` catches per-feed
  failures). Low risk.
- **`track-odds` / `generate-predictions` / `settle-bets`:** these must **not**
  actually do odds work for `tur.1` yet (see §8) — the fix there is a one-line skip
  guard, not a timing concern, since skipping is near-instant.

Net: no timeout risk, no parallelization needed for this addition. Worth actually
watching the real `sync-fixtures` duration in Vercel logs after the first live deploy
rather than trusting the estimate blind — cheap to check, and the house rule is verify
from the source, not the note.

---

## 7. News sources

Read `src/lib/signals/news/soccer/rss.ts`. Two feed tiers already exist:
- `SHARED_FEEDS` — fires for **every** competition, already includes three Turkish
  sports desks (Hürriyet, Fotomaç, Sabah Spor) because Turkish clubs already play in
  UEFA competitions. These will pick up Süper Lig content automatically once
  `loadTeams("tur.1")` returns its 18 clubs — **no new shared feed needed.**
- `COMPETITION_FEEDS` — one Google News query pair (EN + TR) per competition,
  keyed by exact phrase.

**Proposed addition**, matching the existing pattern exactly:

```ts
"tur.1": [
  {
    url: "https://news.google.com/rss/search?q=%22Super+Lig%22&hl=en-GB&gl=GB&ceid=GB:en",
    outlet: "Google News",
    source: "rss:gnews-sl-en",
  },
  {
    url: "https://news.google.com/rss/search?q=S%C3%BCper+Lig&hl=tr&gl=TR&ceid=TR:tr",
    outlet: "Google Haberler",
    source: "rss:gnews-sl-tr",
  },
],
```

**The real gap is the tagging table, not the feed list.** `rss.ts`'s own
`CLUB_ALIASES` (separate from `team-match.ts`'s table — this one drives which
stories get tagged to which club) already has `Fenerbahce`/`Galatasaray`/`Besiktas`
entries because those three already play in UEFA competitions. The other 15 Süper
Lig-only clubs (Trabzonspor, İstanbul Başakşehir, Kasımpaşa, Konyaspor, Alanyaspor,
Antalyaspor, Sivasspor, Gaziantep FK, Kayserispor, Rizespor, Eyüpspor, Göztepe,
Kocaelispor, Çorum FK, Gençlerbirliği, Karagümrük) have **no alias entries yet** —
Turkish-language headlines using their diacritic spellings (e.g. "Başakşehir")
won't tag against an ASCII-only stored name without one. This is a straightforward
~15-line addition to the same table, not new plumbing.

---

## 8. The odds seam — what stays stubbed, not designed here

Per the brief, a separate track is researching the actual odds source. What this
scope leaves ready for it to plug into, with zero rework:

- **`oddsKey: string | null`** on `CompetitionMeta` (currently `string`, required —
  this one-line type widening is the only registry-shape change needed). `tur.1`
  ships with `oddsKey: null`.
- **`liveCompetitions()` stays as-is** (fixtures/standings/news should be live for
  Süper Lig now) but `track-odds`, `generate-predictions`, and `settle-bets` each
  need a one-line guard — skip any competition whose `oddsKey` is `null` — so they
  don't attempt to call an odds provider that doesn't exist for this league yet.
  This is a skip, not a redesign; it costs nothing once removed.
- **`SoccerOddsQuote` normalizer, `modalLine()`, `getSoccerRates()`** — untouched.
  Whatever the odds track builds will feed the same shape that already powers
  UCL/UEL/UECL.
- **Matchday-only polling** (mentioned in the brief as an idea for the odds track)
  is explicitly *not* designed here — noted only so whoever picks up odds knows the
  seam exists and the cost model (§6) leaves headroom for it.
- The day `oddsKey` gets a real value, Value/Picks/Rates/Bracket-if-ever-relevant
  start populating with zero further registry or nav changes — the seam is the
  point.

---

## 9. Team-name matching — diacritics, verified precisely

`team-match.ts`'s `normalizeTeamName()` does `NFKD` + strip combining marks. I tested
this against the actual Turkish letters rather than assuming it "just works":

| Letter | NFKD decomposes to | Folds correctly? |
|---|---|---|
| ş, ğ, ç, ö, ü (lowercase) | base letter + combining mark | **Yes** — mark strips, e.g. ş → s |
| İ (dotted capital I) | `I` + combining dot above | **Yes** — folds to plain `I` |
| **ı (dotless lowercase i)** | **no decomposition — stays as `ı`** | **No** — the diacritic-strip regex has nothing to remove; `ı` never becomes `i` |

So `Beşiktaş`/`Fenerbahçe`/`Kasımpaşa`-style names fold *almost* correctly today —
only the dotless-ı case is a real, narrow gap (affects club names containing it, e.g.
"Kasımpaşa", "Sivasspor" has none, "İstanbul Başakşehir" starts with the *dotted*
capital which is fine). Concretely, this matters for two different layers once odds
land, and slightly differently for each:
- **`team-match.ts` (bookmaker ↔ ESPN reconciliation, future):** if either side ever
  spells a club with a lowercase dotless ı where the other side used ASCII `i`,
  `teamSimilarity()` will under-score that token. Low blast radius — `resolveMatch()`
  already refuses to guess on a weak/tied score rather than mis-assigning, so the
  failure mode is "unmatched" (already tracked per the house `unmatched` reporting
  convention), never a wrong assignment.
- **Cmd-K search (`name_search` + alias table):** unaffected by this specific gap if
  `name_search` is accent-folded through the same or an equivalent transliteration
  step — worth confirming which normalization it actually uses when that table is
  populated for Süper Lig clubs, but not a phase-1 blocker since ESPN's own stored
  names are what the search indexes, not raw bookmaker spellings.
- **Fix, if it's ever worth it:** a two-character map (`ı`→`i`, and its uppercase
  counterpart `I` already round-trips fine) added to `normalizeTeamName()` closes
  the gap for every competition, not just this one. Not urgent for phase 1 (no odds
  yet to match against), but cheap enough to just do whenever `team-match.ts` is next
  touched for the odds integration — noting it here so it's not rediscovered cold.

---

## 10. Phased task list

### P0 — browsable (ship this first; everything below depends on it)
1. Registry entry (§1) + `COMPETITION_ORDER` + `SoccerCompetition` union + `CompetitionTheme` union. — *30 min*
2. `oddsKey: string | null` type widening across `CompetitionMeta` + the 4 existing entries get `oddsKey: "..."` unchanged, `tur.1` gets `null`. — *15 min*
3. Theme block in `globals.css` (§2), copy the UEL block's shape. — *30 min*
4. **Fix `groupIntoRounds()`** (§3) — generalize the league-phase-only ISO-week condition. This is the one change every other page depends on. — *1-1.5 hr incl. testing against real Süper Lig fixture data*
5. **Fix `isKnockoutStage()`** (§4) — flip denylist to allowlist so Bracket doesn't fabricate fake ties. — *45 min*
6. Skip guards in `track-odds`/`generate-predictions`/`settle-bets` for `oddsKey === null` (§8). — *30 min*
7. Backfill: `sync-fixtures?competition=tur.1&from=2026-08-01&to=<today>` (§5), then a standings sync. — *5 min to run, verify row counts after*
8. News: `COMPETITION_FEEDS["tur.1"]` entry (§7) + the ~15 club alias entries in `rss.ts`'s `CLUB_ALIASES`. — *45 min*

**P0 total: ~4-5 hours of focused work**, most of it the two bug fixes (§3, §4) rather than the new-competition plumbing itself, which is now a well-worn pattern (this is the 4th competition added this way).

### P1 — polish
9. Rewrite `/football/value`'s empty-state copy to not imply "prices load soon" when the copy is shown for a competition that structurally has no odds source yet (§4) — small conditional string, not a redesign. — *20 min*
10. Document the postponement/Monday-fixture round-labeling limitation (§3) somewhere QA will see it, so a mislabeled matchday during the season reads as a known gap, not a bug report. — *10 min*
11. Confirm Cmd-K `name_search`'s actual normalization step against the dotless-ı gap (§9) — read-only check, fix only if it's already broken for an existing club. — *20 min*
12. Spot-check the real `sync-fixtures` cron duration in Vercel logs post-deploy (§6) rather than trusting the estimate. — *5 min, one-time*

### P2 — odds seam (not this pass; tracked so the later work has a clean landing spot)
13. When the odds track lands a source: flip `tur.1`'s `oddsKey` to the real key, remove the three skip guards from P0.6, confirm `team-match.ts`'s `CLUB_ALIASES` covers the 15 new clubs' bookmaker spellings (§9), consider closing the dotless-ı gap in `normalizeTeamName()` while that file is open anyway.

---

## What the user sees at the end of Phase 1

Süper Lig appears as a fourth tab in the competition switcher, red-themed, with its
own crest. Switching to it shows the current round's fixtures, the full 18-team
table, club pages with squads and schedules, and Turkish-language news correctly
tagged to the right clubs — all driven by ESPN, refreshing daily like every other
live competition. The community score-prediction game ("Call the Scores") works
immediately, no odds required. What's conspicuously absent and expected to be:
Engine Picks, Best Value, and Odds pages show their normal empty states (same as any
competition before its first tracked price), and the Bracket page — correctly, this
league doesn't have one — either shows nothing or is skipped, once the knockout-stage
fix from §4 is in place; without that fix it would instead show fabricated fake
"ties," which is the one failure mode this plan explicitly prevents from shipping.

---

## Open questions for Kazim (batched, none blocking P0)

None of these block starting P0 — flagging per the autonomy contract so they're
recorded rather than asked mid-build:

1. **Bracket page for single-table leagues, long-term:** this scope proposes fixing
   `isKnockoutStage()` to an allowlist, which makes Bracket correctly show nothing
   for Süper Lig. Worth deciding once, for every future single-table league: should
   the nav item disappear entirely for a competition with no knockout structure, or
   is "correctly empty" (matching how Value/Picks already behave for a competition
   with no odds yet) the house pattern to keep? Decided for this scope: keep it
   visible and correctly empty, consistent with existing conventions — flagging in
   case that default is wrong for the next domestic league added after this one.
2. **Theme color exact hex:** proposed `#E30A17` (Turkish flag red) — cosmetic
   choice, easy to swap in review, not gating anything.

---

## Status      PASS
## Summary     Scoped Süper Lig (`tur.1`) as a 4th ESPN-only football competition: registry entry, red theme, news feeds, and backfill plan are all straightforward extensions of the existing 4-competition pattern. Two real bugs surfaced and are scoped as P0 fixes, not later cleanup: `groupIntoRounds()` only buckets by week for UEFA's literal `"league-phase"` stage string, so unpatched it would flatten Süper Lig's whole season into one round; and `isKnockoutStage()`'s denylist logic would misclassify every Süper Lig fixture as a knockout tie, merging a club's home and away leg into one fake bracket "tie" with a bogus aggregate score. Odds are explicitly out of scope — `oddsKey` goes nullable and three crons get a one-line skip guard so a parallel odds-source effort has a clean seam to land in later.
## For Kazim   Added the plan for Turkish Süper Lig as a new football competition — schedule, standings, news, and the score-prediction game, no betting odds yet (that's a separate piece of work). Found two real bugs the plan fixes before anything ships: without the fix, the app would have shown one giant lumped-together "round" for the whole season instead of weekly matchdays, and would have shown fake fabricated bracket matchups that don't actually exist. Both are called out as must-fix, not left for later.
## Files       docs/handoffs/superlig-scope_2026-09-14.md (this plan). No source files touched.
## Risks       Postponed/Monday fixtures can still mislabel a round after the ISO-week fix (§3) — accepted limitation, not fully fixable without a real round number ESPN doesn't provide. Dotless-ı diacritic gap in team-match.ts (§9) is real but low-blast-radius (fails safe to "unmatched", never a wrong assignment) and irrelevant until odds land.
## Next        frontend-engineer (Natalia) for the P0 build; the parallel odds-research track should read §8 before designing its integration so it lands on the intended seam.
## Human gate  none — both open questions above are non-blocking and can be decided in review.
