# TrustMeBro — Runtime Network QA (empirical measurement pass)

**Date:** 2026-09-14
**Target:** `https://tmb.erenunur.com` (production, Vercel Hobby)
**Method:** Playwright/Chromium driving the real production site, network + console events captured programmatically (equivalent to reading the DevTools Network panel, but exact — every request/response/header logged with a timestamp). No fixes applied — measurement only, per instructions.
**Scope note:** this is the runtime/network picture. A parallel session is auditing the code itself; this document is the empirical counterpart.

---

## 0. Important caveats — read before the tables

- **No live match existed during this test window.** Champions League Matchday 1 finished; Matchday 2 is 28 days out (2026-10-13). This means the client-side polling components (`LiveTracker`, `LiveMatch`) were in their **guarded, non-polling** state (`match.state === "post"`) for every test. I measured **zero polling in that state** — a real, positive result — but I could **not** directly observe the 20s/25s in-play polling cadence firing, and could not directly observe the moment a match flips from "in" to "post" and polling stops. Those numbers are stated below as **code-derived**, not measured, and are flagged as such every time they appear.
- **Tab-backgrounding test was inconclusive.** I opened a second tab and brought it to front (`page.bringToFront()`) to push the match page into the background, the standard way to test this. `document.visibilityState` on the original tab still read `"visible"` in both the "foreground" and "backgrounded" windows — Playwright/headless Chromium didn't flip it the way a real two-window desktop session would. So I cannot empirically confirm or deny background-tab throttling behavior for these timers. This needs either a headed-browser check with real OS focus, or server-side request logs during an actual live match.
- **The browser network panel cannot see server-to-server calls.** `maybeRefresh()` calls to ESPN / The Odds API / NewsAPI happen inside the Vercel function, never cross the browser, and are fired via `after()` (non-blocking). So "does reloading trigger repeated upstream fetches" can only be inferred from response latency + the code's own staleness gate — not observed directly in DevTools. I say so explicitly below rather than presenting an inference as an observation.
- **Byte totals via `Content-Length` header undercount.** Most JS/CSS/HTML responses ship without a `Content-Length` header (HTTP/2 streamed/chunked) — of 82 responses on `/football`, only 46 carried one. Where I needed an accurate figure I re-measured using Playwright's `request.sizes()` (actual wire bytes from Chromium's network stack), noted per-row below.

---

## 1. Per-page request count (measured, on load)

| Page | Resolves to | Load time | Total requests | XHR/fetch requests | Response bytes (accurate) |
|---|---|---|---|---|---|
| `/` | **307 → `/football`** (proxy.ts routes anonymous visitors to football by default) | 3.0s | 83 | 15 | ~2.0MB (Content-Length sum, undercounts) |
| `/football` | itself | 5.1s | 78–82 | 12–15 | **2.46MB** (measured via `request.sizes()`) |
| `/football/match/401915436` (finished match — see caveat above, no live match available) | itself | 2.0s | 64 | 14 | not re-measured; same order of magnitude |
| `/football/value` | not separately tested this pass (time-boxed per coordinator; low risk — reads DB only, no `maybeRefresh`, see §2) | — | — | — | — |
| `/football/news` | itself | 5.3s | 85 | 23 | ~1.48MB (Content-Length sum, undercounts) |
| `/score` | **redirects to `/scorecard`** (this route is a pure `redirect()` — `/score` itself has no content) | 5.2s | 101 | 28 | ~0.49MB (Content-Length sum, undercounts) |
| `/bros` | not separately tested this pass (time-boxed; code review shows it's a plain server-rendered page, `revalidate = 60`, no client polling) | — | — | — | — |

**The real finding here isn't API quota — it's same-origin over-prefetching.** Every one of those XHR/fetch counts (12–28 per page) is **not** a call to ESPN/Odds/Supabase — it's Next.js App Router's automatic `<Link>` prefetch, firing a `GET /<route>?_rsc=<hash>` for **every nav link and filter chip visible on the page**, twice per page load (two different `_rsc` hashes fired within the same load, back to back — looks like the prefetch scan runs once on first paint and again after hydration settles). On `/football/news` specifically, this means all 8 team-filter chips get prefetched **twice each** (16 of the 23 XHR/fetch calls) even though the visitor hasn't touched a filter. On `/scorecard`, the same pattern prefetches `/football/value`, `/football/scoreboard`, `/football/glossary`, `/history`, `/results`, `/login`, `/football/news`, `/football` — twice.

This doesn't burn the third-party free-tier quotas the owner is worried about (Odds API, balldontlie, NewsAPI aren't hit by client-side prefetch), **but** every one of those prefetched routes under `/football/*` carries `export const dynamic = "force-dynamic"` (confirmed in `src/app/football/layout.tsx`, `.../value/page.tsx`, `.../news/page.tsx`) — meaning each prefetch is a full server-side dynamic render on Vercel, not a cached HTML hit. A single pageview is quietly triggering on the order of 6–10 *extra* dynamic SSR renders of routes the visitor never asked for. That's a Vercel compute/invocation cost multiplier, worth a look by whoever owns the code audit — not something I'm fixing here per the measurement-only instruction.

