# Engine History Page — Build

**Stage:** engineering (P2 — build against approved design)
**Author:** Natalia (`frontend-engineer`)
**Branch:** `tmb_sep14_v10` (no commits made — release step handles branch/commit/push)
**Design doc:** `docs/handoffs/engine-history-design_2026-09-14.md`

---

## Status
PASS

## Summary
Built `/football/results` — the settled-pick history page — per the approved design, extended the
Supabase query layer with the fields the design flagged as missing (`bookmaker`, `probability`,
`reasoning`, `generated_at`, `settled_side`), wired the scoreboard's four stat tiles into real
filtered links, and verified every badge and record against the live Champions League and World
Cup data directly in Postgres. Dropped one badge the design proposed ("Clean Sweep") after
measuring it fires on 63.6% of settled picks — the opposite of the design's own "rare and
meaningful" intent — documented below and in code.

## For Kazim
The Wins/Losses/Voids/Hit Rate tiles on the football scoreboard now click through to a full,
provably-accurate history of every graded pick — price, final score, and an expandable "why this
call" panel showing the engine's actual checklist — with tasteful streak dividers and record
chips (best price, biggest upset, longest streak, banko record) sprinkled in, all checked line by
line against the database; one proposed badge ("Clean Sweep") got dropped because it turned out to
fire on most rows instead of being rare, which would have made it meaningless.

## Files
- `src/app/football/results/page.tsx` — new page: filters (outcome/market/banko/sort), pagination
  (25/page), records strip, streak dividers, empty states, `?highlight=` deep-link handling.
- `src/components/soccer/ResultsRow.tsx` — new client component: collapsed row (outcome, crests,
  score, call, price/confidence, date, bookmaker, badges) + expandable `reasoning.checks[]` panel.
- `src/lib/sports/soccer/results.ts` — new pure module: `computeSettledRecords`, `rowBadges`,
  `groupStreaks` (no DB, no fetch — tested against real data via direct Postgres queries, see below).
- `src/lib/sports/soccer/queries.ts` — added `SettledPickDetail` type, `SETTLED_PICK_SELECT`,
  `toSettledPickDetail`, `getSettledPicks()`. Existing `PredictionDetail` / `getRecentSettledPicks`
  untouched — every other caller (BankoCard, CouponCard, SettledPickRow, value page) is unaffected.
- `src/lib/tz.ts` — added a `"date"` `TimeFormat` variant (month + day, no clock) so `<LocalTime>`
  can show "Sep 12" without inventing a second time-formatting path. Additive, non-breaking.
- `src/app/football/scoreboard/page.tsx` — the four `<Stat>` tiles are now `<Link>`s to
  `/football/results` with outcome filters, dynamic `aria-label`, focus ring, hover lift
  (motion-reduce-safe), and a fade-in chevron.
- `src/lib/sports/registry.ts` — added `{ href: "/football/results", label: "Results" }` to the
  Football → Picks nav group, right after Scoreboard.
- `src/app/football/picks/page.tsx` — "Full ledger →" now points at `/football/results` instead of
  `/football/scoreboard` (the design doc flagged this one-line fix explicitly).

## Badges — exact source per badge (non-negotiable: every badge traces to a real field)
| Badge | Rule | Fields | Verified |
|---|---|---|---|
| ★ BANKO | `is_banko === true` | `is_banko` | World Cup: 41/198 rows (33 won, 8 lost) — matches `SELECT status, count(*) ... WHERE is_banko` exactly |
| ⚡ Upset Called | `status === "won" && probability < 0.35` | `probability`, `status` | World Cup: 4/198 rows (2.0%) — rare as intended |
| 🎯 Best Price (row) | row's id === `MAX(best_odds) WHERE status='won'` across the **full** competition history | `best_odds`, `status` | World Cup: matched DB's actual max (odds 11.00, "Draw") exactly |
| 🎯 Best price won (records strip) | same computation, shown once at the top | `best_odds`, `status` | same row as above |
| ⚡ Biggest upset (records strip) | `MIN(probability) WHERE status='won'` | `probability`, `status` | World Cup: same row as best price (11.00 odds, 9.24% probability) — a genuine long-shot, not a bug |
| 🔥 Best streak (records strip) | longest run of consecutive `status='won'` in true chronological order | `status`, `settled_at` | World Cup: 13 wins in a row — cross-checked the ordered `status` sequence directly from Postgres |
| ★ Banko record (records strip) | count of `is_banko=true` split won/lost | `is_banko`, `status` | World Cup: "33–8 (80%)" — matches DB exactly |
| Streak dividers between rows | consecutive same-status runs of 3+ in `settled_at` order, **only shown on the unfiltered/most-recent-first view** (see Risks) | `status`, `settled_at` | Confirmed against a direct DB pull: most recent World Cup sequence is won, lost×3, won×3, lost, won×2 — the page renders "3-Loss Streak" and "3-Win Streak" dividers in exactly those spots |

