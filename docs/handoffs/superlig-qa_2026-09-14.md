# Süper Lig — Chrome QA Gate

**Author:** Olga (qa-test-engineer) · **Date:** 2026-09-14 · **Branch:** `tmb_sep14_v8`

Two-agent Chrome QA gate on top of Selma's scope (`superlig-scope_2026-09-14.md`) and
Natalia's build (`superlig-build_2026-09-14.md`). Drove the live dev server
(`localhost:9136`) through GStack's headless browser (`$B` — Aside wasn't installed on
this machine, fell back per the browse skill), desktop + mobile, all 5 competitions.
Found bugs in the same "wrong data rendered as real" family the scope doc warned about
— fixed everything found, re-tested, re-verified `tsc`/`lint`/`build` clean.

**Verdict: PASS.** Both P0 items (Rounds, Bracket) hold. Six additional bugs of the same
species were found and fixed (not in either prior doc). One pre-existing, unrelated
mobile overflow bug was found on Europa League's home page and is called out separately,
not fixed (out of scope for this task, not caused by this build).

---

## The two P0 items

### 1. Rounds — PASS

Süper Lig's 45 backfilled fixtures render as **Matchday 1–6**, not one lumped round.
Verified every matchday's date range and match count, not just that labels exist:

| Matchday | Date range | Matches |
|---|---|---|
| 1 | Aug 14–16 | 8 |
| 2 | Aug 17–23 | 9 |
| 3 | Aug 24–30 | 8 |
| 4 | Aug 31–Sep 6 | 9 |
| 5 | Sep 7–13 | **10** |
| 6 | Sep 14 (today, live) | 1 |

Total 45, matching the backfill count exactly. Matchday 5's 10 (instead of the usual 9)
is the accepted Monday-boundary edge case the scope doc flagged in §3 — not a bug,
expected and documented.

### 2. Bracket — PASS

`/football/bracket` for Süper Lig renders a clean empty state, zero fabricated ties —
confirmed by reading the actual DOM/text, not just a 200. Screenshot:
`.gstack/browse-reports/2026-09-14-1339-superlig-qa/screenshots/bracket-superlig.jpg`.

Fixed while here: the intro copy above the empty state still said "Every knockout tie,
both legs and the aggregate... the road to the final from February" for Süper Lig — a
league with no knockout stage at all (flagged as a known P1 gap in Natalia's build
handoff). Now reads "Süper Lig is a single-table league — no knockout ties, no bracket,"
gated on the new `qualificationZones` registry flag (see below) so it stays correct for
every current and future single-table competition, not just this one.

### Regression: UCL / UEL / UECL / World Cup — PASS

Switched to all four other competitions and re-checked Rounds + Bracket:

- **UCL/UEL/UECL**: "League Phase" round grouping, qualifying-tie counts (14/6/26
  ties respectively), and the full knockout-tie copy all render exactly as before —
  confirmed by reading rendered tie counts and copy text, not just status codes.
- **World Cup 2026 archive**: rounds unchanged (`group stage`, Round of 32 → Final all
  present), bracket unchanged (Round of 32 shows 16 ties as expected). Scoreboard reads
  **107 wins / 91 losses = 198 settled, +16 net units** — the exact frozen totals from
  the project record. The `group-stage` exclusion Natalia added to `groupIntoRounds()`
  held. No regression.

---

## Six additional bugs found and fixed (same "wrong data as real" family)

None of these were in either prior handoff. All confirmed live in the browser first,
then fixed, then re-verified live.

1. **Standings mislabeled with UEFA-only qualification zones.** The home page and
   `/football/standings` hardcoded `format="league-phase"` for any single table over 8
   rows — true for Süper Lig too (18 clubs, one table). Result: Süper Lig's top 8 were
   painted with a "ROUND OF 16 · PLAY-OFFS · OUT" legend, headed "Round of 16 places,"
   and the page literally said **"One 36-team table... the bottom twelve go out of
   Europe"** for an 18-club domestic league. This is exactly the "fabricated
   qualification structure" failure mode the scope doc flagged for Bracket, just in a
   different component nobody had checked. **Fix:** added `qualificationZones: boolean`
   to the competition registry (true for the 3 UEFA competitions, false for Süper Lig
   and the World Cup), threaded through `StandingsTable`, both standings call sites, and
   the home page's "Top Eight" trailing link (now dynamically "Full 18-team table →").
   Verified UCL's zone legend and exact copy are byte-identical after the change.

