# Engine History Page — Design Proposal

**Stage:** design (P2 — feature UX before build)
**Author:** designer
**Status:** proposal, not built
**Next:** frontend-engineer implements; qa-test-engineer runs the Chrome gate before ship

---

## 1. Where it lives

**`/football/results`.**

- `/results` (root) is already the NBA settled-bets ledger — collision if reused.
- `/history` is already the signed-in user's own tracked plays — different concept (their bets, not the engine's).
- `/football/results` mirrors the NBA nav's existing `{ href: "/results", label: "Results" }` pattern one-for-one, so the two sports read the same way in the nav.
- Nav: add to the Football → **Picks** group in `src/lib/sports/registry.ts`, right after Scoreboard:
  `{ href: "/football/results", label: "Results" }`
- The "Recently graded → Full ledger" link on `/football/picks` (`src/app/football/picks/page.tsx`) currently points at `/football/scoreboard`. Retarget it to `/football/results` once this ships — one-line fix, flagging so it isn't missed, not asking anyone to build it now.

Page is competition-scoped exactly like `/football/scoreboard` and `/football/value` — reads `activeCompetition()`, themed by whichever `--primary` that competition has re-tokened. The `CompetitionBar` switcher at the top of every `/football/*` page already lets a visitor jump between World Cup / Champions League / Europa / Conference / Süper Lig, so this page never needs its own competition switcher.

---

## 2. Tiles → page (Scoreboard changes)

On `/football/scoreboard`, the four `<Stat>` tiles change from static `<div>`s to real links:

| Tile | Behavior |
|---|---|
| **Wins** | `Link` → `/football/results?outcome=won` |
| **Losses** | `Link` → `/football/results?outcome=lost` |
| **Voids** | `Link` → `/football/results?outcome=void` |
| **Hit Rate** | `Link` → `/football/results` (no filter — hit rate is a ratio over everything, not a category, so "show me how we got there" means the full unfiltered list) |

**Hover (desktop):** border brightens to `border-primary/60`, tile lifts `-translate-y-0.5`, a small chevron (`lucide-react` `ArrowRight`, 12px) fades in next to the label — same treatment already used for pick-card hover per `UI_RENOVATION.md`. Wrapped in `@media (prefers-reduced-motion: reduce)` → transform disabled, only the border/color change survives (no lift).

**Click:** navigates straight to the filtered page — no modal, no client-side interstitial. These are plain `<Link>`s so they work with JS off, keyboard-reachable, and bookmarkable, matching the `FilterBar` philosophy already in this codebase.

**Focus (keyboard):** `focus-visible:ring-2 ring-primary` — the tiles becoming links means they now need a real focus state; they don't have one today as plain `<div>`s.

Each tile gets `aria-label="View 7 settled wins for Champions League"` (dynamic count + competition) so a screen reader announces the destination, not just "Wins".

---

## 3. The row

This is the core design problem: one settled pick carries a lot — date, two clubs, final score, our call, the price, the book, our confidence, the outcome. Three tiers:

**Primary (always visible, collapsed row):**
- Outcome pill (reuses the exact `SettledPickRow` treatment already in `src/components/soccer/SettledPickRow.tsx` — `Check`/`X`/`Minus` icon, emerald/rose/neutral ring, "Won"/"Lost"/"Void" text)
- Two crests + club names, final score bolded on the winner's side
- Our call, in words (`sideLabel(market, side, line, home, away)` — already exists, e.g. "Real Madrid −0.5" reads as "Real Madrid to win", "Over 2.5 Goals")
- Price taken + confidence, right-aligned (`best_odds.toFixed(2)` / `confidence%`) — identical to `SettledPickRow`'s right column

**Secondary (small, muted, same row — not hidden):**
- Date (relative-ish: "Sep 12" not a full timestamp — kickoffs already render via `<LocalTime>` elsewhere, reuse it)
- Bookmaker name, lowercased brand-style chip (e.g. `onexbet`) — new field this row needs (see §7)
- A ★ chip if `is_banko` — gold, `text-primary`, reusing the 🔒/BANKO language already on `/football/picks`

