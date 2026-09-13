# Engineering handoff — Football club/team page

## Status
PASS

## Summary
Built the `/football/club/[id]` page: header (crest/flag, standing line), cross-competition
form strip, upcoming/results fixtures, engine pick record, squad grouped by position, and
club news. Linked every team name in `StandingsTable` to it. Verified with `tsc`, ESLint
(React Compiler rules included), and headless-Chrome screenshots at 1440 and 390 for a big
club (Real Madrid), a qualifying-round club (AEK Athens), and a World Cup nation (Spain, via
cookie + curl). Found and fixed one real mobile bug during QA (see Risks).

## Files
- `src/app/football/club/[id]/page.tsx` — new route (`generateMetadata` + page)
- `src/app/football/club/[id]/loading.tsx` — new skeleton
- `src/components/soccer/StandingsTable.tsx` — team name is now a `Link` to `/football/club/[id]`, hover underline/colour, layout otherwise untouched

No other files touched — everything the page needed already existed in `queries.ts` /
`provider.ts` / `espn.ts`, so no new `club-queries.ts` was needed (kept minimal impact).

## What renders
- **Club (Real Madrid, id 86, uefa.champions):** crest, "REAL MADRID · RMA" eyebrow, "10th in
  Spanish LALIGA" (ESPN `standing_summary`), gold/white brand accent bar, Champions League
  table line (#10, P1 W1 D0 L0 GD+1 3PTS), form strip (8W-1D-1L, 24-8 GF-GA) with per-match
  chips, 5 upcoming + 1 result via `MatchRow` (live events expander included), empty engine
  state ("Picks land once a match involving this club is priced."), squad in 4 groups with
  "Show all" on Defenders/Midfielders/Forwards, 2 ESPN news items.
- **Qualifying-round club (AEK Athens, id 887):** same shape, full squad (32 players) and 3
  qualifying-tie results (2nd-leg aggregate caption preserved from `MatchRow`) all resolved
  fine — no ESPN 404s in practice for this team.
- **National team (Spain, id 164, `tmb_competition=fifa.world`):** `CountryFlag` in place of
  `TeamCrest` (verified via curl — page HTML contains `"Spain flag"`, not a crest), World Cup
  group standing (#1, 7PTS), squad groups populated, no accent bar (national teams have no
  club colour), "No fixtures scheduled yet" (tournament archived, correct).

## Data gaps observed (not bugs, just noting for whoever reads the data later)
- `TeamRow.country` actually holds ESPN's `location` field for clubs, which for many clubs is
  the club's own short name (e.g. Real Madrid's "country" line reads "REAL MADRID · RMA" —
  duplicates the club name). This is a pre-existing quirk in `espn.ts`/`queries.ts` (both
  off-limits for this task), not something I introduced or fixed.
- `profile.venue` was null for both clubs tested — ESPN's per-league team endpoint didn't
  return it in this case; the header just omits it gracefully (no dash/placeholder shown).

## Risks
- **Found + fixed during QA:** the club-standing-line row (`#10 P1 W1 D0 L0 GD+1 3PTS`) used
  `flex-wrap` and overflowed the viewport at 390px instead of wrapping, clipping "GD"/"PTS" at
  the screen edge. Rebuilt it as a header row + a horizontally-scrollable strip (same pattern
  already used by `RoundNav`/`NewsFilterBar` for tight mobile rows) and re-screenshotted to
  confirm the fix — full content now visible, no page-level horizontal scroll.
  Screenshots: `.../scratchpad/agentB/club-realmadrid-390-fix.png` (after) vs.
  `club-realmadrid-390.png` (before, shows the clip).
- Squad "starters-first" ordering wasn't literally possible — ESPN's team-squad endpoint
  (`SquadPlayer`) carries no starter flag (that only exists on match-lineup data). Sorted by
  jersey number ascending instead, which is the closest sane substitute; flagging in case the
  intent was specifically starter-first.
- `getTeamProfile`/`getTeamSchedule`/`getTeamSquad` degrade to `null`/`[]` on ESPN failure per
  their own try/catch — the page already renders correct empty states for all of those, but
  I only observed the happy path in testing (all three test teams had data).

## Next
qa-test-engineer (Olga) via the code-review gate (Michael).

## Human gate
none
