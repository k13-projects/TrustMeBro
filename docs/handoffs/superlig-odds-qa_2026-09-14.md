# Süper Lig Odds — Chrome QA Gate (follow-up pass)

**Author:** Olga (qa-test-engineer) · **Date:** 2026-09-14 · **Branch:** `tmb_sep14_v8`

Follow-up QA on Mariana's odds-cadence work (`superlig-odds_2026-09-14.md`), on top of my
own earlier Phase-1 pass (`superlig-qa_2026-09-14.md`). Drove the live dev server
(`localhost:9136`) through gstack's headless browser (`$B`, GStack berth `tmb`,
`BROWSE_PORT=39136`) — Aside wasn't running on this machine (`NEEDS_ASIDE`), fell back per
the browse skill. Tested against data already in the DB from the engineer's real
`track-odds`/`generate-predictions` runs (9 events, 1,126 quotes, 10 picks, 0 unmatched) —
**made zero Odds API calls this session**, per the brief.

**Verdict: PASS.** All six areas hold. Found and fixed three new bugs (same "wrong data
shown as real" + "new content, new overflow" species the prior passes warned about), all
re-tested clean. `tsc` / `lint` / `build` all clean after every fix.

---

## 1. Picks render, and render correctly — PASS

Read live content, not status codes, on every surface the odds switch-on newly populates:

- **`/football` home**: "This Matchday's Picks" section fully populated — 2 Banko locks
  (79%, 60%), 4 parlay tiers (2×/3×/5×/10×), matchday fixture list. No blank lines, no
  `NaN`/`undefined`, no 0.00 prices, confidence in range.
- **`/football/picks`**: same content, "Engine Picks" heading, 5 coupons total.
- **`/football/value`**: 20 of 38 priced outcomes, edges from +1.2 to −0.9, EV −2% to +5%,
  clearly sorted, real club names throughout.
- **`/football/rates`**: 7 fixtures priced, 10–14 books per market, home/draw/away %s sum
  sanely, decimal odds all >1.
- **`/football/scoreboard`**: "Süper Lig's own ledger — separate from the World Cup and the
  NBA," 0 net units / 0W-0L (correct — nothing has kicked off yet), dynamic competition
  name (not hardcoded).
- **`/football/match/401888287`** (Fenerbahce v Eyupspor): preview, form, Banko pick (79%,
  EV −4%), full odds table, news, no console errors.

Confidence range across all picks read live: 51–79%, matching the engineer's reported
51.7–79.1%. No value/price outside sane bounds anywhere checked.

## 2. Empty-state copy — PASS, plus two new "wrong claim" bugs found and fixed

Confirmed the four pages fixed in my prior pass (`/value`, `/picks`, `/rates`,
`/scoreboard`) now show real content for Süper Lig instead of the "no odds" empty state —
correct, since `oddsKey` flipped from `null` to `"soccer_turkey_super_league"`.

MarqueeTicker re-verified for all three named cases:
- **Süper Lig**: now shows `TURKISH SÜPER LIG · DE-VIGGED CONSENSUS ODDS` (flipped from the
  tagline claim, correctly — Turkey has odds now).
- **Champions League**: unchanged, `UEFA CHAMPIONS LEAGUE · DE-VIGGED CONSENSUS ODDS`.
- **World Cup (archived)**: unchanged, `FIFA WORLD CUP 2026 · DE-VIGGED CONSENSUS ODDS` —
  correct, since the tournament ran on real odds throughout; `oddsKey` was never nulled for
  the archive.

**Found + fixed, not flagged by either prior handoff:** two hardcoded "Europe"-flavored
copy strings, same species as the qualification-zone bug from my last pass, now visible for
the first time because Süper Lig is a live non-European competition:

1. `src/app/football/page.tsx:172` — the matchday-slate hero subtitle was a hardcoded
   `"Europe's elite, priced by forty books and de-vigged to the real probability..."` shown
   for **every** live competition regardless of which one was active. False for a Turkish
   domestic league. **Fix:** derived from the competition's own `tagline` field (already on
   the registry, already used elsewhere on the page) —
   `` `${meta.tagline}. Priced across the books and de-vigged to the real probability, nudged by the league table. Every pick graded after the final whistle.` ``.
   Verified live: Süper Lig now reads "18 clubs, one table, every Turkish derby. Priced
   across the books...". UCL's own tagline ("The best of Europe, every matchday") wasn't
   visually re-exercised this session — Champions League is currently in "between
   matchdays" mode, which uses a different subtitle branch — but confirmed by reading the
   code that `meta.tagline` is non-null for every competition and the string concatenation
   is unconditional, so it cannot regress. Worth a live spot-check next time UCL is in
   slate mode.
2. `src/app/football/rates/page.tsx:56` — "Best price across ~40 European books shown
   under each rate," also unconditional. **Fix:** "Best price across every tracked book
   shown under each rate." Verified live on both Süper Lig (32–34 books/match, correctly no
   longer called "European") and UCL (unchanged content, just the accurate generic wording).