**Tertiary (behind a tap/click, collapsed by default):**
- The `reasoning.checks[]` breakdown — this is the one thing no other betting-history page shows. Each check renders as: label · our value vs. target · pass/fail icon · weight as a thin bar (visually similar to `EngineBreakdown`'s existing hit-rate bar, reused pattern not reinvented). E.g.:
  ```
  De-vigged consensus probability     58% vs 50%    ✓   weight ▓▓▓▓▓▓░░░░
  Bookmaker agreement                 41 books       ✓   weight ▓▓▓░░░░░░░
  Table form edge                     +0.8           ✗   weight ▓▓░░░░░░░░
  ```
- `reasoning.signals[]` below it, only if non-empty (most rows have none today — hide the section entirely rather than show "No signals," which is the exact kind of claim-nothing-you-can't-back-up UI the house just spent a day removing).
- Expand affordance: a full-width `<button>` (not just a chevron icon — the whole row secondary line is the tap target on mobile, ≥44px tall) with `aria-expanded`, same interaction pattern as `Term.tsx`'s tooltip button but persistent (click toggles, not hover, since the payload is bigger than a tooltip).

### Desktop wireframe (≥768px)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ✓ WON   [crest] Real Madrid  2–1  Man City [crest]     Real Madrid to Win  │
│         Sep 12 · onexbet · ★ BANKO                          1.85  ·  62%   │
│                                                        [ ▾ Why this call ] │
├───────────────────────────────────────────────────────────────────────────┤
│  ▾ expanded:                                                              │
│    De-vigged consensus probability   58% vs 50%   ✓   ▓▓▓▓▓▓░░░░          │
│    Bookmaker agreement               41 books      ✓   ▓▓▓░░░░░░░          │
│    Table form edge                   +0.8          ✗   ▓▓░░░░░░░░          │
└───────────────────────────────────────────────────────────────────────────┘
```

### Mobile wireframe (320–428px) — two-line stack, no horizontal scroll

```
┌──────────────────────────────────┐
│ ✓ WON                    1.85    │
│ [crest] Real Madrid 2–1 Man City  │
│ [crest]        Real Madrid to Win │
│ Sep 12 · onexbet · ★      62%     │
│ [   ▾ Why this call        ]     │
└──────────────────────────────────┘
```
Crests shrink to the same `sm` size already used in `MatchBanner`'s compact mode. Price/confidence move to a stacked pair on the right at the top line (price) and secondary line (confidence) instead of one right column, because at 320px a three-column layout (clubs / score / price+confidence) doesn't fit without truncating a club name — this codebase already truncates names in `SettledPickRow` (`truncate` class), same technique here.

---

## 4. Creative layer — the badges

Kazim's ask was for tags "sprinkled between the rows," so this proposes two layers: **row-earned tags** (attached to the one row that earned them) and a **records strip** at the top of the page (the aggregate, click-through to the row). Every rule below states its exact source field(s) — nothing here is computed from a field that doesn't exist.

### Row-earned tags (small chip on the specific row)

| Tag | Rule | Source fields |
|---|---|---|
| ★ **BANKO** | `is_banko === true` | `is_banko` (already exists, already shown elsewhere as 🔒 BANKO — same visual language, gold) |
| ⚡ **Upset Called** | Won pick where `probability < 0.35` (we rated it a genuine underdog and it hit) | `probability`, `status` |
| 🎯 **Best Price** | The single won pick with the highest `best_odds` in the *current competition's full settled history* (not just the current filtered page) | `best_odds`, `status`, `competition` |
| ✓ **Clean Sweep** | Every entry in `reasoning.checks[]` has `passed === true` | `reasoning.checks[].passed` |

Rules are deliberately conservative — "Upset Called" at <35% and "Clean Sweep" at 100%-passed are thresholds that won't fire on most rows, which is correct: earned badges that show up constantly stop meaning anything.

### Streak dividers (the "between the rows" ask, literally)

Rows are already chronological (`settled_at desc`). Walk the list and find runs of 3+ consecutive same-status picks. When a run ends, drop a thin horizontal divider chip *between* that run and the next:

```
──────────  🔥 4-WIN STREAK  ──────────
```
or, for the currently-open streak at the top of the list (still active as of the most recent settle):
```
🔥 ON A 4-WIN STREAK  (top of page, above row 1)
```
Rose-toned equivalent for a losing run uses the same shape but muted (`text-rose-400/70`, no fire emoji) — this page is a complete history, not a highlight reel, and a losing streak is real information. Source fields: `status`, `settled_at` (ordering only — no new data).

### Records strip (top of page, above the filter bar)

A compact 2–4-up row of stat chips, each one a `Link` straight to the row that earned it (`?highlight=<prediction_id>`, auto-scrolls and expands that row — see §7 for the one thing this needs that doesn't exist yet):

```
🎯 Best price won      Man City @ 4.20         →
⚡ Biggest upset        Girona over Barcelona    →
🔥 Best streak          6 wins in a row          →
★  Banko record         9–2  (82%)               →
```
Each chip's source:
- **Best price won** — `MAX(best_odds) WHERE status='won'` → `best_odds`
- **Biggest upset** — `MIN(probability) WHERE status='won'` → `probability`
- **Best streak** — longest historical run of consecutive `status='won'` by `settled_at` order → `status`, `settled_at`
- **Banko record** — count of `is_banko=true` split by `status` → `is_banko`, `status`

Any chip with no qualifying row (e.g. Süper Lig has zero settled picks, so none of these can compute) is simply omitted — not shown as "—" or "N/A". A strip with one chip, or zero chips, is a correct and intentional state, not a broken one.

---

## 5. Filtering and scanning

URL-driven, following `FilterBar` (`src/components/soccer/FilterBar.tsx`) exactly — same component, no new filter UI pattern introduced:

```
OUTCOME   [ All ] [ Won ] [ Lost ] [ Void ]
MARKET    [ All ] [ Match Result ] [ Total Goals ]
BANKO     [ All ] [ Banko Only ]
SORT BY   [ Most Recent ] [ Highest Confidence ] [ Best Price ]
```
Params: `outcome`, `market`, `banko`, `sort`, `page`. Summary line under the bar reads like Value's does: `"18 of 198 settled picks · won · match result · sorted by most recent"`.

Market filter only offers `match_winner` / `total_goals` — the two values that actually exist in `soccer_predictions.market` today (per the brief). No `btts` option even though `MARKET_LABEL` in `queries.ts` has a label for it — don't offer a filter for data that isn't there.

**Pagination:** 198 rows (World Cup) needs paging, not one infinite page. Plain `?page=` links, 25/page, prev/next at the bottom — same "works with JS off, bookmarkable" reasoning as the rest of the filter system. No client-side infinite scroll.

---

## 6. Empty state

Three of five competitions have zero settled picks today — this is not an edge case, so it gets real design attention, not a generic "nothing here":

```
┌─────────────────────────────────────────────────┐
│                                                   │
│              (competition emblem, dim)           │
│                                                   │
│      No settled picks yet for Süper Lig.         │
│                                                   │
│   The engine grades a pick right after its match  │
│   finishes — check back after the first matchday, │
│   or see what it's calling right now.             │
│                                                   │
│              [ See pending picks → ]              │
│           (links to /football/picks)              │
└─────────────────────────────────────────────────┘
```
Dashed border, same treatment as the existing empty states on `/football/value` and `/football/picks` (`border-dashed border-border/60 bg-card/20`) — visually this page's zero-state should look like a sibling of those, not a different broken-looking thing. The CTA is the one piece of guidance this state needs (UX rule: remove clutter, never remove guidance) — it tells the visitor exactly where the live action is instead of a dead end.

If the competition has `oddsKey === null` (no odds source at all yet), swap the copy to match the existing pattern in `/football/picks`: *"No bookmaker odds for this competition yet — the engine needs a priced market to make a pick."*

---

## 7. What the data doesn't support yet (flagging, not designing around)

Everything in this proposal is built from fields the brief confirms exist in `soccer_predictions` / `soccer_matches`. Two things exist in the *database* but aren't exposed by the current query layer (`src/lib/sports/soccer/queries.ts`), so the frontend engineer needs to extend it, not invent new data:

1. **`PredictionDetail` (queries.ts) doesn't currently select `bookmaker`, `probability`, `reasoning`, `generated_at`, or `settled_side`.** The existing `PREDICTION_SELECT` / `toPredictionDetail` only carries `confidence`, `best_odds`, `expected_value`. This page needs a new query (e.g. `getSettledPicksPage(competition, { outcome, market, banko, sort, page })`) that selects the fuller row set — extend the existing pattern, don't fork it.
2. **The `?highlight=<id>` deep-link into a specific row** (for the records-strip chips) needs the row's stable id in the URL and the page to auto-scroll + pre-expand that row's `reasoning` panel on load. This is a small addition to the page component, not a new data need — `PredictionDetail.id` already exists.

Nothing else here needs schema or data-layer work beyond "select more of what's already in the row."

---

## 8. What makes this worth showing a friend

Every sportsbook and every tipster account shows a win rate. Almost none show *why* — and the ones that claim to usually mean a paragraph of vibes, not a graded checklist. This page's one real differentiator is that every single graded pick can be expanded into the exact checklist the engine ran before it bet: what the consensus said, whether the books agreed, what the table form suggested, and which of those actually passed. That's a screenshot someone posts to a group chat that isn't just "look, I won" — it's "look, it called this because of X, and X was true." Paired with badges that are only ever true (an upset flagged because the probability really was low, a streak that's really consecutive, a banko record that's really the banko ledger) rather than decorative, the page reads as a receipt, not a highlight reel — which is exactly the trust position "TrustMeBro" needs, especially on the 10-row Champions League and the 0-row Süper Lig where there's nothing to hide behind yet.

---

## Files referenced (for the implementing agent)

- `src/app/football/scoreboard/page.tsx` — tiles to convert to links
- `src/lib/sports/soccer/queries.ts` — `PredictionDetail`, `PREDICTION_SELECT`, `getRecentSettledPicks` (base to extend into paginated/filtered query)
- `src/components/soccer/SettledPickRow.tsx` — existing compact row to extend, not replace, for visual consistency
- `src/components/soccer/FilterBar.tsx` — reuse verbatim for outcome/market/banko/sort
- `src/components/soccer/MatchBanner.tsx`, `src/components/soccer/Term.tsx` — crest rendering, tooltip/expand interaction pattern
- `src/lib/sports/soccer/labels.ts` — `sideLabel`, `marketLabel`
- `src/lib/sports/soccer/competitions.ts` — `COMPETITIONS` registry, per-competition theme/status
- `src/lib/sports/registry.ts` — nav entries (`NavGroup`/`NavItem`), add Results under Football → Picks
- `src/lib/analysis/soccer/engine.ts` — real `reasoning.checks[].label` values ("De-vigged consensus probability", "Bookmaker agreement", "Table form edge")
- `.claude/UI_RENOVATION.md` — palette/motion tokens this must stay inside
