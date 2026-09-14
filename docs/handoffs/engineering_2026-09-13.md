# Engineering handoff — Football share cards

## Status
PASS

## Summary
Built branded share cards for the football section: dynamic OG/Twitter images for
`/football/match/[id]`, and two new `/api/og/*` PNG routes for a single engine pick and an
engine coupon. Added a one-tap `ShareButton` (Web Share API on phones, clipboard-copy + toast
elsewhere) to `BankoCard` and `CouponCard`. Every image uses the given competition palette
(UCL sky-on-navy, UEL orange, UECL green, WC gold-on-black) with brand-gold `TrustMeBro`
wordmark, Barlow Condensed 700 fetched from Google Fonts at request time and cached in a
module-level promise (falls back to satori's default font if that fetch ever fails — never a
500). `tsc --noEmit` and `eslint --max-warnings=0` are clean on every file touched (the repo's
one pre-existing `tsc` error and one pre-existing `eslint` error are both in files I never
opened, from another session's in-flight work). Verified all five required id cases live
against the running dev server — finished match, upcoming match, World Cup archive match,
BANKO pick, and an engine coupon — plus WON/LOST graded picks and a 6-leg coupon, unknown-id
404s on all three routes, and the twitter-image re-export byte-for-byte matching its
opengraph-image. Found and fixed one real bug during verification: the WON/LOST corner stamp
was rendering clipped off the right edge of the canvas — repositioned it inside the frame.

## Files
- `src/lib/sports/soccer/share-queries.ts` — new; `getPredictionById`, `getEngineCouponById`
  (single-row lookups by id, any status). Deliberately separate from `queries.ts` (off-limits,
  owned by another session) — duplicates the small `TEAM_COLS`/`PREDICTION_SELECT` shapes that
  file keeps module-private, per the task's own instruction to copy rather than edit
- `src/lib/og/font.ts` — new; `loadShareFonts()`, fetches Barlow Condensed 700 as raw TTF via
  the Google-Fonts-serves-ttf-to-non-browser-UAs trick, cached in a module-level promise,
  returns `[]` (safe no-op for `ImageResponse`) on any failure
- `src/lib/og/theme.ts` — new; `SHARE_THEME` (per-`CompetitionTheme` accent/background hexes,
  as specified in the brief), `BRAND_GOLD`, `SHARE_WIDTH`/`SHARE_HEIGHT` (1200×630)
- `src/lib/og/blocks.tsx` — new; shared JSX pieces reused by all four renders —
  `CompetitionStrip`, `CrestBadge` (with initials fallback for a missing crest/flag),
  `ConfidenceRing`, `BankoBadge`, `ResultStamp`, `Footer`/`Wordmark`
- `src/app/football/match/[id]/opengraph-image.tsx` — new; 1200×630 match card (competition
  strip + round via `getRounds`/`roundLabelFor`, both crests, score/FT or live clock or LA
  kickoff date+time, venue, top pending pick as "Engine: … · …% · odds"). Unknown/invalid id →
  `404` response. **Did not touch `page.tsx`** — see the `generateMetadata` note below
- `src/app/football/match/[id]/twitter-image.tsx` — new; re-exports the opengraph-image's
  `default`/`alt`/`size`/`contentType` verbatim, per the task's instruction
- `src/app/api/og/pick/[id]/route.tsx` — new; 1200×630 pick card (matchup, `sideLabel`,
  confidence ring, best price, BANKO badge, WON/LOST/VOID stamp on graded picks). `404` on
  unknown id
- `src/app/api/og/coupon/[id]/route.tsx` — new; 1200×630 coupon card (kind badge — `2×`/`3×`/
  `5×`/`10×`/`SURPRISE`, payout, hit chance, up to 6 legs with tiny crests, vertically centered
  when there are fewer than 4). `404` on unknown id or an id with zero legs
- `src/components/soccer/ShareButton.tsx` — new; `"use client"`, `{url, title, text, className}`,
  `navigator.share` on phones, clipboard + `sonner` toast fallback, styled to match the existing
  `CouponShareToggle` pill
- `src/components/soccer/BankoCard.tsx` — added `ShareButton` next to `AddToCouponButton`,
  sharing `/football/match/[match_id]?pick=[id]`
- `src/components/soccer/CouponCard.tsx` — added `id="coupon-{id}"` anchor to the card root and
  a `ShareButton` sharing `/football/picks#coupon-[id]`

Untouched, exactly as instructed: `page.tsx` under `football/match`/`football/predictions`,
`LiveTracker`, `ScoreCall`, `api/soccer/*`, `queries.ts`, `settle.ts`, cron routes, `registry.ts`,
`bros/page.tsx`. (Several of those, plus `CLAUDE.md`, `date.ts`, and a `livetracker-test/` route,
show as modified/untracked in `git status` — confirmed via diff that none of it is mine; another
session is mid-edit on the match page concurrently, as the task itself flagged.)

## generateMetadata — what (if anything) to add to the match page
Nothing is required for the OG image itself to work — Next's file-convention resolution picks up
`opengraph-image.tsx`/`twitter-image.tsx` automatically for every request under
`football/match/[id]/*`, independent of `generateMetadata`. The match page's existing
`generateMetadata` only sets `title`. If whoever is editing `page.tsx` wants the share text
(not just the image) to carry match context — recommended, since WhatsApp/iMessage show the
`description` alongside the image — add:
```ts
return {
  title: `${match.home.name} v ${match.away.name} · ${meta.label} · TrustMeBro`,
  description: `${meta.fullName} — ${match.home.name} vs ${match.away.name}`,
};
```
That's the only gap; `og:image`/`twitter:image` need no explicit metadata entry at all.

## Verified (live, against the running dev server on :9136)
- Finished match `401915452` (AEK Athens 1–0 LASK, UCL) — score, FT, venue, gold-free UCL navy
- Upcoming match `401915594` (Ararat-Armenia v Sparta Prague, UEL) — LA kickoff date+time,
  engine pick pill
- World Cup archive `760517` (Spain 1–0 Argentina, the final) — flags, gold-on-black WC theme
- `twitter-image` for `401915452` — byte-identical to its `opengraph-image` (64142 bytes both)
- BANKO pick `3920fce5-ade3-4fdc-a894-4a0e0f9dfb99` (Bayer Leverkusen win, 81%) — badge + ring
- Graded picks: `18948121-…` (WON, gold WC pick) and `8d49a147-…` (LOST, also BANKO) — stamp
  reads cleanly, doesn't collide with the BANKO badge
- Engine coupon `f48bb23b-…` (2×, 3 legs) and `75d7b7f6-…` (10×, 6 legs) — both leg counts lay
  out cleanly
- Unknown ids on all three routes (`999999999`, two all-zero UUIDs) → clean `404`, 9-byte body
- Sizes: 57–84 KB per image (cap was ~300 KB) · warm timings 0.26–1.1s (target ~1.5s); the one
  ~2.5s hit on each route was Turbopack's on-demand compile of the new file, not steady state
- Full-size PNGs for every case above saved under
  `/private/tmp/claude-501/-Users-k13-Desktop-PROJECTS-TrustMeBro/046cd513-bc69-4d62-bc5a-830cb0a2999e/scratchpad/agentF/`

## Risks
- The Barlow Condensed fetch depends on `fonts.googleapis.com` being reachable from wherever
  this deploys (Vercel functions can reach it fine; a fully offline/air-gapped preview cannot).
  Degrades safely to satori's default sans if it can't — never a broken image, just a slightly
  off-brand one — but worth knowing before assuming every card looks identical everywhere.
- `getRounds()` (needed for the match card's round caption) fetches up to 1000 rows per request;
  fine at today's volume, but it's the same cost profile already accepted elsewhere in this
  codebase (the match page uses it too), not something I introduced as new risk.
- One data-quality oddity noticed, not caused by this work: the World Cup final's engine pick
  (`760517`) is still `status = pending` despite the match being finished — the card still
  renders correctly either way, but it means that match's OG "Engine:" line will keep showing
  an ungraded pick until settlement catches up.

## Next
qa-test-engineer (Olga) — via the Michael code-review gate first, per the standing pipeline.

## Human gate
none