2. **Same bug, second location.** `HomeMovers.tsx` (the "Where they stand" table-movement
   widget shown in "between matchdays" mode) had the identical hardcoded "top eight go
   straight to the Round of 16; ninth to twenty-fourth play off" copy and an "On the
   bubble" zone for ranks 9–12. Süper Lig hits this exact component whenever it has an
   idle week. **Fix:** same `qualificationZones` flag gates the copy and the bubble
   group; Süper Lig gets neutral copy and no bubble group. **Not visually exercised** —
   Süper Lig is mid-matchday all through this test, so it never actually entered
   "between matchdays" mode live. Verified by code/type-check and by confirming UCL's
   home (which is between matchdays right now) renders unchanged.

3. **`RoundNav` schedule strip said "League Phase" for a domestic league.** The
   `/football/schedule` round-tab strip hardcoded the group heading "League Phase"
   regardless of competition. Fixed by passing the competition's own `phaseLabel`
   ("Regular Season" for Süper Lig); UEFA competitions' `phaseLabel` is literally
   "League Phase" already, so no visual change there — confirmed live.

4. **Four "prices are coming" false promises.** `/football/value`, `/football/picks`,
   `/football/rates`, and `/football/scoreboard` all had empty-state copy written for
   "no prices *yet*" that structurally implied odds/picks would show up later — false
   for a competition with `oddsKey: null`. Natalia's build handoff had already flagged
   the Value page instance as a known P1 gap; the other three weren't caught. Fixed all
   four to say plainly there's no bookmaker odds for this competition, gated on
   `oddsKey === null` so nothing changes for the odds-bearing competitions (confirmed:
   UCL's copy on all four pages is unchanged).

   Bonus catch in `/football/scoreboard`: its empty-state copy literally hardcoded **"the
   first Champions League picks grade after the next matchday"** regardless of which
   competition was active — a pre-existing bug (not introduced today, would have misnamed
   the competition for UEL/UECL too) that the new all-4th-competition traffic made visible.
   Fixed to use the active competition's own label.

5. **Cmd-K search silently fails on the real Turkish spelling of any club with a
   dotless ı.** Scope doc §9 flagged this as a real but unconfirmed, non-blocking gap.
   Tested live: searching **"Beşiktaş"** and **"Besiktas"** both work (ş folds correctly
   via NFKD). Searching **"Kasımpaşa"** (dotless ı) returned **zero results** — confirmed
   root cause: `normalizeTeamName()` lowercases then strips NFKD diacritics, but ı
   (U+0131) has no NFKD decomposition, so "Kasımpaşa" folds to "kasımpasa" while
   "Kasimpasa" folds to "kasimpasa" — never equal. This is the same normalizer Cmd-K
   search runs the query through (`canonicalTeamName` in `team-match.ts`), so the gap the
   scope doc filed under "not urgent until odds land" was already live in search today.
   **Fix:** added `.replace(/ı/g, "i")` to `normalizeTeamName()` with a comment explaining
   why. Re-tested: "Kasımpaşa" now returns Kasimpasa correctly; "Besiktas"/"Beşiktaş"
   unaffected; ran a standalone regression check against `Atlético Madrid`, `İstanbul
   Başakşehir`, `Paris Saint-Germain`, `Real Madrid CF` — all fold identically to before.

6. **Competition switcher overflows the page at 320px — a real regression from adding
   the 5th tab.** `document.documentElement.scrollWidth` was 330px against a 320px
   viewport (10px page-level horizontal leak) on the Süper Lig-active football home.
   Root cause: `CompetitionSwitcher.tsx` renders all `COMPETITION_ORDER` tabs in a plain
   `inline-flex` row with no scroll container — fine at 4 tabs, but a 5th tab (Süper Lig)
   pushed the row wider than a 320px screen has room for, and `flex-wrap` on the parent
   can't wrap *inside* the switcher's own single flex item. Confirmed this is a straight
   regression from the tab count, not present before. **Fix:** made the switcher itself
   horizontally scrollable (`overflow-x-auto`, hidden scrollbar, `min-w-0 max-w-full`) —
   same pattern already used by `RoundNav`'s round strip elsewhere in this codebase.
   Re-verified: `scrollWidth` now exactly 320px at 320px viewport; swiped the switcher
   programmatically and confirmed the World Cup tab (previously clipped) scrolls into
   view and stays clickable; desktop (1440px) screenshot confirms zero visual change —
   all 5 tabs still render on one row with full labels, nothing scrolls.

Full mobile matrix re-checked after the fix — **zero horizontal overflow** at 320, 375,
390, 768, 1024, 1280, 1920, and the 812×375 landscape case, across `/football`,
`/standings`, `/schedule`, `/bracket`, `/club/[id]`, `/match/[id]`, `/news`, `/value`,
`/picks`, `/predictions`, `/clubs` with Süper Lig active.

---

## Everything else tested, area by area

| Area | Verdict | How verified |
|---|---|---|
| `/football` home (matchday-slate mode, live today) | PASS | Read live DOM/screenshot, not status-only |
| `/football/schedule` MD1–6 | PASS | Read each matchday's date range + played count |
| `/football/standings` (18 clubs) | PASS | Screenshot, full club list read, matches known roster (Amed SFK/Erzurum BB/Samsunspor in, no Antalyaspor/Sivasspor/Kayserispor/Karagümrük) |
| `/football/club/[id]` (Besiktas) | PASS | Screenshot + full text: schedule, results (incl. real UEFA 2-leg ties — correctly NOT affected by the Bracket bug since those are real UEFA legs), squad, news, engine panel empty-state |
| `/football/match/[id]` (Gaziantep FK v Fenerbahce) | PASS | Screenshot + full text: live commentary, stats, lineups, "Call the score," all odds-panels gracefully empty |
| `/football/value` | PASS (after fix) | Read text before/after fix |
| `/football/picks` | PASS (after fix) | Read text before/after fix |
| `/football/rates` | PASS (after fix) | Read text before/after fix |
| `/football/scoreboard` | PASS (after fix) | Read text before/after fix |
| `/football/predictions` ("Call the Scores") | PASS | Screenshot (mobile) + text: fully functional, no odds dependency |
| `/football/news` | PASS | Full-page screenshot + text dump of all 60 items; spot-checked tags are plausible; confirmed the "Özgür **Kocaeli**" columnist byline is still untagged (the fix from the build session holds) |
| `/football/clubs`, `/football/glossary` | PASS (status + no console errors) | Not deep-content-checked beyond that — low risk, no Süper Lig-specific logic in either |
| Competition switcher (all 5, both directions) | PASS (after fix) | Clicked/cookie-switched through all 5; screenshots at each; red theme applies and fully reverts (confirmed UCL screenshot post-switch has zero red bleed) |
| Turkish diacritics in UI | PASS | Read rendered text directly: "Türkiye," "Şükrü Saracoğlu Stadium," "Kerem Aktürkoğlu," "Beşiktaş" (in news headlines) all render correctly, no mojibake, anywhere checked |
| Cmd-K search: "Besiktas" / "Beşiktaş" | PASS | Typed both, read results live |
| Cmd-K search: dotless-ı gap | **Found + fixed** (see #5 above) | |
| Console errors, Süper Lig pages | Clean | `console --errors` on every page tested returned `[]` |
| Pre-existing `after()`/`cookies()` warning | Confirmed pre-existing | Both `after()` call sites (`football/page.tsx:94`, `football/schedule/page.tsx:45`) predate today's work per `git log` — not something I could reproduce in the browser console (it's a server-side dev-log warning, not a client console error), but the code provenance confirms it isn't new |

---

## Found, NOT fixed — pre-existing, out of scope

**Europa League's home page overflows ~49px horizontally at 320px viewport** —
`document.documentElement.scrollWidth` = 369 against a 320px innerWidth, reproducible
every time. Root-caused to the "Ask Bro" chat drawer (`<aside class="fixed ... w-full
sm:w-[440px] ... translate-x-full">`): its closed-state offset (Tailwind v4's `translate`
property, not legacy `transform`) is apparently still counted toward the page's
scrollable-overflow region in this specific case, though the same element in the same
closed state does **not** cause overflow on the Süper Lig, Champions League, Conference
League, or World Cup home pages, or on any of Europa League's own subpages
(`/schedule`, `/bracket`, `/standings` all measured 0 overflow). This is not caused by
today's Süper Lig work — the chat drawer is identical global markup, not competition
code, and the bug reproduces on Europa League, an existing competition untouched by this
build. Flagging for whoever next touches the chat drawer or does a full-site fitcheck;
not fixed here since it's unrelated to Süper Lig and the root cause (a `position:fixed` +
`translate` interaction that only manifests on one specific page/competition
combination) needs isolated investigation, not a Süper Lig-gate-scoped fix.

