# Engineering handoff — soccer_news team tagging fix + on-visit grading gap

**Agent:** Mariana (backend-integrations-engineer)
**Date:** 2026-09-16
**Branch:** tmb_sep16_v5 (already checked out; not committed — release-engineer owns commit/PR/merge)

---

## Status
PASS

## Summary

**Task 1 — soccer_news mistagging.** Confirmed and fixed the root cause: `tagMentions()`
in `src/lib/signals/news/soccer/rss.ts` tagged a club on any bare whole-word alias hit,
with no further check. Several clubs' short aliases are also ordinary words or the
generic half of an unrelated real club's name — "Sporting" (Sporting CP vs. Sporting
Kansas City), "Inter" (Internazionale vs. Inter Miami), "City" (Manchester City vs.
Orlando City/Kansas City), "United" (Manchester United vs. Newcastle/West Ham/Leeds
United), "Madrid" (Real Madrid vs. any other Madrid club, chiefly Atlético Madrid, an
actual Champions League entrant). Measured against prod: **156 rows / 163 (row,
team_id) pairs** across the four live competitions carry a confirmed uncorroborated
ambiguous-alias mistag (the concrete example: a single Guardian MLS roundup mentioning
Sporting KC + Orlando City + Inter Miami wrongly tagged Sporting CP + Manchester City +
Internazionale, all three wrong). `match_id` was set on only 33 of 2,044 live-competition
rows (1.6%) before this fix.

Fix: an explicit stoplist (`AMBIGUOUS_CLUB_ALIASES`) marks those tokens as "weak" — a
weak hit only survives if the same story also confidently names another club (a "strong"
hit: full canonical name, unambiguous alias, or curated star mention) that this club
actually plays, per `soccer_matches`, within 10 days of publish. That same fixture data
now also opportunistically resolves `match_id` when exactly two clubs are confirmed and
exactly one match between them falls within 4 days of publish (never guesses between
two candidates). Text matching for club/country names now also goes through the same
diacritic + Turkish dotless-ı folding as `normalizeTeamName()` (team-match.ts) — reused
per the brief, not reinvented — but via a local `foldForScan()` that skips
`normalizeTeamName`'s apostrophe-stripping. That stripping is safe for isolated name
tokens ("Cote d'Ivoire") but corrupts running Turkish prose, where a possessive/dative
suffix is glued onto a name with an apostrophe ("Sporting'e", "Galatasaray'a") —
deleting the apostrophe fuses the suffix onto the name and breaks the word-boundary
match. Caught this by dry-running an early version of the fix and seeing corroboration
fail for the exact Sporting–Galatasaray match the bug report was about; fixed before
computing the migration data, confirmed by rerunning.

Migration 0038 (`src/db/migrations/0038_soccer_news_team_tagging_fix.sql`, not applied —
release-engineer/Kazim applies it): removes exactly the 163 proven (row, team_id) pairs
via `array_remove` (idempotent, re-runnable), and backfills `match_id` for 546 rows
using the corrected team_ids and the same 4-day/exactly-one-fixture rule (guarded by
`match_id is null`, so it never overwrites and is also re-runnable). Deliberately does
**not** touch any team_id the recompute merely "can't find" in the stored text for other
reasons — `soccer_news.summary` is a 3-sentence trim of the original RSS description the
live tagger actually ran against, so a team mentioned only in the trimmed-off tail would
look like a miss without being a real bug. When unsure, the migration leaves the row
alone. `fifa.world` (archived) and `is_engine_take = true` rows (always correctly tagged
by construction) are excluded from both the measurement and the migration throughout.
Dry-run inside a rolled-back transaction against prod confirmed: match_id coverage goes
from 33/2,044 (1.6%) to 579/2,044 (28.3%); spot-checked three specific rows (the
Sporting CP/Galatasaray row from the bug report, the Liverpool/Atlético Madrid
mis-tag, and a Roma/Fenerbahçe preview) and all resolved correctly.

**Task 2 — on-visit grading gap.** `hasSettleWork()` in
`src/lib/ingest/soccer-settle.ts` only checked `soccer_predictions`, so a match that
finished with only a *user-built* coupon leg pending (no engine prediction involved)
never tripped the on-visit settlement path and sat waiting for the once-daily cron.
Widened the gate to run a second, equally cheap bounded query (uses the existing
`soccer_coupon_legs_pending_idx`) checking for a pending `soccer_coupon_legs` row whose
match has finished, in parallel with the existing predictions check via `Promise.all`.
Still zero writes when there's nothing to grade; settlement sequence/ordering in
`settleOnVisit`/`finishSoccerSettlement` untouched.

## For Kazim
The football news sidebar was tagging the wrong club sometimes because a handful of
short club nicknames ("Sporting", "Inter", "City", "United", "Madrid") also happen to be
real words or parts of totally different clubs' names — I found and fixed exactly how
often that happened (156 news items, out of just over 2,000), wrote the code fix, and
wrote (but did not run) the database correction for the existing bad rows; as a bonus
the fix also lets ~28% of stories correctly link to their match instead of ~2% before.
Separately, closed a small gap where a bet you build yourself (not one of the engine's
picks) could sit ungraded for up to a day after the match ended instead of grading the
moment you visit the page.

## Files
- `src/lib/signals/news/soccer/rss.ts` — tagging fix (`AMBIGUOUS_CLUB_ALIASES`,
  `foldForScan`, `haveFixtureNear`, `resolveMatchId`, `loadCompetitionData`)
- `src/lib/ingest/soccer-settle.ts` — `hasSettleWork()` widened to also check pending
  `soccer_coupon_legs`
- `src/db/migrations/0038_soccer_news_team_tagging_fix.sql` — new, **not applied**
- Not touched (in scope but no changes needed): `src/lib/sports/soccer/team-match.ts`
  (read for `normalizeTeamName`/alias-cycle convention, no edits required)

## Risks
- Migration 0038 is data-only and was dry-run-verified (BEGIN/ROLLBACK) against prod,
  but it has not been applied. Until it runs, the 163 known-bad tags and the null
  `match_id`s it would backfill remain live in prod.
- The corroboration window (10 days) and match_id window (4 days) are judgment calls,
  not measured optima. They're deliberately narrow (many-days pre-buildup/reaction
  coverage exists in football media) but could theoretically miss a legitimate weak-alias
  mention published unusually far from the fixture (e.g. a long retrospective). No
  evidence this occurs in the current data; not treated as a bug.
- The migration recompute uses the stored (3-sentence-trimmed) `summary`, not the
  original untrimmed RSS description the live tagger saw — by design this makes the
  migration under-remove rather than over-remove (see Summary), but it means a small
  number of genuine ambiguous-alias mistags whose only evidence was in the trimmed-off
  tail may survive this pass. Acceptable given "when unsure, leave the row alone."

## Next
Michael (code-review) gate, then qa-test-engineer (Olga) for a Chrome pass on
`/football/news` and a football match page, then Kazim/release-engineer to apply
migration 0038 and ship.

## Human gate
Applying `src/db/migrations/0038_soccer_news_team_tagging_fix.sql` to production — a
data-mutating migration, explicitly reserved for Kazim per this task's constraints (no
DB writes, no migrations applied by the agent). Everything else in this handoff is
already implemented and verified (tsc + eslint clean on all owned files; migration
dry-run-verified via rolled-back transaction).
