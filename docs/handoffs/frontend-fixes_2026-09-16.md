# Frontend fixes — live football QA triage — 2026-09-16

Implements the 10 fixes from `docs/handoffs/qa-live-triage_2026-09-16.md`
(Olga's report-only pass on tmb.k13projects.com, 2026-09-16). Branch
`tmb_sep16_v1`, no commits made (release-engineer ships). `npx tsc --noEmit`
and `npx eslint` both clean on every file listed below.

## What changed, per finding

**1. Default competition = nearest action.**
New `src/lib/sports/soccer/live-signals.ts` — `getLiveCompetitionSignals()`,
`cache()`'d, queries `soccer_matches` for every live competition across a
yesterday..+8-day window and returns, per competition, whether it has a
match `in` right now or kicking off today, plus a computed
`defaultCompetition` (in-play wins, else nearest upcoming kickoff, else
`DEFAULT_COMPETITION`). `activeCompetition()`
(`src/lib/sports/soccer/competition-cookie.ts`) now calls it only when no
`tmb_competition` cookie is set — a set cookie still always wins. Falls back
to `DEFAULT_COMPETITION` / all-false on any query error or empty result, so
a DB hiccup never blocks a page render.

**2. Live dot on competition tabs.**
`src/app/football/layout.tsx` fetches `getLiveCompetitionSignals()` once
(shares the same `cache()` entry `activeCompetition()` already populated)
and passes the plain-object signal map through `CompetitionBar` →
`CompetitionSwitcher`. Each tab now shows a small pulsing gold dot
(`animate-pulse motion-reduce:animate-none`, matching the existing "Live"
badge's color — emerald stays reserved for score deltas per the palette
rule) when that competition has a match in play, or a smaller static dot
for "kicking off today." Both are announced to screen readers via the
tab's `title` and an `sr-only` suffix on the label, not just color.

**3. Floating launcher overlap (`ChatLauncher` / `CouponDrawerLauncher`).**
Real fix pass, not a per-page patch:
- New `src/components/site/useHideOnScroll.ts` — starts hidden, fades in
  ~900ms after mount (page gets a clean first paint), hides again while
  scrolling down, returns on scroll-up or once scrolling stops. Both
  launchers use it; only the *idle* trigger is affected — an open chat
  panel's close button always stays visible.
- Both launchers are now icon-only circular FABs at every breakpoint
  (previously a wide text+label pill on desktop) — the label moved to a
  `Tooltip` on hover/focus (`@/components/ui/tooltip`, already used
  elsewhere), cutting the persistent footprint from ~170px wide to 48px.
  This is what actually fixes the `/football/bracket` desktop overlap: the
  container fills almost the full viewport there, so no amount of
  "gutter" positioning avoids it — only shrinking the button does, and the
  math confirms a 48px icon fits inside the max-w-7xl page margin at
  typical desktop widths where the old ~170px pill didn't.
- `lg:right-[max(1.5rem,calc((100vw-80rem)/2-3.5rem))]` keeps the button in
  the empty margin outside the site's `max-w-7xl` content column on wide
  viewports instead of always hugging the screen edge, falling back to the
  original fixed offset below that width.
- `src/app/layout.tsx` — one exception to file ownership, disclosed here:
  added `pb-48 md:pb-32` to the root `<main>` (was `flex-1` with no bottom
  reserve) so a short page's last content doesn't land directly under the
  fixed stack — this is what the mobile `/score` "PENDING tile on first
  paint, no scroll" case needed, and it can't be fixed from inside
  `ChatLauncher`/`CouponDrawerLauncher` alone (they're `fixed`, so nothing
  rendered after them in the DOM can move content that's already above
  them). No other in-flight agent touches this file (checked via `git
  status` before editing) and the diff is a single class addition.

  **Residual risk, please re-test specifically:** the mount-delay fades the
  stack in ~900ms after load; a screenshot tool that waits for full
  network+animation settle (as QA harnesses usually do) will likely still
  capture the *revealed* state, so the bracket-at-rest and mobile-hero
  cases may still show the button over content in a re-test even though a
  real visitor's first glance is now protected. Fully closing that last
  gap means either tightening Hero's mobile vertical rhythm (a design
  call, not just this pass) or accepting the tooltip-triggered translucency
  as the final state — flagging for Olga's re-test rather than guessing.

**4. Match page news relevance.**
`getNewsForMatch()` (`src/lib/sports/soccer/queries.ts`) now returns
`{ relevant, fallback }` instead of a flat list: `relevant` is still
`match_id` OR `team_ids` overlap (match_id hits sort first), and only when
that's short of `minTotal` (4) does it top up with competition-wide news,
returned separately as `fallback`. `NewsAside` on the match page
(`src/app/football/match/[id]/page.tsx`) renders `fallback` under its own
"Around the competition" heading instead of blending it into "News".

  **Root cause found while implementing, not fixable from here:** queried
  prod (`soccer_news`, match 401915418 = Lens v Sporting) and the Guardian
  MLS/Leeds rows QA saw are not a filter bug — their `team_ids` arrays
  really do contain Sporting's team_id (2250), which reads like a
  name-collision in the scraper's team-tagging (Sporting CP vs. Sporting
  Kansas City), and `match_id` was `null` on every sampled row so the
  match_id tier rarely has anything to prefer yet. My change makes the
  tiering/labeling correct given the data, but can't fix mistagged
  `team_ids` — that's `scrape-news`, which is out of my file ownership for
  this task (and another agent has it open right now). Worth a ticket for
  whoever owns that pipeline next.

