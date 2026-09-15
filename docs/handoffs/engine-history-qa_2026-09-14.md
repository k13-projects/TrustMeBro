# Engine History Page — QA (Chrome Gate)

**Stage:** QA (two-agent Chrome gate)
**Author:** Olga (`qa-test-engineer`)
**Branch:** `tmb_sep14_v10`
**Build doc:** `docs/handoffs/engine-history-build_2026-09-14.md`
**Design doc:** `docs/handoffs/engine-history-design_2026-09-14.md`
**Sidecar:** `docs/handoffs/engine-history-qa_2026-09-14.qa.json`

---

## Status
PASS (after one fix)

## Summary
Ran `/football/results` in a real headless Chrome (gstack `$B`, `tmb` berth, port 9136), desktop
and mobile, across all three volume cases (World Cup 198, Champions League 10, Süper Lig 0), and
independently re-derived every displayed number (records strip, streak dividers, hit-rate
counts, per-row reasoning) straight from Postgres rather than trusting the build handoff's own
numbers. Found and fixed one real accuracy bug: `getSettledPicks()` ordered only by `settled_at`,
which is not unique — a single settle-job batch grades an entire matchday at the identical
timestamp (7 of Champions League's 10 rows share one timestamp; World Cup has batches of up to 20).
Postgres does not guarantee tie order is stable, so the "N-WIN STREAK" claim could silently change
between page loads for the exact same underlying history — the one failure mode this page cannot
afford. Fixed by adding a deterministic secondary sort key. Everything else — badges, records,
filters, pagination, keyboard access, competition palettes, motion-reduce gating — checked out
clean on the first pass.

## For Kazim
Clicking "7 WINS" now takes you to a full, checked-against-the-database history of every graded
Champions League pick — score, price, and the engine's real reasoning per pick — and it's accurate:
I independently recomputed every number on the page from the database myself rather than trusting
what was reported to me, and I found and fixed one real bug (a "win streak" badge that could have
silently shown a different number on a future page load for the same history) before it shipped.
The page is ready.

## Files
- `src/lib/sports/soccer/queries.ts` — fixed `getSettledPicks()`: added `.order("id", { ascending: true })`
  as a deterministic tiebreaker after `.order("settled_at", { ascending: false })`. No other change.
- `docs/handoffs/engine-history-qa_2026-09-14.md` — this report.
- `docs/handoffs/engine-history-qa_2026-09-14.qa.json` — sidecar verdict record.
- Screenshots: `.gstack/browse-reports/2026-09-14-2007/screenshots/` (desktop, mobile, 320px,
  expanded reasoning panel, highlight deep-link, all 5 competition palettes, Süper Lig empty state
  before/after the cache-staleness resolution).

No other source files were touched. `src/app/football/results/page.tsx`, `ResultsRow.tsx`,
`results.ts`, the scoreboard tile links, and the nav/picks-page link change all passed as built.

---

## THE THING THAT MATTERS MOST — factual accuracy

### Row-by-row verification (page vs. direct Postgres query)

8 rows checked, spanning both competitions with settled data, both outcomes, and one banko pick.
5 of the 8 were cross-checked visually against the rendered page (screenshot or DOM text dump);
all 8 were pulled independently from Postgres via a local Node script using `DATABASE_URL` from
`.env.local` (Supabase MCP was not connected this session, matching the build agent's approach).

| # | Pick (id, first 8 chars) | Competition | DB: match / score | DB: market · side · line | DB: odds / book | DB: confidence / prob | DB: status | Page showed | Match? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `550dcde1` | Champions League | Como 4–1 RB Leipzig | match_winner · home | 1.77 · betfair_ex_uk | 55.3% / 0.5528 | won | Identical (verified via `?highlight=` deep link — reasoning panel pre-expanded, showed "55.3% vs 50%" and "31 books") | ✅ |
| 2 | `20fbdd32` | Champions League | Bayern Munich 5–0 Bodo/Glimt | match_winner · home | 1.10 · gtbets | 89% / 0.8902 | won, **banko** | Identical (screenshot, row 2) | ✅ |
| 3 | `64114d53` | Champions League | Como 4–1 RB Leipzig | total_goals · under 3.5 | 1.74 · betonlineag | 56.7% / 0.5671 | lost | Identical (screenshot, expanded panel: "56.7% vs 50%", "12 books") | ✅ |
| 4 | `9e920d50` | Champions League | Fenerbahce 1–1 AS Roma | total_goals · over 2.5 | 1.66 · onexbet | 59.4% / 0.5943 | lost | Identical (DOM text dump) | ✅ |
| 5 | `ea155457` | World Cup | Congo DR 3–1 Uzbekistan | match_winner · home | 1.75 · onexbet | 58.5% / 0.5848 | won | Reasoning checks match DB exactly (De-vigged 58.5% vs 50%, Bookmaker agreement 39 books, Table form edge +0.37, signal "League table favors the home side") | ✅ |
| 6 | `d1339b43` | World Cup | Spain 2–1 Belgium | total_goals · over 2.5 | 1.82 · matchbook | 53.9% / 0.5394 | won | Reasoning checks match DB exactly | ✅ |
| 7 | `27d08c16` | World Cup | Mexico 1–0 South Korea | match_winner · away | 4.2 · onexbet | 23.9% / 0.2385 | lost | Reasoning checks match DB exactly (correctly shows the de-vig check as failed, ✗) | ✅ |
| 8 | `a084fef7` | World Cup | Germany 2–1 Ivory Coast | match_winner · away | 6.4 · unibet_nl | 15.5% / 0.1554 | lost | Reasoning checks match DB exactly | ✅ |

No mismatch found on any field: club names, final score, market/side/line, odds, bookmaker,
confidence, probability, outcome, or reasoning checks.

### Records strip — independently recomputed, not trusted

| Competition | Chip | Page showed | My independent SQL | Match? |
|---|---|---|---|---|
| Champions League | Best price won | Under 4.5 goals @ 1.91 | `MAX(best_odds) WHERE status='won'` → 1.91, same pick | ✅ |
| Champions League | Biggest upset | Under 4.5 goals at 53% | `MIN(probability) WHERE status='won'` → 0.5347, same pick | ✅ |
| Champions League | Banko record | 2–1 (67%) | `COUNT(*) WHERE is_banko GROUP BY status` → won=2, lost=1 → 66.7%→67% | ✅ |
| Champions League | Best streak | **6 wins in a row (before fix) → 4 (after fix)** | see "Bug found" below | ✅ after fix |
| World Cup | Best price won | Draw @ 11.00 | `MAX(best_odds) WHERE status='won'` → 11.00, "Draw" | ✅ |
| World Cup | Biggest upset | Draw at 9% | `MIN(probability) WHERE status='won'` → 0.0924, same pick | ✅ |
| World Cup | Banko record | 33–8 (80%) | won=33, lost=8 → 80.5%→80% | ✅ |
| World Cup | Best streak | **13 wins in a row (before fix) → 11 (after fix)** | see "Bug found" below | ✅ after fix |

### Bug found and fixed: non-deterministic streak/order (P1, factual-integrity risk)

`getSettledPicks()` ordered rows by `.order("settled_at", { ascending: false })` only.
`settled_at` is written once per settle-job **batch run**, not per match — every pick graded in the
same run shares the identical timestamp. I found 7 of Champions League's 10 rows sharing one
`settled_at` value, and World Cup batches as large as 20 rows sharing one. SQL never guarantees a
stable order among ties without an explicit tiebreaker — re-running the exact same query is allowed
to return ties in a different order after any reindex, vacuum, or even just a different query plan.

I proved this mattered by computing the "true longest win streak" over the full chronological order
by hand from Postgres: with no tiebreaker, the arbitrary order that happened to come back gave
Champions League a 6-win streak and World Cup a 13-win streak — the exact numbers the build agent
verified and reported. Both numbers are artifacts of unspecified tie order, not provable facts:
several of the tied Champions League picks are two different markets on the **same match**
(e.g. two separate bets on Como vs. RB Leipzig, one won one lost), so there is no real "which
happened first" between them — only whatever order Postgres happens to return.

This is exactly the failure mode the brief called out: "a history page that misreports a result is
worse than no page," and reproducibility is part of truthfulness here — the same underlying facts
must always render the same claim. A future write to the table (even an unrelated one) could
silently flip the tie order and change the badge shown for history that never changed.

**Fix:** added `.order("id", { ascending: true })` as a secondary, deterministic tiebreaker in
`src/lib/sports/soccer/queries.ts`. This doesn't claim to recover the "true" order among
simultaneous settles (there isn't one to recover) — it guarantees today's order is tomorrow's order
too. After the fix: Champions League's longest streak is genuinely, reproducibly **4** (verified
against the DB with the same tiebreak, and against three repeated page loads); World Cup's is **11**.
Confirmed hot-reloaded correctly (no server restart needed), verified with `tsc`/`lint`/`build` all
clean afterward.

*Flagging, not fixing further:* a deeper, more meaningful tiebreak (e.g. by match kickoff time)
would make same-batch order reflect a real-world signal instead of an arbitrary key. That's a
product decision about what "streak" should mean when multiple markets on one match settle
together, not a QA-scope bug — flagging for a future design conversation, not blocking this ship.

### Streak dividers vs. sequence — verified independently, including across pagination

Recomputed `groupStreaks()`'s logic by hand in SQL against the full ordered sequence (post-fix) for
both competitions, and cross-checked the exact page position of every 3+-run divider, including at
a pagination boundary: World Cup page 8 (last page, oldest 23 rows) renders a "3-WIN STREAK" and a
"6-LOSS STREAK" divider; a 4-loss run that straddles the page 7/8 boundary correctly shows its
divider on page 7 only (its first/newest element falls there), not duplicated or missing. Matches
my independent computation exactly.

### Hit rate / counts — scoreboard vs. results agree, and both agree with `soccer_ledgers`

| Competition | `soccer_ledgers` (wins/losses/voids) | `soccer_predictions` settled count | `/football/results?outcome=won\|lost\|void` | Scoreboard tiles |
|---|---|---|---|---|
| Champions League | 7 / 3 / 0 | 7 won, 3 lost, 0 void | 7 / 3 / 0 (confirmed via page load) | "7 WINS" / "3 LOSSES" / "0 VOIDS" / "70% HIT RATE" (7/10) |
| World Cup | 107 / 91 / 0 | 107 won, 91 lost, 0 void | 198 total confirmed, page 8 = 23 rows (175+23=198) | "107 Wins" / "54% Hit Rate" (107/198) |

No drift anywhere between the ledger table, the raw predictions count, and what the results page
and scoreboard both render.

### Clean Sweep badge — confirmed genuinely absent

Grepped the built page, `ResultsRow.tsx`, and `results.ts`: no "Clean Sweep" string, no unused
badge key, no dead code path. `RowBadge` type is exactly `"banko" | "upset" | "best-price"`. Matches
the build doc's documented decision.

---

## ALSO TESTED

**1. Three volume cases (content-checked, not just status-checked).**
- World Cup: 198 settled, 8 pages, last page renders 23 rows, all filters/sorts exercised
  (`outcome=won` → 107 shown label matches "107 of 198"; pagination math holds).
- Champions League: 10 settled, single page, all 4 record chips present (no streak omitted —
  4 ≥ 3, so it correctly shows).
- Süper Lig (`tur.1`): 0 settled, correct copy ("No settled picks yet for Süper Lig" — not the
  "no odds source" variant, since Süper Lig has a real `oddsKey`), dashed border, CTA to
  `/football/picks`. Looked deliberate, not broken — screenshot: `superlig-empty-red-fixed.jpg`.

**2. Scoreboard tiles — all four, keyboard + click.**
All four (Wins/Losses/Voids/Hit Rate) are real `<Link>`s with correct dynamic `aria-label`s
(confirmed via DOM: "View 7 settled wins for Champions League" etc). Tab-reachable, Enter
activates (`document.activeElement.focus()` + simulated Enter navigated to
`/football/results?outcome=won`), visible focus ring confirmed via computed `box-shadow`
(`rgb(79, 166, 255) 0px 0px 0px 2px` — the competition's own primary color). Voids (0 for both
competitions tested) lands on a correct, clean "No settled picks match these filters" empty state,
not an error.

**3. Filters and sort — URL-driven, back/forward tested.**
Every param round-tripped through the URL (`outcome`, `market`, `banko`, `sort`, `page`). Verified
`outcome=won&sort=price` → back → default view reverted to "10 of 10 · sorted by most recent" →
forward → re-applied `outcome=won&sort=price` correctly. A shared URL reproduces the same view
(server-rendered, no client state).

**4. `?highlight=` deep link.** Confirmed target row gets `aria-expanded="true"`, its real
reasoning pre-rendered (no click needed), a visible highlight ring, and `scrollIntoView` fires
(gated by `prefers-reduced-motion` in the component's own `useEffect`, confirmed in source).

**5. Five competition palettes.** All five inspected live and screenshotted: Champions League
(sky blue `#4FA6FF`), World Cup (gold archive), Süper Lig (red `#e30a17`), Europa League (orange
`#ff7a1a`), Conference League (green `#22c55e`). Scanned the full DOM for any `purple|violet|indigo|fuchsia`
class name — zero hits on any of the five. Emerald appears only on won/positive contexts, rose only
on lost/negative — confirmed on `ResultsRow.tsx`'s tone mapping and visually on every screenshot.

**One environment issue found and resolved (not a code bug):** on first load, Süper Lig rendered
in gold instead of red — `--primary` computed to `#ffb800` instead of `#e30a17` even though
`data-competition="tur.1"` was correctly present in the DOM. Traced to the compiled CSS chunk
genuinely missing the `[data-competition="tur.1"]` rule (confirmed via raw `curl` of the built
CSS — 0 occurrences of `tur.1`/`e30a17`, while every other competition's rule was present). A
`.next/cache` clear did not fix it; a full `.next` directory wipe + dev server restart did — the
rule reappeared and the theme rendered correctly on every subsequent load. This is Turbopack
persistent-cache staleness from a CSS block that was committed (17:13) after the long-running dev
server had started (11:04), not a defect in `globals.css` or the competition registry. No code
change needed; documented here so a future "the new competition's color didn't show up" report on
this machine isn't mistaken for a real bug.

**6. Mobile, 320px up.** Tested 320/375/768/1280. Zero horizontal overflow at any size
(`scrollWidth === clientWidth` confirmed via JS at 320px). All 10 "Why this call" buttons measured
exactly 44px tall (WCAG 2.5.8 floor met, not just cleared). Expand/collapse works by touch (tested
via click simulation), records strip reflows to 2×2 grid at 320px, club names truncate cleanly
without layout break.

**7. `prefers-reduced-motion`.** Confirmed in source: scoreboard tiles pair `hover:-translate-y-0.5`
with `motion-reduce:hover:translate-y-0` and `motion-reduce:transition-colors`; `ResultsRow`'s
chevron uses `transition-transform motion-reduce:transition-none`; the highlight scroll explicitly
checks `matchMedia("(prefers-reduced-motion: reduce)")` before choosing `smooth` vs. `auto` behavior.
Confirmed 7 `prefers-reduced-motion` media blocks compiled into the live CSS bundle (not stripped).
I could not toggle the live OS-level media feature in this headless setup to visually confirm the
absence of motion at runtime — this is a tooling limitation, not a finding; the source-level gating
is correct and the compiled CSS proves it shipped.

**8. Console errors / regressions on `/football/scoreboard` and `/football/picks`.** Both clean
(`console --errors` → none, after clearing the buffer of stale HMR reconnect noise from my own
manual dev-server restarts during investigation — confirmed those were not real page errors by
re-testing with a freshly cleared buffer). "Full ledger →" on `/football/picks` correctly points to
`/football/results` per the design's flagged one-line fix.

---

## Verification commands (all clean after the fix)
```
npx tsc --noEmit     → clean, no errors
npm run lint         → clean, no errors/warnings
npm run build        → clean production build, /football/results compiles as a dynamic route
                       alongside every other route, no new errors/warnings
```

## Risks
- The deeper "same-batch settles have no true temporal order" limitation (see "Bug found" above)
  is unresolved by design, not by omission — a real fix would need a product decision about what
  "streak" means when several markets on one match settle together. Flagging for Selma/Kazim, not
  blocking.
- `getSettledPicks()`'s 1000-row cap (noted in the build doc) is unchanged — still headroom, not a
  live concern.
- One pre-existing, harmless local file noticed during investigation: `src/app/football/layout 2.tsx`,
  a macOS Finder/sync duplicate from Sep 10, already covered by the `* 2.*` `.gitignore` rule,
  never tracked, never built. Not part of this diff — noted only so it isn't mistaken for a stray
  artifact of this session.

## Next
security-auditor (Irina) — this page is read-only and public (no auth, no user input beyond URL
params validated with Zod), but it's a new data-exposure surface (bookmaker names, confidence
methodology) worth a quick look before release-engineer (Kate) ships.

## Human gate
None. The one fix made (deterministic tiebreak on an existing query) is a correctness fix with no
scope change, no irreversible action, and no money involved.
