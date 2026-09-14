# Engineering handoff — Bro predictions game (score calls)

Note: `engineering_2026-09-13.md` (no suffix) already exists for a different, concurrent task
(football share cards, by another session on this same repo/day) — this is a separate `_v2` file
per the house same-day-collision convention, not an update to that one.

## Status
PASS, with one pre-existing bug found and flagged (not introduced by this work — see Risks).

## Summary
Built the Bro predictions game end to end: bros call a match's final score before kickoff,
graded 3 pts exact / 1 pt right result / 0 otherwise, with a per-competition leaderboard for
signed-in bros (guests can play but stay off the public board, same rule as shared coupons).
`POST/GET/DELETE /api/soccer/predictions` handle the call itself — upsert via update-then-insert
rather than `.upsert()` because the table's uniqueness lives on two *partial* indexes (one per
identity kind), which a plain `ON CONFLICT` can't infer without repeating the predicate. The
`ScoreCall` widget (steppers, optimistic save + toast, three states: editable/saved, locked, and
an inline guest-name prompt reusing the existing `GuestPicker`) is exported for another engineer
to drop into the match page per the task's instruction — I did not touch that page myself. The
`/football/predictions` board shows the active competition's current round as a grid of
`ScoreCall` cards, the viewer's running points, and the leaderboard. `tsc --noEmit` and
`eslint --max-warnings=0` are clean on every file touched. Verified live against the running dev
server: 401 signed-out, 201 create, GET round-trip, 200 delete, 409 on a finished match, and a
guest call left in place as instructed for cleanup.

## Files
- `src/lib/sports/soccer/predictions-queries.ts` — new; `getOwnScoreCalls`,
  `getPublicCallSummary` (kicked-off matches only, filtered by `datetime` even though RLS mostly
  handles it — see Risks), `getOwnCompetitionStats` (works for both auth and guest, unlike the
  leaderboard view), `loadPredictionLeaderboard` (view + profile join, top N). Deliberately
  separate from `queries.ts` (off-limits, owned by another session)
- `src/app/api/soccer/predictions/route.ts` — new; `GET` (own calls + public distribution for a
  CSV of match ids), `POST` (validates the match exists and hasn't kicked off, upserts by
  identity), `DELETE` (own call, pre-kickoff only)
- `src/lib/analysis/soccer/grade-calls.ts` — new; pure `scoreCall(call, final): 0|1|3` +
  `gradeScoreCalls(competition)` (server-only, finds ungraded calls on finished matches, writes
  `points`/`graded_at`, returns the count). Mirrors `settle.ts`'s `soccer_matches!inner` join
  pattern. **Not wired into the settle job or any cron route** — that's explicitly on you
- `src/components/soccer/ScoreCall.tsx` — new; `"use client"`. Props: `matchId`, `competition`,
  `home`/`away` `{name, abbreviation, crest}`, `kickoff` (ISO), `initial`, `locked`, `finalScore`,
  plus one addition beyond the brief's prop list: `publicSummary?` (the "Bros called: 62% home…"
  data has to come from somewhere — the page already loads it via `getPublicCallSummary`, so it's
  a prop rather than a second client fetch). Reuses `MatchBanner` (`size="sm"`) for the matchup
  strip instead of inventing a new banner. Renders `GuestPicker` inline (not a redirect to
  `/login`) when a save comes back `401`, so a signed-out visitor's entered score isn't lost to a
  full-page nav until they actually submit a guest name
- `src/app/football/predictions/page.tsx` + `loading.tsx` — new; header, running-points strip
  (skipped entirely when signed out — no query, no empty box), current/next round as a
  `ScoreCall` grid, leaderboard table (own row highlighted, guest/signed-out explainer)
- `src/lib/sports/registry.ts` — one line added: `{ href: "/football/predictions", label:
  "Predictions" }` in the football nav, right after "Picks"
- `src/app/bros/page.tsx` — added a compact "Score callers" card (top 3, `BroAvatar` + points)
  linking to `/football/predictions`, shown only when `sport === "soccer"`. Existing coupon
  feed/sidebar layout is otherwise untouched — the card lives in a new wrapper `div` around
  `ActiveBrosSidebar` so it stacks in the same 280px column without disturbing the two-column
  grid's implicit placement