---

## Files changed (beyond Natalia's build)

- `src/lib/sports/soccer/competitions.ts` — added `qualificationZones: boolean` to
  `CompetitionMeta` (true for the 3 UEFA competitions, false for Süper Lig + World Cup).
- `src/components/soccer/StandingsTable.tsx` — `qualificationZones` prop gates the zone
  legend, zone bars, and the phase-cut border; defaults `false`.
- `src/app/football/standings/page.tsx`, `src/app/football/page.tsx` — pass
  `qualificationZones`; dynamic team-count copy instead of hardcoded "36-team."
- `src/components/soccer/HomeMovers.tsx` — `qualificationZones` prop gates the Round-of-16
  copy and the "on the bubble" group.
- `src/components/soccer/RoundNav.tsx`, `src/app/football/schedule/page.tsx` —
  `leagueLabel` prop (defaults to "League Phase") instead of a hardcoded string.
- `src/app/football/bracket/page.tsx` — intro + empty-state copy now competition-aware.
- `src/app/football/value/page.tsx`, `picks/page.tsx`, `rates/page.tsx`,
  `scoreboard/page.tsx` — empty-state copy gated on `oddsKey === null`; scoreboard's
  competition name is no longer hardcoded to "Champions League."
- `src/lib/sports/soccer/team-match.ts` — `normalizeTeamName()` now folds Turkish
  dotless ı to ASCII i.
