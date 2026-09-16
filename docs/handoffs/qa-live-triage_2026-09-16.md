# QA Live Triage — tmb.k13projects.com — 2026-09-16

Report-only pass (no fixes applied, no commits). Anonymous visitor, desktop
1440 + mobile 390 (iPhone). Driver: gstack headless browser ($B) on the
project's pinned berth (`CHROMIUM_PROFILE=~/.gstack/berths/tmb`,
`BROWSE_PORT=39136`); Aside was not installed in this environment, so the
documented fallback path was used per `qa-only` skill instructions.

Screenshots: `/private/tmp/claude-501/-Users-k13-Desktop-PROJECTS-TrustMeBro/9e62fb5e-0b4e-45b4-80c7-b5748503c145/scratchpad/qa/`

## Findings

### P1 — Floating action buttons ("My Coupon" / "Ask Bro") overlap real content
Two fixed-position launchers stack bottom-right on every page:
`src/components/chat/ChatLauncher.tsx:35-36` (`fixed bottom-[4.75rem] md:bottom-6 right-6`)
and `src/components/cart/CouponDrawerLauncher.tsx:38` (`fixed bottom-[8.25rem] md:bottom-20 right-5`).
They sit on top of scrolled content instead of reserving a gutter, so whatever
lands under their fixed screen position becomes unreadable:
- **Mobile, `/score`** — the "PENDING" stat tile is almost entirely hidden
  behind both buttons on first paint (no scrolling needed to trigger it).
  Screenshot: `11-score-mobile.png`.
- **Mobile, match pages** — the live win-probability "0%" readout and the
  momentum row are covered on both the upcoming and finished match pages.
  Screenshots: `06-match-upcoming-mobile.png`, `06-match-finished-mobile.png`.
- **Desktop, `/football/bracket`** — "My Coupon" sits directly on the
  Play-offs column, obscuring the Fenerbahce v Lyon score. Screenshot:
  `07-bracket-desktop.png`.
- **Mobile, home / `/bros`** — hero body copy and the "Call the Scores →"
  link are partially covered. Screenshots: `02-football-home-mobile-viewport.png`,
  `11-bros-mobile.png`.
This is a layout/z-index problem, not a data problem — worth a real fix pass
(reserve bottom padding on affected sections, or reposition the stack) rather
than a one-off patch.

### P2 — Empty "Lineups" section reads as broken, not as an honest empty state
`src/app/football/match/[id]/page.tsx:566-578` — `LineupsSection` always
renders the `<h2>Lineups</h2>` heading, but each team block
(`if (!lineup || lineup.players.length === 0) return null;`) silently
disappears when no lineup is posted yet. On an upcoming fixture (tested:
Lens v Sporting CP, `/football/match/401915418`) the result is a bare
"LINEUPS" heading with nothing under it — no "confirmed near kickoff"
message, unlike the Odds/Engine sections on the same page which do state
their empty condition. Screenshot: `04-match-upcoming-desktop.png`. This is
exactly the empty-state gap the house QA checklist calls out.

### P2 — Archived competition still shows a pulsing "live" badge
`src/components/site/Hero.tsx:265-295` (`StatLedgerPanel`), called
unconditionally at line 209 — the small "● live" pulse in the stat-tile card
footer has no gate on competition status. On the World Cup Archive page
(header correctly reads "ARCHIVED RECORD" / "TOURNAMENT COMPLETE") the same
card still shows a pulsing green "live" dot, directly contradicting the
header copy one screen above it. Screenshot: `03-football-worldcup-desktop.png`.

### P2 — `/login` still brands itself "TrustMeBro · NBA"
`src/app/login/page.tsx:85` hardcodes the eyebrow `TrustMeBro · NBA`. Football
is the live default sport (NBA is in light-mode/off-season per
`NBA_LIGHT_MODE`), so this is stale branding a fresh visitor sees on the
sign-in wall. Screenshots: `09-login-desktop.png`, `11-login-mobile.png`.