- `src/lib/date.ts` — added `hasKickedOff(iso)`. Needed because the React Compiler ESLint rule
  flags a bare `Date.now()` call inside a Server Component's render body as impure; wrapping it in
  an external helper (same pattern the file's other exports already use) satisfies the rule and is
  now shared between the API route and the page instead of duplicated

Untouched, exactly as instructed: `football/match/*`, `LiveTracker`, `api/soccer/matches`,
`api/og`, `BankoCard.tsx`, `PickLine.tsx`, `queries.ts`, `settle.ts`, cron routes.

## Verified (live, against the running dev server on :9136)
- `GET /football/schedule` (cookie `tmb_competition=uefa.europa`) → 200, found upcoming match
  `401915569` (Sep 17)
- `POST /api/soccer/predictions` with no identity → **401**
- `POST` as guest `QA Bro` on `401915569` → **201**, row returned with `points: null`
- `GET ?match_ids=401915569` (same guest) → own call round-trips correctly
- `DELETE {match_id: 401915569}` (same guest) → **200**; follow-up `GET` shows `own: null`
- `POST` on finished match `401915452` → **409 locked**
- Re-created the call on `401915569` (2–1) and left it in place, as instructed, for your cleanup
- `/football/predictions` (default, Champions League) → 200, screenshots at 1440 and 390 below
- `/football/predictions` with `tmb_competition=uefa.europa` and as guest `QA Bro` → verified via
  curl + HTML inspection (headless Chrome can't set cookies from the CLI, per the task note):
  correct round, "Points" stat strip showing the guest's saved call, guest-specific leaderboard
  explainer text present, no server errors
- Screenshots: `/private/tmp/claude-501/-Users-k13-Desktop-PROJECTS-TrustMeBro/046cd513-bc69-4d62-bc5a-830cb0a2999e/scratchpad/agentE/predictions-desktop-1440.png`,
  `.../predictions-mobile-390-v2.png` (post-fix; see Risks for the `-v3` device-scale-factor
  cross-check)

## Risks
- **Found a real mobile bug in my own first screenshot, fixed it, then found the fix wasn't
  enough on its own — root cause is pre-existing and out of scope.** The `ScoreCall` card is a
  direct CSS Grid child; grid items default to `min-width: auto`, so a long team name inside the
  reused `MatchBanner` (which relies on flex `min-w-0`/`truncate`) can force the whole grid track
  wider than the viewport. I added `min-w-0` to all four of `ScoreCall`'s root cards — correct
  practice, keep it. But re-screenshotting at 390px (both default and with
  `--force-device-scale-factor=1 --window-size=390,844` as a sanity check) still showed the same
  right-edge clipping. I reproduced the **identical** clipping signature on the already-shipped,
  untouched `/football/schedule` page using the same `MatchBanner`/nav components, which confirms
  this is a **pre-existing, site-wide mobile horizontal-overflow issue** in shared components
  (likely `MatchBanner` and/or the competition-switcher pill row), not something introduced by
  this task. Fixing it is out of scope here (wide blast radius across every football page, several
  owned by other in-flight sessions per this task's own "do not edit" list) — flagging for a
  dedicated pass.
- `getPublicCallSummary` filters by `datetime` in application code even though RLS already scopes
  "public" rows to post-kickoff matches. Kept deliberately: a signed-in viewer's own row is
  visible to them under the "read own" policy regardless of kickoff, so without this filter their
  own pre-kickoff pick could leak into what's meant to be a locked-state-only aggregate.
- `gradeScoreCalls` exists and is exported but nothing calls it yet — per the task, wiring it into
  `settle-bets` (or a new cron) is explicitly yours to do.
- Leaderboard ties break by `points` then `exact_scores` only; no tertiary tiebreak (e.g. earliest
  call). Matches the spec's field list exactly — flag if you want more determinism.

## Next
qa-test-engineer (Olga) — via the Michael code-review gate first, per the standing pipeline.

## Human gate
none