- `src/components/soccer/CompetitionSwitcher.tsx` — switcher is horizontally scrollable
  (`overflow-x-auto`, hidden scrollbar) instead of overflowing the page at narrow widths.
- `.claude/settings.json` — claimed the `tmb` GStack berth (`CHROMIUM_PROFILE`,
  `BROWSE_PORT`) per house convention, since another session's `next dev` was already
  running against this repo.

All verified with `npx tsc --noEmit`, `npm run lint`, and `npm run build` — clean after
every change, re-run at the end of the session.

## Screenshots

`.gstack/browse-reports/2026-09-14-1339-superlig-qa/screenshots/` — desktop home
(before/after standings fix), mobile 320 home (before/after switcher fix + scrolled
switcher), standings (18 clubs), club page, match page, bracket empty state, news feed,
Cmd-K search fixed, mobile predictions/leaderboard, UCL regression screenshots
(desktop switcher, standings zone legend), World Cup archive scoreboard (198 settled /
+16 confirming the frozen record).

---

## Status      PASS
## Summary     Süper Lig QA gate passes. Both named P0s (Rounds, Bracket) hold under live browser testing and survive regression across all four other competitions, including the World Cup archive's exact 198-graded-pick/+16-unit frozen record. Found and fixed six more instances of the same "wrong data / misleading data presented as real" bug family that neither the scope nor build docs caught — mislabeled UEFA-only qualification zones bleeding onto Süper Lig's standings in two components, hardcoded "League Phase" copy, four "odds coming soon" false promises (one of which also had a hardcoded wrong competition name), a real Cmd-K search failure on Turkish dotless-ı club names, and a genuine 320px horizontal-overflow regression in the competition switcher caused by adding a 5th tab. One unrelated, pre-existing mobile overflow bug on Europa League's home page was found and is reported, not fixed (out of scope, not caused by this build). `tsc`/`lint`/`build` all clean after every fix.
## For Kazim   QA on Süper Lig passed after fixing six real bugs found during testing — none of them invented data like the Bracket bug the build already prevented, but several would have shown Süper Lig fans nonsense like "one 36-team table" and "Round of 16" zones on an 18-team domestic league, or a search box that fails on real Turkish spellings, or a switcher that scrolls the whole page sideways on a phone. All fixed and re-tested. One unrelated pre-existing mobile bug found on the Europa League page, reported but not touched (not this feature's fault).
## Files       docs/handoffs/superlig-qa_2026-09-14.md (this report); code changes listed above, all on `tmb_sep14_v8`, uncommitted per the task brief (release-engineer owns commit/PR).
## Risks       The Europa League home-page overflow (see "Found, NOT fixed" above) should get picked up by a full-site fitcheck or whoever next touches the chat drawer. The accepted Monday-boundary round-mislabeling limitation (scope §3) is unchanged and will keep showing up once a season; already documented, not a surprise. `HomeMovers.tsx`'s qualificationZones fix was verified by code/type-check but not visually exercised for Süper Lig since it's mid-matchday all through this session — worth a quick visual spot-check the next time Süper Lig has an idle week.
## Next        security-auditor (Irina) or release-engineer (Kate) per the standing pipeline — Natalia's build handoff named code-review (Michael) before release; this QA pass doesn't supersede that, just clears the Chrome gate.
## Human gate  none — all fixes were bug corrections matching already-approved scope/behavior (accurate copy, working search, no page-level scroll), nothing here changes product scope or needs a judgment call from Kazim.
