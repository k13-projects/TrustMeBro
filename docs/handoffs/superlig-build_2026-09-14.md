# Süper Lig — Phase 1 (P0) Build

**Author:** Natalia (frontend-engineer) · **Date:** 2026-09-14 · **Branch:** `tmb_sep14_v8`

Built exactly the P0 task list from `docs/handoffs/superlig-scope_2026-09-14.md`: registry
entry, red theme, the two real bugs, cron skip guards, backfill, news feeds. No commit/push —
release-engineer owns that per the task brief.

---

## What was built

1. **Registry** (`src/lib/sports/soccer/competitions.ts`) — added `"tur.1"` to
   `SoccerCompetition`, `"sl"` to `CompetitionTheme`, the full `tur.1` entry (verified
   logo id 18, `oddsKey: null`), and `COMPETITION_ORDER` (after `uefa.europa.conf`,
   before the archive). `oddsKey` widened to `string | null`.
2. **Theme** (`src/app/globals.css`) — `[data-competition="tur.1"]` block, same shape as
   the UEL/UECL blocks, `#E30A17` primary (flag red, verified distinct from
   `rose-400 #fb7185`), reusing `--font-ucl` (no new font load).
3. **Bug #1 — `groupIntoRounds()`** (`src/lib/sports/soccer/queries.ts`). Root cause was
   the ISO-week bucketing condition being a literal `=== "league-phase"` check.
   **Deviation from the scope's literal formula:** the scope suggested
   `!QUALIFYING_STAGES.has(stage) && !(stage in KNOCKOUT_LABEL)`. Applied as-is, that
   would *also* start ISO-week-bucketing the World Cup's `"group-stage"` fixtures
   (currently one single stage-keyed bucket for the archive), silently changing frozen
   archive behavior nobody asked for. Added one more exclusion (`stage !== "group-stage"`)
   so only a genuinely week-less, one-slug-for-the-whole-season stage (UEFA's
   `"league-phase"`, Süper Lig's ESPN `season.slug`) gets the weekly heuristic. Verified:
   45 real fixtures now render as **Matchday 1–6**, not one giant round.
4. **Bug #2 — `isKnockoutStage()`** (`src/lib/sports/soccer/bracket.ts`). Flipped the
   denylist to an allowlist by reusing the existing `STAGE_ORDER` array (already the
   canonical enumeration of every real qualifying/knockout stage slug) — no new list to
   maintain. Verified: `/football/bracket` for Süper Lig renders the correct
   "No knockout ties on record yet" empty state, zero fabricated ties.
5. **Odds seam** — `oddsKey: string | null` widening surfaced two required call-site
   fixes via `tsc` (not guessed): `SHARE_THEME` (`src/lib/og/theme.ts`) needed an `sl`
   entry, and `UEFA_COMPETITION_ID` (`src/lib/sports/soccer/uefa.ts`) needed a `"tur.1":
   null` entry (Süper Lig isn't UEFA's, same reasoning as the World Cup being FIFA's —
   genuinely correct, not a workaround). Also found and fixed a latent type-safety hole:
   `src/app/football/page.tsx`'s local `Accent` component had its own hardcoded
   `"ucl" | "uel" | "uecl" | "wc"` union instead of importing `CompetitionTheme` — widened
   to the real type so the next new theme can't silently skip this component again.
   - **Skip guards, with one deviation from the literal "three guards" instruction:**
     `track-odds` and `generate-predictions` both skip a competition outright when
     `oddsKey === null` (verified via direct cron calls — zero Odds API credits spent,
     zero DB reads for `tur.1`). `settle-bets` deliberately does **not** get a
     full-competition skip: it also runs fixture sync and score-call grading
     ("Call the Scores"), which must keep working for Süper Lig with no odds at all.
     `settleSoccer()` itself already no-ops correctly (zero pending predictions to
     grade), so I left it running and added a one-line comment explaining why no guard
     is needed there — verified via a direct call: `refreshed_matches: 4`,
     `predictions_settled: 0`, `calls_graded: 0`, no errors.
6. **Backfill** — `sync-fixtures?competition=tur.1&from=2026-08-01&to=2026-09-14`:
   **45 matches, 18 standings rows**, single stage `"2026-27-turkish-super-lig"` —
   matches the scope's verified facts exactly. Row counts confirmed directly against
   Postgres (`DATABASE_URL`), not assumed.
7. **News** — added `COMPETITION_FEEDS["tur.1"]` (EN + TR Google News queries, same
   shape as the other three). For `CLUB_ALIASES`, pulled the **actual live 18-club
   roster from the DB** rather than reusing the scope's offhand list, which turned out
   to differ from reality (no Antalyaspor/Sivasspor/Kayserispor/Karagümrük this season;
   Amed SFK/Erzurum BB/Samsunspor are in). Added aliases for the 15 non-UEFA clubs, plus
   a missing `Besiktas` entry the scope claimed already existed but didn't.
   - **Caught and fixed a real false-positive during verification, not just before
     shipping the idea:** ran the actual `scrape-news` cron and found a columnist byline
     ("Özgür **Kocaeli**") mis-tagged to Kocaelispor, and would have added a similarly
     risky "Gençler" (= "the youths", an everyday Turkish word) alias for
     Gençlerbirliği and "Eyüp" (a common Turkish first name) for Eyüpspor. Removed all
     three before they shipped bad tags; also corrected the one already-inserted bad
     row (`soccer_news.id = 21410`) after the fix.

## Verified (not assumed)

- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes compile including the two changed cron routes.
- `npm run lint` — clean.
- Live-hit (existing project dev server, port 9136 — did not start a second instance;
  Next detected another `next dev` already bound to this repo and refused, correctly,
  so all verification ran against that instance) with `tmb_competition=tur.1` cookie:
  `/football` (home), `/football/schedule` (Matchday 1–6, confirmed via grep, not just
  200), `/football/standings` (18-club table, real club names render), `/football/bracket`
  (confirmed empty, no ties table, only the static intro paragraph — see Risks),
  `/football/club/997` (Trabzonspor profile), `/football/match/401888391`,
  `/football/predictions`, `/football/value`, `/football/news`, `/football/clubs`,
  `/football/scoreboard` — all **200**, no server errors introduced by these changes.
- Direct cron calls (with `CRON_SECRET`) for `sync-fixtures`, `track-odds`,
  `generate-predictions`, `settle-bets`, `scrape-news`, all scoped to `tur.1` — outputs
  inspected above, not just "200 OK".
- Row counts confirmed via direct Postgres query (`pg` package, `DATABASE_URL`):
  45 matches, 18 clubs, 112 news rows tagged (spot-checked correct club IDs on several
  headlines).

## Files

- `src/lib/sports/soccer/competitions.ts` — registry entry, type widening.
- `src/lib/sports/soccer/queries.ts` — `groupIntoRounds()` fix (bug #1).
- `src/lib/sports/soccer/bracket.ts` — `isKnockoutStage()` fix (bug #2).
- `src/app/globals.css` — `tur.1` theme block.
- `src/app/api/cron/soccer/track-odds/route.ts` — skip guard.
- `src/app/api/cron/soccer/generate-predictions/route.ts` — skip guard.
- `src/app/api/cron/soccer/settle-bets/route.ts` — documenting comment, no guard (see #5
  above).
- `src/lib/og/theme.ts`, `src/lib/sports/soccer/uefa.ts` — `oddsKey`-nullability call-site
  fixes surfaced by `tsc`.
- `src/app/football/page.tsx` — `Accent` component's theme prop now uses the real
  `CompetitionTheme` type instead of a stale hardcoded union.
- `src/lib/signals/news/soccer/rss.ts` — `tur.1` news feeds + 16 club alias entries
  (15 Süper Lig-only clubs + the missing `Besiktas`).

No migration needed — `soccer_matches`/`soccer_standings`/`soccer_news` already carry a
`competition` column (migration 0022) that accepts any string; the `tur.1` rows slotted in
with zero schema changes.

## Risks / known gaps (deliberately not fixed — out of P0 scope)

- **Bracket page intro copy** (`src/app/football/bracket/page.tsx:37-39`): the descriptive
  paragraph above the (correctly empty) tie list still says "Every knockout tie, both legs
  and the aggregate..." for every `kind === "club"` competition, Süper Lig included — which
  has no knockout structure at all. Not a data bug (zero fake ties render, verified), just
  inapplicable copy. Same class of issue as the `/football/value` empty-state copy the scope
  already flagged as P1 (item 9) — this one wasn't caught in the scope doc; flagging it
  alongside that item rather than fixing it now, since it's copy-only and P1-shaped, not P0.
- **Postponement / Monday-fixture round mislabeling** (scope §3) — accepted limitation,
  unchanged, not fixable without a real round number ESPN doesn't provide for this league.
- **Dotless-ı gap in `team-match.ts`** (scope §9) — untouched, irrelevant until odds land.
- Noticed but **did not touch** (pre-existing on this branch before this task, confirmed via
  `git log`/`git diff --stat` showing zero unrelated changes to `src/app/football/page.tsx`'s
  `after()` usage): the dev server log shows `Route /football used cookies() inside after()`
  errors from a pre-existing `maybeRefresh`/`after()` interaction, unrelated to Süper Lig.
  Flagging for whoever owns that area next — not fixed here (out of scope, not introduced by
  this work).
- Two stray untracked files sitting next to real source (`competitions 2.ts`, `bracket
  2.ts`, etc., throughout `src/lib/sports/soccer/`) are gitignored sync-conflict artifacts
  (`.gitignore:27: * 2.*`), not part of this change — left alone, confirmed harmless.

## Next

**qa-test-engineer** (Olga) for the Chrome QA gate (desktop + mobile), then
**code-review** (Michael) gate per the standing pipeline, then **release-engineer**
(Kate) for branch/commit/PR — this session made no commits per the task brief.

## Human gate

None. Both of Selma's batched open questions in the scope doc (bracket-nav visibility,
exact theme hex) were already decided in that doc and implemented as decided. Nothing here
needs Kazim's sign-off before QA.