---

## 2. Polling — the key question, answered with real numbers

**Measured: on every page tested, sitting idle produced zero XHR/fetch requests.**

| Page | Idle window | XHR/fetch fired during idle | Verdict |
|---|---|---|---|
| `/` → `/football` | 180s (3:00) | **0** | No idle polling observed |
| `/football` | 90s | **0** | No idle polling observed |
| `/football/news` | 90s | **0** | No idle polling observed |
| `/scorecard` (via `/score`) | 90s | **0** | No idle polling observed |
| `/football/match/401915436` (finished match) | 45s foreground + 45s "backgrounded" (see caveat) | **0** in both windows | No idle polling observed — but see caveat, this match was already finished, not a live-in-play case |

**No SWR `refreshInterval` exists anywhere in the codebase** (confirmed by `grep -rn "refreshInterval"` across `src/` — zero hits). The two SWR call sites found (`GuestPicker` → `/api/guest/recent`, `CouponDrawer` → `/api/payout-multipliers`) both fetch once on mount with no interval; `CouponDrawer`'s key is `cart.isOpen ? "/api/payout-multipliers" : null`, i.e. it doesn't even fetch unless the coupon drawer is open, and sets `revalidateOnFocus: false`. Neither is mounted where it would fire on every page.

**The only client-side polling in the entire codebase is two components, both correctly gated by match state:**