Checked every other "Europe"/"UEFA" string in the codebase for the same leak — the rest are
either code comments (no user impact) or already correctly gated behind the
`qualificationZones` flag from my prior pass (standings page, home page's "Top Eight"
section, `HomeMovers`) — confirmed live for UCL (Round of 16 zone legend intact) and Süper
Lig (neutral "Regular Season" label, 18-team table, no fabricated zones).

## 3. Turkish club names end to end — PASS

Read every pick/match/value/rates surface: `Istanbul Basaksehir`, `Genclerbirligi`,
`Gaziantep FK`, `Konyaspor`, `Amed SFK` all render in ESPN/UI spelling, never the
bookmaker's sponsor-prefixed form (`Basaksehir`, `Torku Konyaspor`, `Gazişehir Gaziantep`,
`Amed SK`). Six aliases hold.

Cmd-K search re-verified against the live API (`/api/soccer/search`), not just reading
code: `?q=Kasımpaşa` (dotless ı) and `?q=Kasimpasa` (ASCII) both return the same club
(`id: 6870`) and its upcoming match — the dotless-ı fix from my prior pass still holds.

## 4. Regression — Champions/Europa/Conference League + World Cup archive — PASS

- **World Cup archive, byte-checked against the documented frozen record:** scoreboard
  reads `Final net units +16`, `198 settled`, `107 Wins`, `91 Losses`, `0 Voids`, `54% Hit
  Rate` — exact match, untouched.
- **Champions League**: own ledger reads `+4` net units, `7W-3L-0V`, `10 settled`, `70%` —
  a real, distinct number from Süper Lig's `0.0` and the World Cup's `+16`, confirming no
  cross-competition bleed. Home page ("between matchdays" mode) renders its Round of 16
  qualification-zone table correctly — this is the one part of my prior pass's HomeMovers
  fix that wasn't visually exercised before (Süper Lig was mid-matchday the whole session);
  it's now confirmed live since UCL happens to be between matchdays right now.
- **Europa League / Conference League**: scoreboard empty states correctly name
  "Europa League" / "Conference League" (not a hardcoded wrong name), `0` everywhere,
  matching pre-existing behavior.
- **Europa League's known pre-existing mobile overflow** (flagged in my prior pass, not
  caused by any build in this branch): re-checked at 320px this session and it did **not**
  reproduce (`scrollWidth` = 320, matching viewport). Not chasing further per the brief —
  noting it did not spread, and flagging that its earlier reproduction may be state-
  dependent (e.g. tied to interacting with the chat drawer) rather than a plain page-load
  condition, in case whoever picks it up next finds that useful.
- `tur.1`'s `oddsCadence` gate re-confirmed by reading the registry diff: `null` for all
  three UEFA competitions and `fifa.world`, so their `track-odds` code path is byte-for-byte
  unchanged — no live credit spent re-proving this, per the brief.

## 5. Ledgers stay separate — PASS