**5. Lineups + Names to watch empty states.**
`LineupsSection` (match page) now always renders when `detail` exists
(was gated on `detail.lineups.length > 0`, which let a non-empty array of
*empty* per-team lineups through to leave a bare heading). Added the same
dashed-border empty-state treatment already used by the Odds section:
"Lineups are confirmed about an hour before kickoff." `MatchLeaders.tsx`
adds a one-line note ("Early in the season — these numbers will fill out
as {competition} continues") when every leader stat shown is ≤1, keeping
the table as instructed rather than hiding it.

**6. Archived competition live dot.**
`Hero.tsx` — `StatLedgerPanel` takes a new `live` prop (default `true`,
unaffected NBA/live-football callers); when `false` it renders "final"
instead of the pulsing "live" text+dot. `football/page.tsx`'s
`ArchiveHome` (World Cup) passes `live={false}`.

**7. `/login` eyebrow.**
`TrustMeBro · NBA` → `TrustMeBro`. Went sport-neutral rather than deriving
from the `tmb_sport` cookie — `LoginPage` is a client component and the
page is a shared gateway for both sports, so a static neutral label avoids
a cookie-read/hydration dance for a one-line eyebrow.

**8. Bro Board "Online now" panel.**
`ActiveBrosSidebar.tsx` — the Online section's `emptyText` is now `null`
(was a "no bros active" message), so the section stops rendering entirely
at 0 online instead of showing a dead "Online now · 0" card. Leaderboard
below always has something to show.

**9. Call the Scores engine marker.**
New `getPredictionsForMatches()` (batched sibling of the existing
per-match query) in `queries.ts`. `predictions/page.tsx` fetches it once
for the round and, per match, finds the strongest **pending** pick and
passes `{ label, isBanko }` to `ScoreCall`'s new optional `enginePick`
prop. Renders as "★ Engine leans: {sideLabel(...)}" (e.g. "Sporting win"
or "Over 2.5 goals") above the score steppers in every card state — it
never seeds `homeVal`/`awayVal`, per the 2026-09-15 house rule that the
engine's pick is a marker, never a preselected state.

**10. Verification.** `npx tsc --noEmit -p .` and `npx eslint <every file
below>` both clean. Two pre-existing `tsc` errors in generated
`.next/types/*.d.ts` (duplicate route/cache-life identifiers) are
unrelated to this diff — they read like fallout from the stray
`" 2"`-suffixed duplicate page/layout files QA already flagged as a P3
dev-hygiene item, not something I touched.

## Files
- `src/lib/sports/soccer/live-signals.ts` (new)
- `src/components/site/useHideOnScroll.ts` (new)
- `src/lib/sports/soccer/competition-cookie.ts`
- `src/lib/sports/soccer/queries.ts`
- `src/components/soccer/CompetitionBar.tsx`
- `src/components/soccer/CompetitionSwitcher.tsx`
- `src/components/soccer/ScoreCall.tsx`
- `src/components/soccer/MatchLeaders.tsx`
- `src/components/site/Hero.tsx`
- `src/components/chat/ChatLauncher.tsx`
- `src/components/cart/CouponDrawerLauncher.tsx`
- `src/components/bros/ActiveBrosSidebar.tsx`
- `src/app/layout.tsx` (one line outside primary ownership, disclosed above)
- `src/app/football/layout.tsx`
- `src/app/football/page.tsx` (`live={false}` only — did not touch the
  `after()` refresh block near line 93/113, which belongs to another agent;
  that agent has since added a second `after()` block of its own right
  after it, also untouched by me)
- `src/app/football/match/[id]/page.tsx`
- `src/app/football/predictions/page.tsx`
- `src/app/login/page.tsx`

## Risks
- **#3 is a mitigation, not a provable full close** — see the residual-risk
  note above. Recommend Olga specifically re-shoot the mobile `/score`
  first-paint case, `/football/bracket` desktop at rest (no scroll), and
  the mobile home/`/bros` hero, since those are exactly the cases a
  mount-delay can't guarantee against a patient screenshot tool.
- **#4's root cause (scraper team_ids mistagging) is unresolved** — my fix
  correctly tiers and labels what the data says, but a mistagged item can
  still surface in the "relevant" tier if match_id is null (common right
  now) and it wrongly carries a club's team_id. Needs the scrape-news
  owner.
- `src/app/layout.tsx` and `src/lib/sports/soccer/queries.ts` are outside
  my listed file ownership for this task; both edits are small, additive,
  and confirmed (via `git status`) not touched by the other two agents
  active in this tree. Flagging per the parallel-agents house rule rather
  than assuming it's fine.
- No visual QA loop was run on this pass (no dev server / browser driven —
  static analysis + read of the flagged screenshots only). Per house rule,
  this isn't "done" until Olga's two-agent Chrome QA gate passes.

## Next
qa-test-engineer (Olga) — re-test the 10 findings above on the same pages
(desktop 1440 + mobile 390), with the three flagged residual-risk screens
prioritized, then release-engineer (Kate) ships once QA passes.

## Human gate
None — all 10 are the routine UI fixes Olga's report already scoped as
no-money/no-scope-change. The two out-of-ownership file touches
(`layout.tsx`, `queries.ts`) are disclosed above for visibility, not
because they need Kazim's sign-off.
