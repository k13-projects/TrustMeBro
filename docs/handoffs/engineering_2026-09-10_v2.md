# Engineering handoff — Football match page

(Second engineering handoff filed today — see `engineering_2026-09-10.md` for the
unrelated club/team page work from another session; not overwritten.)

## Status
NEEDS-REVIEW

## Summary
Built `/football/match/[id]` end to end: hero (live-updating banner, round/leg caption,
kickoff/live/FT, venue·attendance·referee), engine picks, odds tiles + a new hand-drawn SVG
odds-movement chart, cross-competition form + head-to-head, match stats bars, lineups, goals/
cards timeline + commentary, and a news + same-matchday aside. Wired every match banner
site-wide (schedule/scoreboard rows, BANKO cards, pick lines) to link into it. `tsc` and
ESLint (React Compiler rules included) are clean on every file touched. Verified with real
headless-Chrome screenshots at 1440 and 390 for a finished UCL match, an upcoming UCL match,
and a World Cup archive match — all three render, no new horizontal overflow, all empty states
read correctly. **Flagging one real, systemic backend bug found during QA** (see Risks) that
currently blackholes Stats/Lineups/Form/Commentary for every match, everywhere — not something
I fixed, since it lives in `espn.ts`, which is mid-edit by another session and outside this
task's file list.

## Files
- `src/app/football/match/[id]/page.tsx` — new route: `generateMetadata` + page, fetches DB
  data and the ESPN match detail in parallel, degrades every section independently
- `src/app/football/match/[id]/loading.tsx` — new skeleton
- `src/components/soccer/MatchRates.tsx` — new; extracted verbatim from `rates/page.tsx`'s
  inline `MatchRates` function so both the rates board and the match page share one component
- `src/components/soccer/OddsMovement.tsx` — new; inline-SVG line chart (no library) — one
  line per match-result outcome (home/draw/away), a small Over-X.5 row when a total-goals line
  is priced, `<title>` tooltips per point, "movement appears after the second pull" empty state
- `src/lib/sports/soccer/match-queries.ts` — new; one query, `getMatchLeagueSlug(matchId)` —
  needed the ESPN league slug for a match and `queries.ts` doesn't expose it (and is off-limits,
  owned concurrently), so this is a standalone one-column read instead of touching that file
- `src/app/football/rates/page.tsx` — trimmed: local `MatchRates`/`shortSide` replaced by the
  import from the new component; page behavior unchanged
- `src/components/soccer/MatchRow.tsx` — banner wrapped in `<Link href="/football/match/[id]">`
- `src/components/soccer/BankoCard.tsx`, `src/components/soccer/PickLine.tsx` — compact banner
  (not the whole card, so the add-to-coupon button keeps its own click target) wrapped the same way

Untouched, exactly as instructed: `queries.ts`, `rates.ts`, `labels.ts`, `competitions.ts`,
`cart.ts`, `StandingsTable.tsx`, `TeamCrest.tsx`, `CountryFlag.tsx`, `registry.ts`, `layout.tsx`,
`globals.css`, the scoreboard page. (`team-match.ts` and `espn.ts` show as modified in `git
status` — that's another session's in-flight work, not mine; confirmed via `git diff --stat`.)

## What renders — finished vs. upcoming vs. archive
- **Finished UCL match** (`/football/match/401915452`, AEK Athens 1–0 LASK, screenshots
  `finished-ucl-1440.png` / `-390.png`): hero shows final score + "FULL TIME" + venue. Engine/
  Odds sections correctly show their empty states (this match was never priced — no odds
  history, no predictions, both consistent with each other). Timeline's "Match events"
  collapsible has real goal/card data (verified via the existing `/api/soccer/matches/[id]/events`
  route independent of my page). Stats/Lineups/Form/H2H are absent — see the backend bug below.
- **Upcoming UCL match** (`/football/match/401915264`, Barcelona v Como, Wed Jan 27 kickoff,
  screenshots `upcoming-1440.png` / `-390.png`): hero shows the LA-timezone date+time and venue
  ("Spotify Camp Nou"), engine/odds show their pre-priced empty copy, "Same matchday" aside
  lists the round's other fixtures with kickoff times, News aside populates from real rows.
