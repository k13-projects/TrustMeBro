# QA: Competition switcher stays on the current page

**Date:** 2026-09-14
**Branch:** tmb_sep14_v8 (uncommitted change in `src/components/soccer/CompetitionSwitcher.tsx`)
**Scope:** verify the fix for "switching football competitions always dumps you back on `/football`"
**Driver:** GStack Browser (`$B`), `tmb` berth (`CHROMIUM_PROFILE=~/.gstack/berths/tmb`, `BROWSE_PORT=39136`), dev server on `:9136`

## What I actually did vs. reasoned about

Everything below was clicked in a real browser (`$B click`, real navigations via `window.location.assign`), not just requested by URL. I read the diff in `CompetitionSwitcher.tsx` first to know what to target (`destinationFor()`, the `ENTITY_ROUTES` fallback list, dropped search params), then drove the actual switcher tabs.

## Case-by-case verdict

**1. Same-path switch (11 routes) — PASS.** From Champions League, clicked "Süper Lig" on `/football/scoreboard`, `/standings`, `/schedule`, `/picks`, `/value`, `/rates`, `/news`, `/predictions`, `/clubs`, `/glossary`, `/bracket`. Every one stayed on the identical path, `tmb_competition` cookie flipped to `tur.1`, `data-competition` attribute updated, page content genuinely re-rendered for Süper Lig (checked body text on scoreboard, standings, news — headline copy, ledger numbers, and the ticker all say Süper Lig, not stale UCL content). Zero console errors on any of the 11.

**2. Entity-route fallback — PASS, this was the risky one.** From a live Champions League match page (`/football/match/401915393`, Bodo/Glimt v Dortmund) and a live club page (`/football/club/102`, Villarreal), clicking "Süper Lig" landed cleanly on `/football` both times — no 404, no id rendered under the wrong competition, no error. Page title correctly fell back to the generic home title, cookie updated, zero console errors.

**3. All five competitions, both directions — PASS.** Drove tur.1 → uefa.champions, tur.1 → fifa.world, fifa.world → tur.1, uefa.champions → uefa.europa, uefa.europa → uefa.europa.conf, uefa.europa.conf → fifa.world, fifa.world → uefa.champions, all from `/football/value`. Every switch stayed on `/football/value`, cookie/content matched the destination, no console errors. Switching into the archived World Cup rendered its frozen 2026-06-16 ledger with only static-asset GETs in the network log (checked explicitly) — no POST/PUT/PATCH/DELETE, so nothing is written on archive entry.

**4. Bracket empty state — PASS.** Champions League bracket shows the real qualifying-path knockout tree (screenshotted). Switching to Süper Lig replaces it with the designed empty state ("Süper Lig is a single-table league — no knockout ties, no bracket.") — no crash, no leftover UEFA ties bleeding through. Switching back to Champions League restores the full bracket with all ties intact. Screenshots saved locally during the session (not part of this repo).

**5. Search params dropped — PASS.** Applied `?sort=edge` via the Value page's own filter links, confirmed the query string was live (`location.search` = `?sort=edge`), then switched to Süper Lig: landed on `/football/value` with `location.search` empty and no error.

**6. Cookie takes immediately, no stale-render race — PASS.** Because the switcher hard-navigates (`window.location.assign`), every case above already proves this: `data-competition` and body content matched the new competition on first paint after every switch, across all 11 routes and all 5 competitions. No case showed the old competition's content after a switch.

**7. Mobile 320px — PASS, with one selector-only gotcha (not a bug).** At 320px the switcher pills show short labels (`UC`, `UEL`, `UECL`, `SL`, `WC`) instead of full names — that's existing, intentional responsive behavior in the component (`hidden sm:inline` / `sm:hidden` label swap), unrelated to this diff. Clicking the `SL` pill by ref worked correctly: stayed on `/football/scoreboard`, cookie updated, content updated, zero console errors. The row is horizontally scrollable and every competition (including the archive tab) stayed reachable at 320px.

## Console errors

None observed in any of the above — every check ran `console --errors` immediately after the click and got `(no console errors)`.

## Fixes made

None needed. The uncommitted `destinationFor()` logic in `CompetitionSwitcher.tsx` behaves correctly for every case tested, including the entity-route fallback, which was flagged as the most likely to break.

## Handoff

**Status:** DONE
**Summary:** The reported bug (competition switch always landing on `/football`) is fixed and verified in a real browser across 11 same-competition-page routes, 2 entity-route fallbacks, all 5 competitions in both directions (including the archived World Cup), the bracket empty/populated state in both directions, query-param dropping on `/football/value`, and a 320px mobile pass. No console errors anywhere, no unexpected network writes on archive entry. No code changes were needed beyond what was already staged.
**Files:** `src/components/soccer/CompetitionSwitcher.tsx` (unchanged by me — verified as-is), this report at `docs/handoffs/competition-switch-qa_2026-09-14.md`
**Risks:** None found. Note for the record (not a bug): at ≤small breakpoints the switcher's accessible name for each tab is its short label (e.g. "SL") rather than the full competition name — cosmetic/a11y-label detail, pre-existing, not touched by this change.
**Next:** release-engineer (Kate) — this is a single uncommitted file on a feature branch, ready to land per the normal branch → PR → merge flow whenever Kazim wants it shipped.
**Human gate:** None — no destructive/irreversible action, no scope change, nothing client-facing beyond what was already scoped.