| Component | Endpoint polled | Interval (code-derived — NOT observed, no live match was available to test) | Guard |
|---|---|---|---|
| `LiveTracker.tsx` (match page) | `GET /api/soccer/matches/[id]/live` | `setInterval(tick, 20_000)` — every 20s | Only runs the effect if `snap.match.state === "in"` OR within 20 min of kickoff (`NEAR_KICKOFF_MS`); returns early (no interval set) if `finished` or `state === "post"`. On a state-changing tick, the effect's own dependency array (`snap.match.state`, `snap.match.finished`) re-runs and re-evaluates the guard, so a match going live→finished mid-poll does stop the interval on its next re-render — this is a code-read, not something I watched happen live. |
| `LiveMatch.tsx` (home page / match-row banners, e.g. every live row on `/football`'s matchday view) | `GET /api/soccer/live?competition=...` | `setInterval(tick, 25_000)` — every 25s, **per visible live match row** | Same shape: only polls while `state === "in"` or within a 20-min pre-kickoff / 30-min post-kickoff window. |

**Neither component checks `document.visibilityState` or listens for `visibilitychange`.** There is no code-level exemption for a backgrounded tab — if a match is live and the tab is put in the background, the app itself does nothing to pause the interval. Whether it actually keeps firing depends on the browser's own background-tab timer throttling (Chrome throttles `setInterval` in hidden tabs, typically to ~1/min after ~5 minutes hidden) — that's browser behavior, not app behavior, and I could not get Playwright to trigger real hidden-tab throttling to confirm it empirically (see caveat above). **This is worth a manual check during an actual live matchday**: open a real live match page in a real Chrome tab, background it for 5+ minutes, and watch the Network panel — that's the only way to settle this for certain.

**Bottom line on polling:** at steady state (no live match, which is most of the time given Champions League plays roughly one matchday per week), the app makes **zero** recurring client requests. During a live match, code says up to N×25s (home page, N = number of concurrently live rows shown) + 1×20s (an open match page) — not observed directly this pass, flagged as code-derived.

---

## 3. Repeat-visit / refresh behavior (measured)

Reloaded `/football` and `/football/news` 5× each in quick succession, watching response timing and headers:

| Page | Reload 1 | Reload 2 | Reload 3 | Reload 4 | Reload 5 |
|---|---|---|---|---|---|
| `/football` | 5.84s | 2.46s | 1.92s | 1.67s | 2.11s |
| `/football/news` | 2.72s | 2.70s | 2.79s | 2.98s | 1.87s |

No reload spiked dramatically relative to the others (no 10×-slower outlier that would suggest an upstream ESPN/Odds/NewsAPI call blocking the response on some reloads and not others). This is **consistent with** — but does not directly prove — the code's `maybeRefresh()` design: a single-flight, DB-row-locked, staleness-windowed background refresh (`src/lib/ingest/refresh.ts`) fired via Next's `after()`, which by design runs *after* the response ships and therefore wouldn't show up as response latency either way. `/football` and `/football/news` gate their upstream pulls at 2 minutes and 30 minutes respectively (`staleAfterMs`), so hammering refresh within that window should trigger at most one background upstream pull, not five. **To actually prove this** (rather than infer it from timing), someone needs to check Vercel function logs or the `ingest_state` table's `last_run_at` column during a reload burst — that's server-side visibility the browser network panel doesn't have, and outside what I could do from Chrome alone.

`/football/value` was not included in the reload burst (time-boxed); code review shows it does no `maybeRefresh()` call at all — it only reads `getSoccerRates`/`getMatchesBetween` from the DB, so reload can't trigger an upstream call there regardless.

---

## 4. Cache headers (measured)

| Response type | Example | `cache-control` | `x-vercel-cache` |
|---|---|---|---|
| HTML document, every page tested (`/football`, `/football/news`, `/scorecard`, match page) | main document | `private, no-cache, no-store, max-age=0, must-revalidate` | `MISS` — **every single time, all 5 reloads, both pages** |
| Static JS/CSS chunks, fonts (`/_next/static/...`) | woff2, css, js chunks | `public, max-age=31536000, immutable` | `HIT` |
| `/api/soccer/matches/[id]/live`, `/api/soccer/live`, `/api/soccer/predictions` | live/poll endpoints | `no-store` (explicit in route code) | n/a |

**No HTML document ever showed `x-vercel-cache: HIT` in this pass — not once, across 15 reloads total.** This traces directly to `export const dynamic = "force-dynamic"` on the football layout and every football page (`layout.tsx`, `value/page.tsx`, `news/page.tsx`, plus `revalidate` exports on others that are moot once a parent forces dynamic rendering). Every single page view is a full origin compute, never served from Vercel's edge cache, regardless of the page-level `export const revalidate = 30/60` values that suggest ISR is in play — those numbers currently do nothing for the HTML shell. This is a real, measured cost driver on Vercel Hobby (function invocations, not the third-party API quota) and is worth flagging to whoever's doing the code-side audit — I have not touched it, per the measurement-only brief.

The `no-store` on the live-polling API routes is correct and intentional (a cached "live" score would be actively wrong) — that part of the architecture is doing what it should.

---

## 5. Console / errors (measured)

Zero console errors, zero console warnings, zero `pageerror` events, and zero `requestfailed` events across every page tested (load + idle windows). No 429s, no retry loops, no broken requests observed in this pass.

---

## Ranked list — anything that fires more than it needs to

1. **Same-origin RSC prefetch firing twice per page load, hitting `force-dynamic` routes** (§1). Not a third-party quota risk, but 12–28 extra same-origin requests and 6–10 extra full SSR renders per pageview is the single biggest "more requests than it needs" finding of this pass. Real, measured, on every page tested.
2. **Every `/football/*` HTML document is `x-vercel-cache: MISS` on every request** (§4) — `force-dynamic` disables edge caching entirely for the page shell; the `revalidate` exports on individual pages are currently inert underneath it. Measured across 15 reloads, zero exceptions.
3. **`LiveTracker` / `LiveMatch` polling (20s / 25s) has no `visibilitychange` guard** (§2) — code-confirmed gap, not empirically fireable this pass since no match was live. Low urgency given matches are infrequent, but worth confirming on a real live matchday whether Chrome's own background throttling is enough or whether this should pause explicitly.
4. **`maybeRefresh()`'s actual upstream-call suppression under reload pressure is architecturally sound but not directly observed** (§3) — the DB-lock single-flight design should prevent quota burn, but proving it needs server logs, not the browser network panel.

## What did NOT show a problem
- No `refreshInterval`/polling anywhere outside the two known live-match components.
- No idle page fired a single background request in any of the five idle windows tested (one at 180s, four at 90s, plus a 45+45s split).
- No console errors, no failed requests, no 429s.
- `/football/value` and `/football/news` read-heavy pages don't call upstream providers on every visit — gated by DB reads or a 30-minute staleness window.
- Response times under repeated reload were stable, no outlier suggesting an unthrottled upstream call.

---

## Artifacts

- Screenshots (desktop, load + post-idle) — scratchpad, not committed to the repo:
  - `/private/tmp/claude-501/-Users-k13-Desktop-PROJECTS-TrustMeBro/693433ee-6ebd-4bbb-80cb-002855b51f7e/scratchpad/netqa/out/home-desktop-load.png`, `home-desktop-after-idle.png`, `football-home-desktop-load.png`
  - `/private/tmp/claude-501/-Users-k13-Desktop-PROJECTS-TrustMeBro/693433ee-6ebd-4bbb-80cb-002855b51f7e/scratchpad/netqa/out2/football-home-load.png`, `football-home-after-idle.png`, `football-news-load.png`, `football-news-after-idle.png`, `football-match-load.png`, `score-load.png`, `score-after-idle.png`
- Raw event logs (full request/response/console JSON, one file per run):
  - `.../scratchpad/netqa/out/results.partial.json` (run 1 — home page complete with full 180s idle window before the run was interrupted mid-way through page 2)
  - `.../scratchpad/netqa/out2/results.json` (run 2 — complete: `/football`, `/football/news`, `/scorecard`, match-page visibility split, reload bursts)
- Both are in the session scratchpad (not the repo) since this is a measurement pass, not a deliverable to ship.

---

## Status      NEEDS-REVIEW
## Summary     Measured runtime network behavior on the live production site (Playwright against real Chromium, not code reading). Zero idle polling observed on any page in this window because no Champions League match was live during testing — the 20s/25s poll intervals in `LiveTracker`/`LiveMatch` are code-derived, not observed, and are clearly labeled as such throughout. The bigger, actually-measured finding: Next.js auto-prefetches every visible nav link twice per pageview, and because the football routes are `force-dynamic`, that's 6–10 extra full SSR renders and zero edge-cache hits (`x-vercel-cache: MISS` on every HTML document, all 15 reload attempts) per pageview — a real compute-cost driver, though not the third-party API quota the owner asked about. No console errors, no failed requests, no 429s. Two test limitations are flagged rather than glossed over: Playwright couldn't force a true backgrounded-tab visibility state, and the browser can't see server-to-server upstream calls at all.
## For Kazim   The app itself checked out clean on live network traffic — no runaway polling, no console errors, nothing hammering the free-tier APIs while sitting idle — but I couldn't test the one thing you were most worried about directly, because there's no live Champions League match until October 13; what I did find is the site quietly re-renders 6-10 pages nobody asked for on every single pageview, which costs Vercel compute (not your API quota) and is worth a look.
## Files       Report: /Users/k13/Desktop/PROJECTS/TrustMeBro/docs/handoffs/qa-runtime-network_2026-09-14.md · Code read (no edits): src/components/soccer/LiveTracker.tsx, src/components/soccer/LiveMatch.tsx, src/lib/ingest/refresh.ts, src/app/football/layout.tsx, src/app/football/value/page.tsx, src/app/football/news/page.tsx, src/app/score/page.tsx, src/proxy.ts, next.config.ts
## Risks       (1) Live-match poll cadence and background-tab behavior remain unverified empirically — recommend a manual live-matchday check. (2) force-dynamic + auto-prefetch compute cost was found but not sized in dollars/invocations — recommend the code-auditing agent quantify it. (3) maybeRefresh's quota-safety under reload pressure is inferred from architecture + stable response timing, not proven from server logs.
## Next        security-auditor (Irina) for the parallel code-side audit to cross-reference these findings, or release-engineer (Kate) if the owner wants to ship a fix for the force-dynamic/prefetch cost first.
## Human gate  none — this was measurement only, no changes made, nothing irreversible.