- **World Cup archive match** (`/football/match/760517`, Spain 1–0 Argentina, the final,
  screenshots `wc-1440.png` / `-390.png`, competition switched via cookie): full World Cup gold
  theme, flags instead of crests, and — because this pick was graded — the Engine section
  renders a real `SettledPickRow` ("WON — Under 2.5 goals — 1.68 — 59%"), proving that path end
  to end. No same-matchday list (correct — it's the final, no siblings that day).
- All three: no page-level horizontal scroll introduced by anything I built (empty-state cards,
  news cards, same-matchday rows, odds tiles all stayed inside the viewport at 390px).

## Data gaps / bugs observed
- **Backend bug, not mine to fix, but it guts a chunk of this page's value:**
  `EspnSoccerProvider.getMatchDetail()` in `espn.ts` throws `RangeError: Invalid time value`
  for every match I tested (checked 4, across both UCL and World Cup) before it ever reaches
  stats/lineups/last-five/commentary. Root cause: `matchFrom()` reads `ev.date` (works for the
  scoreboard/listing endpoint), but the `/summary` endpoint's `header` object has no top-level
  `date` — the real value lives at `header.competitions[0].date` (confirmed against ESPN's raw
  response). `isoDateInProjectTz(undefined)` → `new Date(undefined)` → the formatter throws.
  My page already wraps the `getMatchDetail()` call in `.catch(() => null)` and every downstream
  section is null-guarded, so the page never crashes — it just silently shows no Stats/Lineups/
  Form/Commentary for anyone, on any match, until this is fixed upstream. `espn.ts` is under
  active edit by another session right now (uncommitted changes already in the tree) and isn't
  in this task's file list, so I left it alone rather than risk colliding with that work — flagging
  it here so it gets routed to whoever owns that file next. One-line fix once someone's free to
  touch it: fall back to `ev.date ?? ev.competitions?.[0]?.date` in `matchFrom`.
- `getNewsForMatch`'s team-overlap matching (in `queries.ts`, off-limits) pulls in news that
  mentions either club but isn't about this specific fixture — e.g. the Barcelona v Como page
  surfaced a "Como vs RB Leipzig" engine preview and general transfer-rumor stories. Functions
  as designed (team relevance, not match-exclusive) but is looser than "news about this match";
  noting in case that's not the intended feel.
- Two near-duplicate news rows appeared once (same Yahoo Sports story, US + Canada editions) —
  a source-side dedup gap, not something in the query I'm allowed to touch.
- `getMatchLeagueSlug` reads straight from `soccer_matches.league_slug`; this column is
  populated correctly for every match I checked (confirmed directly against Supabase), so the
  provider always gets the right ESPN league — the bug above is unrelated to slug resolution.

## Risks
- The pre-existing `espn.ts` bug above means Stats/Lineups/Form/Commentary are currently
  invisible in production for every match — worth a fast follow-up once that file is free.
- I found (not introduced) a **site-wide** mobile overflow at 390px: the top ticker, the
  competition switcher, and `MatchBanner` at `size="lg"` all clip past the right edge of the
  viewport. Confirmed this predates my change by screenshotting the already-shipped
  `/football/schedule` page at 390px (`schedule-390.png`) — identical clipping there. Did not
  touch `MatchBanner.tsx`/the nav chrome to fix it — that's a larger, shared-component change
  outside "build the match page," and risks colliding with the concurrent club-page session.
  Flagging for whoever owns a mobile-polish pass.
- Match stats bars use a naive `parseFloat` on ESPN's `displayValue` strings (e.g. "54%", "12")
  to size the two-sided bar — reasonable for the stat set in `STAT_LABELS` today, would need a
  second look if a non-numeric stat value ever gets added there.

## Screenshots
`/private/tmp/claude-501/-Users-k13-Desktop-PROJECTS-TrustMeBro/046cd513-bc69-4d62-bc5a-830cb0a2999e/scratchpad/agentA/`:
`finished-ucl-1440.png`, `finished-ucl-390.png`, `upcoming-1440.png`, `upcoming-390.png`,
`wc-1440.png`, `wc-390.png`, plus `schedule-390.png` (baseline proof the mobile clip predates
this change).

## Next
qa-test-engineer (Olga) via the code-review gate (Michael) — Michael should weigh in on the
`espn.ts` fix suggestion before anyone applies it, since that file is owned elsewhere right now.

## Human gate
none