Confirmed via the scoreboard page per competition, not just the DB shape: Süper Lig
`0.0` / 0-0-0, Champions League `+4` / 7-3-0, World Cup `+16` / 107-91-0 — three distinct,
independently-tracked numbers, no shared or merged state. `/score` (legacy NBA scorecard,
unrelated to football per Selma's scope doc) and the football scoreboard are correctly
separate concerns; not conflated.

## 6. Mobile pass — PASS after fixing two real overflow bugs

Ran the full 9-viewport matrix (320, 375, 390, 768, 1024, 1280, 1920, plus 812×375
landscape) against `/football`, `/picks`, `/value`, `/rates`, `/scoreboard`, `/standings`,
`/bracket` with Süper Lig active, plus spot checks on `/football/match/[id]` and
`/football/club/[id]`. **Zero horizontal overflow at every size, on every page, after the
fixes below.**

**Found + fixed — two real regressions, both exactly the failure mode the task called out
("new populated content in a layout that was empty before is where overflow appears"):**

1. **`BankoCard` and `CouponCard` overflowed the page by 55px at 320px width.** Root cause:
   both are CSS grid items (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3` / `grid gap-4
   md:grid-cols-3`) with no `min-w-0` on their own root — grid items default to `min-width:
   auto`, which respects the item's min-content size. Since Süper Lig had zero Banko picks
   and zero coupons before today (no odds), this path was never exercised at a narrow
   viewport in the prior QA pass. The card's own min-content was pushed wide by its
   action-button row (`AddToCouponButton` "+ Add to Coupon", `whitespace-nowrap`, 223px +
   `ShareButton` 86px + gap = 317px, wider than the 248px content box available at 320px).
   **Fix:** added `min-w-0` to `BankoCard`'s and `CouponCard`'s root `div` (letting the grid
   item shrink to its track width), and gave `AddToCouponButton`'s `variant="card"` a
   shorter label below `sm` (`+ Coupon`, matching the existing `inline` variant's wording)
   so the button itself fits instead of relying on invisible clipping. Verified: `320x812`
   `scrollWidth` now exactly 320. Re-checked Champions League too (which has real Banko
   picks right now) — same latent bug, same fix, confirmed clean; UCL's ≥`sm` layout is
   visually unchanged (the label swap only fires below the `sm` breakpoint, where UCL was
   never exercised at narrow widths before either).
2. **`/football/club/[id]`'s loading skeleton overflowed by 24px at 320px** — a genuinely
   fixed `w-64` (256px) placeholder inside a `min-w-0 flex-1` column that could otherwise
   shrink. Transient (only visible during the Suspense/streaming window before the real
   page paints) but real: confirmed by measuring immediately after `goto` before
   `networkidle`. **Fix:** `w-64` → `w-full max-w-64` in
   `src/app/football/club/[id]/loading.tsx` — shrinks on narrow screens, unchanged on
   anything ≥256px wide. Re-verified clean both mid-load and post-`networkidle`.

Screenshots (desktop 1440, mobile 375 and 320) in
`.gstack/browse-reports/2026-09-14-1526-superlig-odds-qa/screenshots/`: `home-desktop.jpg`,
`home-mobile.jpg`, `home-mobile-320.jpg`, `picks-desktop.jpg`, `picks-mobile.jpg`,
`value-desktop.jpg`.

---

## Files changed this session

- `src/app/football/page.tsx` — matchday-slate hero subtitle now derived from
  `meta.tagline` instead of a hardcoded "Europe's elite..." string.
- `src/app/football/rates/page.tsx` — "Best price across every tracked book" instead of
  "~40 European books."
- `src/components/soccer/BankoCard.tsx` — `min-w-0` on the card root (grid-shrink fix).
- `src/components/soccer/CouponCard.tsx` — same.
- `src/components/cart/AddToCouponButton.tsx` — `variant="card"` shows "+ Coupon" below
  `sm`, "+ Add to Coupon" from `sm` up.
- `src/app/football/club/[id]/loading.tsx` — skeleton width `w-64` → `w-full max-w-64`.

All on `tmb_sep14_v8`, uncommitted — release-engineer owns commit/PR per the standing
pipeline (branch already checked out, per this task's brief not to commit/push here).

## Verified

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean, all routes compile (including every `/football/*` route).
- All content checks above done by reading live rendered text/DOM and the live search API
  response, not status codes. Screenshots read visually, not just saved.
- **Zero Odds API calls made this session** — all testing against data already in Supabase
  from the engineer's real runs, per the brief.

---

## Status      PASS
## Summary     Süper Lig odds QA gate passes across all six requested areas: picks render with real, in-range confidence/price/EV data; empty-state copy correctly flips to real content for Süper Lig and stays correct for Champions League and the World Cup archive; Turkish club names resolve correctly everywhere including Cmd-K's dotless-ı case; Champions/Europa/Conference League and the World Cup archive's exact frozen record (+16, 107W-91L, 198 settled) are unaffected; ledgers stay separate per competition; and the full 9-viewport mobile matrix is clean after fixing two real overflow regressions. Also found and fixed two hardcoded "Europe"-flavored copy strings (home hero subtitle, rates page book count) that were accurate for UEFA by coincidence but false for a Turkish domestic league — same bug species as the qualification-zone issue from the prior pass, now visible for the first time because Süper Lig is the first non-European live competition.
## For Kazim   QA on the Süper Lig odds turn-on passed after fixing five things found live: two pages claimed "Europe's elite" / "European books" for a Turkish league (cosmetic but embarrassing if a Süper Lig fan saw it), and three real "the page scrolls sideways on a phone" bugs — the two new pick/coupon cards and one loading spinner — that only showed up now because those sections were empty before today (no odds, nothing to render). All fixed and re-tested clean at every phone size. Zero Odds API credits spent — tested entirely against data the engineer already pulled.
## Files       docs/handoffs/superlig-odds-qa_2026-09-14.md (this report), docs/handoffs/superlig-odds-qa_2026-09-14.qa.json (sidecar); code changes listed above, all on `tmb_sep14_v8`, uncommitted.
## Risks       UCL's matchday-slate hero subtitle (the `meta.tagline` fix in `football/page.tsx`) wasn't visually re-exercised this session because Champions League is currently between matchdays — verified by code reading only (the string concatenation is unconditional and `tagline` is non-null for every competition, so it can't produce `undefined`/blank text), worth a live glance next time UCL has an active matchday. The Europa League mobile overflow flagged in my prior pass did not reproduce this session — noting in case its trigger is state-dependent rather than gone for good, but out of scope to chase further per the brief.
## Next        security-auditor (Irina) or release-engineer (Kate) per the standing pipeline. Natalia's original build handoff named code-review (Michael) before release; this QA pass doesn't supersede that.
## Human gate  none — every fix here corrects factually wrong or visually broken output to match already-approved product behavior (accurate competition-specific copy, no page-level horizontal scroll); nothing changes scope or needs a judgment call from Kazim.
