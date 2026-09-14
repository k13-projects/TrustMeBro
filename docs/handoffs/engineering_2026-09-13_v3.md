# Engineering handoff — Live match tracker (football)

Note: `engineering_2026-09-13.md` and `_v2.md` already exist for different, concurrent tasks on
this same repo/day (share cards, Bro predictions game) — this `_v3` is a separate file per the
house same-day-collision convention, not an update to either of those.

## Status
PASS

## Summary
Built the live match tracker for `/football/match/[id]`: a polling API route plus a client
component showing live win probability, score/clock, a goals+cards momentum timeline, live
commentary, and compact key stats. Win probability is computed server-side with the existing
`liveWinProbability` model, fed by a pre-match read hierarchy (consensus rates → latest odds
history → neutral default, with the fallback surfaced in the UI as "no pre-match price — neutral
model" per spec). Shared the read/compute logic between the SSR initial paint and the poll route
via one new function (`buildLiveSnapshot`) so the two never drift. Wired into the match page
directly under the hero: renders while live, within 20 min of kickoff, or finished (finished =
no polling, probability collapsed to the result); further out shows a "Live tracker starts at
kickoff" pill instead. `tsc --noEmit` and `eslint --max-warnings=0` are clean on every file I
touched (one pre-existing type error in `api/soccer/predictions/route.ts` from a different,
concurrent session's untracked work — confirmed via `git status`/`git diff --stat`, not mine, not
touched).

Verified against the running dev server: the finished match `/football/match/401915452` renders
correctly (final 1–0, probability collapsed to 100/0/0, real goal/card events on the momentum
axis, 4 commentary lines + "9 earlier" collapsed, key stats populated). Simulated an in-play
snapshot via a throwaway route (deleted, confirmed gone in `git status`) — score/clock/pulsing
dot, win-probability bar with the pre-match comparison row, clustered-but-legible momentum icons,
and commentary all rendered correctly at both 1440 and 390px. Screenshots below.

## Files
- `src/app/api/soccer/matches/[id]/live/route.ts` — new. Looks up `competition`/`league_slug`
  (same pattern as the existing `events` route), calls the provider for detail + events, builds
  the snapshot, returns `{ok:false}` (never 500) on any failure so the poller just keeps the
  last-known state.
- `src/lib/sports/soccer/match-queries.ts` — added `buildLiveSnapshot` (+ `LiveSnapshot`,
  `LiveProb`, `LiveMatchState` types) and the pre-match-read hierarchy (`loadPreMatchRead`,
  internal). This is the one place both the SSR page and the poll route compute the win-probability
  read, so they can't disagree. Existing `getMatchLeagueSlug` untouched.
- `src/components/soccer/LiveTracker.tsx` — new, `"use client"`. Polls every 20s while live or
  within 20 min of kickoff (mirrors `LiveMatch`'s pattern, `Date.now()` only inside the effect per
  the React Compiler purity rule), stops for good once finished. Sub-components: `ScoreClock`,
  `WinProbBar`, `MomentumTimeline` (reuses the existing, tested `minutesFromClock` to place goal/
  card icons on a 0–90(+) axis), `KeyStats`, `CommentaryFeed` (6 visible, rest behind a `<details>`
  matching the existing Timeline/commentary pattern elsewhere on the page).
- `src/app/football/match/[id]/page.tsx` — fetches match events alongside the existing
  `getMatchDetail` call, computes tracker eligibility (`nowMs()` wrapped in a plain top-level
  function, same pattern already used in `football/club/[id]/page.tsx`, to satisfy the same purity
  rule for a Server Component), and renders `<LiveTracker>` or the kickoff pill directly under the
  hero. No other section changed.

## Risks
- **Pre-existing, unrelated:** at 390px width the whole match page (header/ticker/nav — none of
  it mine, `MatchBanner`/`LiveMatch` are explicitly off-limits) overflows horizontally and clips
  content on the right. Reproduced on a plain pre-match page with no tracker at all, so it's not
  caused by this work — flagging for whoever owns the header/nav shell. My component's own content
  reflows correctly inside its card at 390px; it doesn't add to the clipping.
- **Pre-existing, unrelated:** `npx tsc --noEmit -p .` has one error in
  `src/app/api/soccer/predictions/route.ts` (a `user_id`/`guest_name` union narrowing issue) from
  a different session's untracked, in-progress work — not touched, not introduced here.
- The win-probability bar's blue/grey/white segments are the competition-scoped `--primary`
  (Champions League blue in my screenshots, not TrustMeBro gold) — intentional per the design
  tokens note, not a color bug; confirmed the global gold chrome (My Coupon button) renders
  correctly alongside it on the same page.
- Momentum icons for events within ~2 minutes of each other visually cluster/overlap at narrow
  widths (acceptable for MVP; no dedup/offset logic added).

## Next
qa-test-engineer (Olga) — Chrome QA gate (desktop + mobile), via the code-review gate first per
protocol.

## Human gate
none