### P3 — Dev hygiene: stray duplicate files in the repo
`src/components/site/TimeZoneToggle 2.tsx`, `LocalTime 2.tsx`,
`src/components/soccer/ScoreCall 2.tsx`, `MyClubsStrip 2.tsx` — " 2"-suffixed
duplicates sitting alongside their real counterparts (not imported anywhere
checked). Looks like a copy/merge artifact, not a live-site bug, but worth a
cleanup pass so it doesn't get picked up by accident.

### Verified NOT a bug — footer timezone toggle
`TimeZoneToggle` (`src/components/site/TimeZoneToggle.tsx`) only renders its
switch buttons when the browser's detected zone differs from
`SITE_TIMEZONE` (`America/Los_Angeles`). The test browser's system zone is
Pacific (`date +%Z` → PDT), so `sameZone` is true and the buttons correctly
stay hidden — the toggle is implemented and reload-based, just not visible
from an LA-zoned browser. No action needed.

## What's working well
- Zero console errors and zero 4xx/5xx network responses across every page
  tested (home, both match types, value/predictions/bracket/clubs/club
  detail/news/glossary, bros/score/history/login), desktop and mobile.
- Competition switcher (`CompetitionBar`) re-themes correctly per competition
  (UCL navy, UEL orange, UECL green, Süper Lig red, World Cup gold), stays on
  `/football` for every switch, and each tab loads real fixture/table/news
  data — no empty shells.
- Cmd-K search works well, including **Turkish dotless-ı folding**:
  "Kasımpaşa" correctly returns the club and its fixtures.
  Screenshots: `12-search-gala.png`, `13-search-kasimpasa.png`.
- Finished match page (`/football/match/401915449`, Dortmund 3–2 Villarreal)
  is a genuinely strong page: live commentary feed, full lineups incl.
  substitutes, match stats, odds-movement placeholder, all rendered cleanly.
- No horizontal overflow found on any page at 390px.
- `/history` shows a clean, friendly anonymous sign-in gate rather than an
  error or blank page.
- No banned palette colors (purple/violet/indigo) spotted outside club crests
  on any competition theme.
- Empty states on `/football/value` ("Prices load in the days before a
  matchday") and Odds on match pages ("No priced markets yet — odds populate
  the day or so before kickoff") are honest and well-written — the Lineups
  gap above is the exception, not the pattern.

## Status      NEEDS-REVIEW
## Summary     Report-only Chrome QA pass on the live TrustMeBro football
##             site, anonymous visitor, desktop + mobile. No console errors,
##             no failed requests, no overflow, competition switching and
##             Turkish-aware search both work. Four real findings: floating
##             CTA buttons overlap content site-wide (worst on mobile
##             /score), an empty Lineups section with no "not yet" message,
##             an always-on "live" badge on the archived World Cup page, and
##             stale "· NBA" branding on /login.
## For Kazim   Olga tested the live football site on phone and desktop as a
##             regular visitor: nothing is broken or throwing errors, but the
##             floating "My Coupon"/"Ask Bro" buttons cover real numbers on a
##             few screens (worst on the score page on phone), an upcoming
##             match shows an empty "Lineups" heading with nothing under it,
##             the archived World Cup page still shows a "live" dot, and the
##             sign-in page still says "NBA" even though football is the
##             main sport now — all fixable, nothing urgent enough to take
##             the site down.
## Files       docs/handoffs/qa-live-triage_2026-09-16.md (this report)
##             Screenshots: /private/tmp/claude-501/-Users-k13-Desktop-PROJECTS-TrustMeBro/9e62fb5e-0b4e-45b4-80c7-b5748503c145/scratchpad/qa/
##             No source files edited — report-only per task scope.
## Risks       None of the four findings are P0/site-breaking; all are
##             cosmetic/UX. The floating-button overlap is the one with the
##             broadest surface (recurs on ~6 of the pages tested) and is
##             the one most worth prioritizing first.
## Next        frontend-engineer (Natalia) to fix the four findings above,
##             then Olga re-tests the same pages before this is called
##             closed under the two-agent Chrome QA gate.
## Human gate  none — all four findings are routine UI fixes, no scope or
##             money decisions involved.