**Dropped: ✓ Clean Sweep** (design §4: "every entry in `reasoning.checks[]` has `passed === true`").
Measured directly against the World Cup's 198 settled rows: **126/198 (63.6%) would qualify.** The
engine's two always-emitted checks (de-vigged probability ≥50%, ≥3 books agreeing) are close to
tautological — a pick is only generated once it roughly clears that bar — so "all checks passed"
mostly just means "the engine took this pick at all," not a distinguishing signal. That's the exact
failure mode the design itself warned against ("a badge that fires on most rows stops meaning
anything"). Dropped rather than shipped dishonestly common; documented in `results.ts` with the
measurement inline so a future change to the engine's check semantics can revisit it.

## Deviations from the design doc
1. **Clean Sweep badge dropped** — see above.
2. **Banko record chip links to the filtered list, not a single row.** The design's records-strip
   spec says each chip links via `?highlight=<prediction_id>`, but "Banko record" is a count across
   many rows, not one. It links to `/football/results?banko=banko` instead — same "click through to
   what earned it" intent, honestly scoped to what the chip actually represents.
3. **Streak dividers only render on the exact default view** (`outcome=all`, `market=all`,
   `banko=all`, `sort=recent`) — not stated explicitly in the design, but necessary: a divider
   claiming "3 consecutive" is only true against the real `settled_at` order. Filtering to
   `outcome=won` would make every visible row trivially "consecutive," and sorting by confidence or
   price breaks chronological order entirely. Any other filter/sort combination simply omits
   dividers rather than showing a false one.
4. **National-team crests in the row render as square-ish badges, not the wide flag treatment**
   `MatchBanner` uses. `ResultsRow` reuses the existing standalone `TeamCrest` component (already
   used elsewhere for compact contexts) rather than exporting `MatchBanner`'s internal `CrestCell` —
   smaller footprint, no changes to a component several other pages depend on. Cosmetic only; World
   Cup crests are still recognizable.
5. **Row's own "why this call" section omits `outcomeNote`** (the small "· 3 goals" / "· draw"
   annotation `SettledPickRow` shows) — not requested in the design's row spec, kept out to match
   the wireframe literally and control scope.

## Risks
- `getSettledPicks()` caps at 1000 rows per competition (World Cup is 198 today). Headroom, not a
  real ceiling, but flagging: if a competition's settled history ever exceeds 1000, records/streaks
  computed from that fetch would quietly go stale for the oldest rows. No competition is remotely
  close today.
- Zero automated tests were added (none exist elsewhere in this codebase for page-level UI either —
  matches existing convention). Verification below was manual + direct-to-Postgres.

## What I verified (Kazim's "prove it" bar)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean, no errors/warnings.
- Loaded `/football/results` on the pinned dev server (9136) for all three volume cases:
  - **World Cup (198 settled):** 8 pages at 25/page, all filters/sorts tested (`banko=banko` → 41
    of 198, matches DB; `market=total_goals` → 100 of 198; `sort=price` → real descending order
    1000.00 → 126.00 → 29.00 → 27.00…).
  - **Champions League (10 settled):** full page renders, records strip shows 3 of 4 possible chips
    (best price, upset, banko — no 3+ streak yet in only 10 rows, correctly omitted).
  - **Süper Lig (0 settled):** correct empty state — "No settled picks yet for Süper Lig" + "See
    pending picks →" linking to `/football/picks`.
- Clicked through all four scoreboard tiles (via direct href inspection): Wins/Losses/Voids/Hit
  Rate all carry the right `?outcome=` filter (or none, for Hit Rate) and correct dynamic
  `aria-label`s ("View 7 settled wins for Champions League", etc.).
- Verified `?outcome=lost` on Champions League narrows 10 → 3, correctly labeled in the summary
  line.
- Verified `?highlight=<id>` deep link: the target row renders with the highlight ring
  (`ring-primary/40`), `aria-expanded="true"`, and its real `reasoning.checks[]` pre-expanded — no
  manual click needed.
- **Direct-to-Postgres cross-check** (`DATABASE_URL` via a local Node script, not the Supabase MCP —
  it wasn't connected this session): pulled a specific World Cup row
  (`59d41de3-2fcc-4c47-bad6-d6bab38974c7`) with its match join and compared every field against the
  rendered page — market, side, line, odds (1.68), bookmaker (matchbook), confidence (58.6 → 59%
  displayed), probability, both `reasoning.checks[]` entries, home/away names, and final score
  (Spain 1–0 Argentina). All matched exactly. Independently verified the four records-strip numbers
  (best price 11.00, upset 9.24%→9%, 13-win streak, banko 33–8/80%) and the Clean-Sweep rate that
  led to dropping it.

## Next
qa-test-engineer (Olga) — Chrome QA gate (desktop + mobile), then Michael's code-review gate before
release-engineer ships.

## Human gate
None. No irreversible/destructive steps, no scope change beyond what was briefed, no money
involved. The one design deviation with judgment attached (dropping Clean Sweep) is a quality call
backed by a measurement, not a scope decision — flagged above for visibility, not for approval.
