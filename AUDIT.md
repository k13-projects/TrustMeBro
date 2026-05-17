# TrustMeBro — Audit & Benchmarks

**Date:** 2026-05-17 · **Branch:** `tmb_may17_v6` · **Prod:** https://tmb.erenunur.com
**Stack:** Next.js 16.2.6 (Turbopack) · React 19.2.4 · Tailwind v4 · Supabase · Vercel
**Auditor:** Claude Opus 4.7 — full dynamic pass (build · typecheck · ESLint · npm audit · npm outdated · knip · depcheck · Lighthouse mobile × 5 routes · prod headers · static SQL/source greps)

---

## 1 · Scorecard

| Bucket | Grade | One-line takeaway |
|---|---|---|
| Code health | **B** | TS strict, knip-clean, 0 unsafe casts — but 5 ESLint errors + 0 tests + 0 CI |
| **Perf** | **D** | **LCP 10–15s on every route**, **CLS 0.738 on `/score`**, `/players` ships **12.7 MB** |
| Security | **B+** | npm audit 2 moderate, 0 high/crit · RLS full coverage · **no CSP / X-Frame-Options / Referrer-Policy** · 0 rate limits on user APIs |
| Database (static) | **A−** | 18/18 tables RLS-on · 32 policies · service-role gated · live Supabase advisors **not run** (MCP on wrong account) |
| Cron / infra | **C** | All 6 endpoints have `assertCronAuth` · `seed-roster` is on disk but **not in `vercel.json`** · Vercel runtime logs **not accessible** (MCP on wrong account) |
| Accessibility | **B+** | Lighthouse a11y 99–100 · skip-link present · 32 aria-label · 1 ESLint a11y-ish error |
| **SEO** | **D** | **0 of 18 pages export `metadata`** · **no** robots.ts / sitemap.ts / opengraph-image / favicon / viewport / themeColor / OG |
| UI palette | **A** | 0 banned-palette violations · emerald used 24× for positive-delta · only minor hex-token drift |

> **Headline:** the engine, schema, and code style are healthy. **Performance + SEO are the two failing report cards** — fixing those unlocks both UX and discoverability. Security is solid at the data layer but thin at the edge (headers, rate limits).

---

## 2 · Benchmarks

### 2.1 Build & static analysis

| Metric | Value | Target |
|---|---|---|
| `next build` result | ✓ success in **5.2s** compile + 4.5s tsc + 246ms SSG | success |
| Routes built | 18 dynamic + 1 static (`/icon.png`) + 1 proxy middleware | n/a |
| TypeScript strict | `"strict": true` ✓ | on |
| `tsc --noEmit` errors | 6 — **all from stale macOS Finder dup files** in [.next/types/](.next/types/) (`cache-life.d 2.ts`, `routes.d 2.ts`, `validator 2.ts`). Build itself uses real `.d.ts` files and passes. | 0 real |
| ESLint errors / warnings | **5 errors, 1 warning** — see §4.P1 | 0 / 0 |
| `as any` / `:any` density | 1 hit, and it's a code comment in [src/components/site/CountUp.tsx:26](src/components/site/CountUp.tsx#L26) — **0 real unsafe casts** | 0 |
| `@ts-ignore` | 0 | 0 |
| knip unused exports/files/deps | **0 / 0 / 0** (fully clean) | 0 |
| depcheck unused deps | `shadcn` (CLI, false positive) · `tw-animate-css` (imported in [src/app/globals.css](src/app/globals.css), false positive) | 0 |
| depcheck unused devDeps | `@tailwindcss/postcss`, `@types/node`, `@types/pg`, `@types/react-dom`, `tailwindcss` — all framework/types (false positives) | 0 |
| Test files | **0** | ≥1 per critical module |
| CI workflows in `.github/` | **0** | ≥1 |
| package.json scripts | `dev`, `build`, `start`, `lint` only — **no `typecheck`, no `test`, no `analyze`** | all 4 present |
| Total deps | 526 prod · 292 dev · 853 total | n/a |

### 2.2 Lighthouse — mobile, prod, no throttling override

| Route | Perf | A11y | BP | SEO | LCP | CLS | TBT | FCP | Speed Index |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | **50** | 100 | 100 | 100 | **10.6 s** | 0 | 690 ms | 1.6 s | 7.0 s |
| `/score` | **45** | 100 | 100 | 100 | **15.3 s** | **0.738** | 90 ms | 1.5 s | 6.5 s |
| `/games` | **63** | 99 | 100 | 100 | **11.4 s** | 0.118 | 10 ms | 1.8 s | 7.2 s |
| `/players` | **60** | 99 | 100 | 100 | **14.9 s** | 0 | 270 ms | 1.6 s | 8.8 s |
| `/bros` | **72** | 100 | 100 | 100 | **11.6 s** | 0 | 20 ms | 1.4 s | 4.8 s |
| **Target** | **≥90** | ≥95 | ≥95 | ≥90 | **< 2.5 s** | **< 0.1** | < 200 ms | < 1.8 s | < 3.4 s |

**Top opportunities reported by Lighthouse (ms savings):**

| Route | #1 cost | #2 cost | #3 cost |
|---|---|---|---|
| `/` | total-byte-weight **5.2 MB** | dom-size 5.6s | mainthread 2.6s |
| `/score` | **mainthread 25.3s** | total-byte-weight 5.2 MB | dom-size 7.0s |
| `/games` | total-byte-weight 2.0 MB | mainthread 1.0s | unused-JS 580ms |
| `/players` | **total-byte-weight 12.7 MB** | dom-size 5.7s | mainthread 2.8s |
| `/bros` | total-byte-weight 2.1 MB | mainthread 1.1s | unused-JS 600ms |

### 2.3 Public asset weight (user-served)

| File | Size | Used? |
|---|---:|---|
| `public/Design/mascot-hero.png` | **2.1 MB** | yes — LCP image on `/` and `/auth/callback` ([src/components/site/Hero.tsx:302](src/components/site/Hero.tsx#L302), [src/components/site/Mascot.tsx:22](src/components/site/Mascot.tsx#L22)) |
| `public/logo.png` | **1.3 MB** | **NO references in `src/`** — dead asset |
| `public/Design/Logo 2.png` | 1.0 MB | yes — Mascot variant ([src/components/site/Mascot.tsx:22](src/components/site/Mascot.tsx#L22)) |
| `public/Design/logo.png` | 1.3 MB | no `src/` refs |
| 4× `public/Design/Design Vision *.jpg` | ~330 KB ea | mockup comps — not served |
| **Total `public/`** | **7.0 MB** | of which **5.7 MB lives in `public/Design/`** (mockups + assets) |

### 2.4 Dependencies

- `npm audit`: **0 critical · 0 high · 2 moderate · 0 low · 0 info** (total 2 transitive moderate issues — see [.audit-output/npm-audit.json](.audit-output/npm-audit.json))
- `npm outdated`:
  - `@google/genai` 2.2.0 → 2.3.0 (patch)
  - `@types/node` 20.x → 25.x (major — keep pinned to 20 LTS)
  - `eslint` 9.39 → 10.4 (major)
  - `react` / `react-dom` 19.2.4 → 19.2.6 (patch — safe to bump)
  - `typescript` 5.9.3 → 6.0.3 (major — wait)

### 2.5 Production response headers ([.audit-output/headers.txt](.audit-output/headers.txt))

| Header | Status |
|---|---|
| `strict-transport-security: max-age=63072000` | ✓ |
| `x-content-type-options` | ✗ **missing** |
| `x-frame-options` / CSP `frame-ancestors` | ✗ **missing** (clickjacking risk) |
| `referrer-policy` | ✗ **missing** |
| `permissions-policy` | ✗ **missing** |
| `content-security-policy` | ✗ **missing** |
| `x-powered-by: Next.js` | ✗ **exposed** (info leak) |
| `cache-control: private, no-cache, no-store, ...` on `/` | ✓ correct for personalized SSR |

### 2.6 Database (static — live MCP not on K13's account)

| Metric | Value |
|---|---:|
| Migration files | 14 (0001…0014, forward-only) |
| `CREATE TABLE` statements | 18 |
| Tables with `ENABLE ROW LEVEL SECURITY` | **18 / 18** ✓ |
| `CREATE POLICY` statements | 32 |
| `SUPABASE_SERVICE_ROLE_KEY` reads | 1 — [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts), gated by `import "server-only"` |
| `import "server-only"` modules | 10 |
| SECURITY DEFINER functions | 2 — `apply_reward`, `refresh_bro_stats` |
| Materialized views | 1 — `bro_stats` (concurrent refresh via SECURITY DEFINER) |

### 2.7 API & cron

| Metric | Value |
|---|---:|
| API routes | 20 (incl. 6 cron) |
| Cron endpoints with `assertCronAuth` Bearer check | **6 / 6** ✓ ([src/app/api/cron/_auth.ts](src/app/api/cron/_auth.ts)) |
| Cron endpoints scheduled in `vercel.json` | **5** (missing: `seed-roster` — admin-trigger-only by design? confirm) |
| Routes with Zod validation | 10 / 20 (cron + signout routes legitimately Zod-free; **`coupons/[id]/share`, `payout-multipliers`, `guest/recent`, `admin/repair-game-dates` should be reviewed**) |
| Rate limiting | **None on user-facing APIs** ([src/app/api/chat/route.ts](src/app/api/chat/route.ts), [src/app/api/coupons/route.ts](src/app/api/coupons/route.ts), [src/app/api/profile/route.ts](src/app/api/profile/route.ts), etc.). One soft in-memory throttle in [src/lib/bros/presence.ts](src/lib/bros/presence.ts) |

### 2.8 Frontend surface

| Metric | Value | Note |
|---|---:|---|
| `"use client"` files | 43 | trim where possible |
| `<img>` raw HTML | 0 | ✓ all images go through `next/image` |
| Heaviest source files | see below | split candidates |
| ARIA labels / labelledby / role / alt | 32 / 0 / 12 / 15 | adequate |
| Banned palette (`purple\|fuchsia\|violet\|indigo`) | **0 hits** ✓ | clean |
| `emerald-N` hits | 24 (positive-delta semantics, per design rule) | clean |
| Routes with `export const metadata` | 1 (root layout — title + description **only**) | rest of 18 page routes have none |
| `generateMetadata()` calls | 0 | every dynamic route is unconfigured |
| SEO files (`robots.ts`, `sitemap.ts`, `opengraph-image.*`, `favicon.*`, `manifest`) | **0 / 5** | all missing |

**Top 10 heaviest `src/` files (lines):**

| Lines | File |
|---:|---|
| 764 | [src/components/chat/ChatPanel.tsx](src/components/chat/ChatPanel.tsx) |
| 763 | [src/app/scorecard/page.tsx](src/app/scorecard/page.tsx) |
| 741 | [src/app/players/[id]/page.tsx](src/app/players/[id]/page.tsx) |
| 694 | [src/app/games/[id]/page.tsx](src/app/games/[id]/page.tsx) |
| 592 | [src/app/history/page.tsx](src/app/history/page.tsx) |
| 513 | [src/app/page.tsx](src/app/page.tsx) |
| 419 | [src/lib/sports/nba/espn.ts](src/lib/sports/nba/espn.ts) |
| 415 | [src/components/site/Hero.tsx](src/components/site/Hero.tsx) |
| 371 | [src/lib/bros/loaders.ts](src/lib/bros/loaders.ts) |
| 363 | [src/app/teams/[id]/page.tsx](src/app/teams/[id]/page.tsx) |

---

## 3 · MCP isolation (one-time finding, blocks Bucket 3 live checks)

The connected Claude.ai Supabase + Vercel MCP servers expose **only Halil's accounts** in this session:

- Supabase: org `axjiauyikyuvzvrcdtyd` ("E D I S Y N") with projects `ersgzsobvcksamtvhnrn` and `hptnkhstoehjvzhgtret`.
- Vercel: only team `halilsekeroglus-projects` (id `team_GSGEV6nCDWfOsAb8zxZu4aCS`).

Per the **GOLDEN RULE** memory + [supabase_account_isolation](/Users/k13/.claude/projects/-Users-k13-Desktop-PROJECTS-TrustMeBro/memory/supabase_account_isolation.md) + [vercel_account_isolation](/Users/k13/.claude/projects/-Users-k13-Desktop-PROJECTS-TrustMeBro/memory/vercel_account_isolation.md), we never touch Halil's accounts. **Live advisor queries (Supabase performance/security advisors), runtime log inspection (Vercel cron last-run statuses), and deployment audit are therefore skipped.** Re-run those by:

1. Disconnect Halil's Supabase + Vercel MCP servers in Claude settings.
2. Connect K13's own Supabase + Vercel accounts via OAuth.
3. Re-invoke `mcp__claude_ai_Supabase__get_advisors` (security + performance) and `mcp__claude_ai_Vercel__get_runtime_logs` per the rerun commands in §6.

---

## 4 · Findings — ranked

### P0 — ship-blocking / true regressions

**P0-1 · Performance is failing across every page (Perf 45–72; LCP 10–15s; CLS 0.738 on /score)**
- **Where:** every Lighthouse route; worst on `/score` (CLS 0.738, mainthread 25s) and `/players` (payload 12.7 MB)
- **Impact:** real users on mobile will see the page draw nothing for 10+ seconds. CLS 0.738 means the page visibly jumps 7× the WCAG/Google "good" threshold once content loads. This is the single biggest UX regression.
- **Root causes (from LH diagnostics):**
  - Huge image LCP: [public/Design/mascot-hero.png](public/Design/mascot-hero.png) (2.1 MB PNG) is the hero on `/` ([src/components/site/Hero.tsx:302](src/components/site/Hero.tsx#L302)) — fetched on every cold load, no AVIF/WebP, no responsive sizes.
  - 12.7 MB total payload on `/players` — likely shipping full season tables to the client. Move to server-side pagination or React Suspense streaming.
  - Mainthread 25s on `/score` — confirms hydration/JS heaviness; the page is 763 lines client-rendered.
  - CLS 0.738 on `/score` — the `MarqueeTicker` + late stat-injection both reflow the layout. Reserve space with explicit `min-height`.
- **Fix sketch:**
  - Re-export the hero as WebP at multiple sizes; `<Image priority sizes="…" placeholder="blur">`.
  - Convert `/players` listing to server-paginated data (use `searchParams.page` + Supabase `.range()`).
  - Audit `/score` for unnecessary `"use client"` — convert pure-display sections to RSC.
  - Reserve the marquee + stat bar height via explicit `h-12` (or whatever) wrappers to kill the CLS.

**P0-2 · No CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy headers in production**
- **Where:** [next.config.ts](next.config.ts) (or absent — add a `headers()` function)
- **Impact:** click-jacking is currently possible (anyone can iframe `tmb.erenunur.com` and overlay their UI). MIME-sniffing risk on any user-uploaded content path. No CSP means a single XSS-shaped bug compromises the whole origin.
- **Fix sketch:** add a `headers()` block to `next.config.ts` returning `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Set `poweredByHeader: false` to drop `x-powered-by`.

**P0-3 · 5 ESLint errors block clean lint (4× `react-hooks/set-state-in-effect`, 1× `react/no-unescaped-entities`)**
- **Where:**
  - [src/app/bros/onboarding/OnboardingForm.tsx:40](src/app/bros/onboarding/OnboardingForm.tsx#L40) — setState in effect
  - [src/app/bros/page.tsx:141](src/app/bros/page.tsx#L141) — `'` needs `&apos;`
  - [src/components/chat/ChatPanel.tsx:634](src/components/chat/ChatPanel.tsx#L634) — `setStarters(pickStarters())` in effect; should be `useMemo` or initializer
  - (+ 2 more `set-state-in-effect` hits in the same files; see [.audit-output/eslint.log](.audit-output/eslint.log))
- **Impact:** React 19 surfaces these as real bugs — they cause cascading re-renders that contribute to the TBT/mainthread numbers in P0-1. Fixing them likely measurably improves Lighthouse.
- **Fix sketch:** replace `useEffect(() => setX(compute()), [])` with `useState(() => compute())` initializer; escape the apostrophe.

---

### P1 — fix this sprint

**P1-1 · SEO scaffolding is fully missing**
- **Where:** root [src/app/layout.tsx:57](src/app/layout.tsx#L57) ships only `title` + `description`. 0 of 18 page routes export `metadata` or `generateMetadata`.
- **Missing files:** `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/opengraph-image.tsx`, `src/app/icon.png` (only — no apple-icon, manifest), no `metadataBase`, no `themeColor`, no `viewport`, no `openGraph`, no `twitter` card.
- **Impact:** social shares render a blank card; search-engine snippets default to the H1; no per-page titles; `/players/[id]` will show the generic root title in Google instead of "LeBron James — TrustMeBro".
- **Fix sketch:** add `metadataBase: new URL('https://tmb.erenunur.com')`, `themeColor: '#FFB800'`, `viewport`, full OG + Twitter card to root layout. Add `generateMetadata` on `[id]` routes. Create `robots.ts` and `sitemap.ts` returning dynamic player/game URLs.

**P1-2 · 1.3 MB `public/logo.png` is unused but still committed; 2.1 MB hero served unoptimized**
- **Where:** [public/logo.png](public/logo.png) (dead) · [public/Design/mascot-hero.png](public/Design/mascot-hero.png) (LCP)
- **Impact:** every clone pulls 7 MB of `public/`; the 2.1 MB hero is the actual LCP image — converting to AVIF/WebP could cut ~80% off the asset.
- **Fix sketch:** `git rm public/logo.png`. Re-export `mascot-hero` as WebP + AVIF at 1×/2× sizes, point `next/image` at the new files.

**P1-3 · Stale macOS Finder dup files in `.next/types/` poison `tsc --noEmit`**
- **Where:** [.next/types/cache-life.d 2.ts](.next/types/cache-life.d%202.ts), [.next/types/routes.d 2.ts](.next/types/routes.d%202.ts), [.next/types/validator 2.ts](.next/types/validator%202.ts) (note the literal `" 2"` in the filename — Finder copies)
- **Impact:** any future contributor running `tsc --noEmit` sees 6 spurious errors and may assume real type damage. Build itself passes.
- **Fix sketch:** add `**/* 2.ts` and `**/* 2.tsx` to [tsconfig.json](tsconfig.json) `exclude`, and to `.gitignore`. One-time: `find . -name '* 2.*' -not -path './node_modules/*' -delete`.

**P1-4 · No rate limiting on user-facing API routes**
- **Where:** [src/app/api/chat/route.ts](src/app/api/chat/route.ts) (LLM-backed — billable!), [src/app/api/coupons/route.ts](src/app/api/coupons/route.ts), [src/app/api/profile/route.ts](src/app/api/profile/route.ts), [src/app/api/bets/[id]/play/route.ts](src/app/api/bets/[id]/play/route.ts), [src/app/api/follows/route.ts](src/app/api/follows/route.ts), [src/app/api/guest/sign-in/route.ts](src/app/api/guest/sign-in/route.ts)
- **Impact:** an attacker (or bug loop) can drain the `@google/genai` quota from `/api/chat` quickly; guest-sign-in can be sprayed to create profile spam.
- **Fix sketch:** Upstash `@upstash/ratelimit` with sliding-window 10 req/min/IP on chat + 30 req/min on coupons/profile. Bonus: gate `/api/admin/*` to authenticated admins (currently they only export `GET`/`POST` with no `requester.kind` check).

**P1-5 · `seed-roster` cron endpoint exists but is not scheduled**
- **Where:** [src/app/api/cron/seed-roster/route.ts](src/app/api/cron/seed-roster/route.ts) on disk; not in [vercel.json](vercel.json)
- **Impact:** dead code if intended to run on schedule; intentional admin-trigger if not. Document either way.
- **Fix sketch:** if it's admin-triggered, rename the directory away from `cron/` (`api/admin/seed-roster/`) so the naming carries the meaning. If it's a schedule we forgot, add it to `vercel.json`.

---

### P2 — backlog

**P2-1 · No tests, no `typecheck` script, no CI**
- **Where:** [package.json](package.json) (4 scripts only); [.github/](/) empty
- **Impact:** every change ships blind. Pure-function modules in `src/lib/analysis/*` and `src/lib/scoring/*` are the easiest test wins.
- **Fix sketch:** add `vitest` + `@vitest/coverage-v8`, write 5–10 tests for `confidence.ts`, `reasoning.ts`, `bet-of-the-day.ts`, `coupons.ts`. Add `.github/workflows/ci.yml` running `tsc --noEmit`, `eslint .`, `vitest run`.

**P2-2 · Live Supabase advisors + Vercel runtime logs unaudited (MCP isolation)**
- **Where:** §3
- **Impact:** we don't know about unused indexes, missing indexes Postgres has noticed, slow-query patterns, runtime errors, function timeouts, or last-7d cron success rates.
- **Fix sketch:** swap MCP to K13's accounts and rerun. Section §3 has the commands.

**P2-3 · 6 files over 600 LOC — refactor candidates**
- **Where:** ChatPanel 764, scorecard 763, players/[id] 741, games/[id] 694, history 592, page.tsx 513
- **Impact:** quality-of-life; also helps P0-1 perf (smaller client bundles).
- **Fix sketch:** carve sub-components per logical section; extract DB-loading server components from client view; pull markdown/streaming logic out of ChatPanel.

**P2-4 · 9 API routes lack Zod input validation**
- **Where:** see §2.7 — most are legitimately bodyless (signout) or cron-only. Real gaps: [src/app/api/coupons/[id]/share/route.ts](src/app/api/coupons/[id]/share/route.ts), [src/app/api/admin/repair-game-dates/route.ts](src/app/api/admin/repair-game-dates/route.ts), [src/app/api/payout-multipliers/route.ts](src/app/api/payout-multipliers/route.ts) (GET only — fine), [src/app/api/guest/recent/route.ts](src/app/api/guest/recent/route.ts) (query params).
- **Fix sketch:** parse `searchParams` and bodies with Zod at the route boundary per CLAUDE.md convention.

---

### P3 — nice-to-have

**P3-1 · Ad-hoc hex colors duplicated across components**
- `#050508` ring-offset literal appears in [src/app/error.tsx:41,47](src/app/error.tsx#L41), [src/app/not-found.tsx:20,26](src/app/not-found.tsx#L20), [src/app/teams/page.tsx:52](src/app/teams/page.tsx#L52), [src/components/ComboCard.tsx:74](src/components/ComboCard.tsx#L74), and more. Promote to a CSS var (`--bg-canvas` or `--ring-offset`) in [src/app/globals.css](src/app/globals.css).
- Yellow gradient `linear-gradient(180deg, #FFE066 0%, #FFB800 100%)` is hand-rolled in [src/app/page.tsx:240](src/app/page.tsx#L240), [src/app/news/page.tsx:91](src/app/news/page.tsx#L91), [src/app/bros/page.tsx:49](src/app/bros/page.tsx#L49), [src/components/site/MoneyCombos.tsx:137](src/components/site/MoneyCombos.tsx#L137) — extract to a `.bg-primary-gradient` utility.

**P3-2 · Dependency lag — 6 outdated packages**
- Bump `react`/`react-dom` 19.2.4 → 19.2.6 (patch). Hold off on TS 6, ESLint 10, `@types/node` 25 majors.

**P3-3 · 1 ESLint warning — unused `filtersActive`**
- [src/app/page.tsx:173](src/app/page.tsx#L173). Delete the variable.

**P3-4 · No `aria-labelledby` usage anywhere**
- Just 0 hits; consider for sections with visible headings to compose proper accessible names.

---

## 5 · Detailed evidence per bucket

### 5.1 Code health — full ESLint output

See [.audit-output/eslint.log](.audit-output/eslint.log). Summary: **5 errors, 1 warning** (all listed in P0-3 + P3-3).

### 5.2 Perf — Lighthouse HTML report (interactive)

Open [.audit-output/lh-home.report.html](.audit-output/lh-home.report.html) in a browser for the drill-down on `/`. JSONs for all 5 routes are in `.audit-output/lh-{score,games,players,bros}` (no extension — fed via `fs.readFileSync` per §6).

### 5.3 Security — secret-leak grep

Files reading sensitive env vars (all are inside `import "server-only"` or route-handler modules — none are bundled to the client):
- [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) — `SUPABASE_SERVICE_ROLE_KEY` ✓
- [src/app/api/cron/_auth.ts](src/app/api/cron/_auth.ts) — `CRON_SECRET` ✓
- [src/app/api/cron/track-odds/route.ts](src/app/api/cron/track-odds/route.ts) — `ODDS_API_KEY` ✓
- [src/lib/signals/odds/the-odds-api.ts](src/lib/signals/odds/the-odds-api.ts) — `ODDS_API_KEY` ✓
- [src/lib/signals/news/newsapi.ts](src/lib/signals/news/newsapi.ts) — `NEWS_API_KEY` ✓
- [src/lib/sports/nba/balldontlie.ts](src/lib/sports/nba/balldontlie.ts) — `BALLDONTLIE_API_KEY` ✓

**0 leaks.** Env parity vs `.env.example`: every used key is documented; example also lists `NEXT_PUBLIC_PAYWALL_ENABLED` and `VERCEL_TOKEN` which are not currently read by `src/` (placeholder for planned features — fine).

### 5.4 Database — RLS matrix (static)

All 18 tables (`teams`, `players`, `games`, `player_game_stats`, `predictions`, `user_bets`, `system_score`, `system_score_history`, `odds_snapshots`, `signals`, `patterns`, `user_coupons`, `user_coupon_picks`, `payout_multipliers`, `guest_profiles`, `news_items`, `profiles`, `follows`) have `ENABLE ROW LEVEL SECURITY` and at least one policy. 32 `CREATE POLICY` lines across migrations. Forward-only design, idempotency baked in (partial unique index on `system_score_history.prediction_id` for settled outcomes).

### 5.5 A11y — top axe-eligible recommendations

- Add `aria-labelledby` to landmarks that contain visible headings (e.g. the players grid `<section>`).
- The `<a href="#main">Skip to content</a>` link in [src/app/layout.tsx:85](src/app/layout.tsx#L85) is correct — keep it.
- All buttons sampled have either text content or `aria-label` (32 total). No icon-only-button regressions detected.
- 1 ESLint a11y-adjacent error (`react/no-unescaped-entities`) covered in P0-3.

---

## 6 · Reproduce the audit

```bash
# from repo root
mkdir -p .audit-output

# Bucket 1 — code health
npx next build 2>&1 | tee .audit-output/build.log
npx tsc --noEmit 2>&1 | tee .audit-output/tsc.log
npx eslint . --max-warnings=0 2>&1 | tee .audit-output/eslint.log
npx -y knip --reporter json > .audit-output/knip.json
npx -y depcheck --json > .audit-output/depcheck.json

# Bucket 2 — perf + deps + headers
npm audit --json > .audit-output/npm-audit.json
npm outdated --json > .audit-output/npm-outdated.json
curl -sIL https://tmb.erenunur.com > .audit-output/headers.txt
for p in '' /score /games /players /bros; do
  out=$(echo "lh${p:-home}" | tr / -)
  npx -y lighthouse "https://tmb.erenunur.com$p" \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json --output-path=".audit-output/$out" \
    --quiet --chrome-flags="--headless=new --no-sandbox" --form-factor=mobile
done

# Extract scores
node -e "
const fs=require('fs');
for (const f of ['lh-home.report.json','lh-score','lh-games','lh-players','lh-bros']) {
  const r=JSON.parse(fs.readFileSync('.audit-output/'+f,'utf8'));
  const c=r.categories,a=r.audits;
  console.log(f, Math.round(c.performance.score*100), Math.round(c.accessibility.score*100), Math.round(c['best-practices'].score*100), Math.round(c.seo.score*100), a['largest-contentful-paint'].displayValue, a['cumulative-layout-shift'].displayValue);
}
"

# Bucket 3 (when MCP is on K13's account) — DB + Vercel
# Use Claude MCP: mcp__claude_ai_Supabase__get_advisors (security + performance)
# Use Claude MCP: mcp__claude_ai_Vercel__get_runtime_logs (filter to /api/cron/*)

# Bucket 4 — palette + metadata + SEO
grep -rEn '(purple|fuchsia|violet|indigo)-[0-9]' src/
grep -rln 'emerald-[0-9]' src/ | wc -l
for f in $(find src/app -name 'page.tsx'); do
  echo "$(grep -l 'export const metadata\|generateMetadata' "$f" >/dev/null && echo Y || echo N) $f"
done
ls src/app/{robots,sitemap,opengraph-image,icon,favicon}.* public/{robots.txt,sitemap.xml,favicon.ico,manifest.json} 2>/dev/null
```

All raw output lives in `.audit-output/` (gitignored).

---

## 7 · Out of scope (deliberately deferred)

- Live Supabase + Vercel queries (§3 — needs MCP swap to K13)
- Load testing / k6 / artillery
- Bundle composition deep-dive (`@next/bundle-analyzer`) — Lighthouse + `total-byte-weight` already identifies the headline overage; analyzer is the next step once images are fixed.
- Code patches — this is a read-only pass.
- Mobile-vs-desktop Lighthouse matrix — mobile only ran (the harder target).

---

*Generated 2026-05-17 from branch `tmb_may17_v6`. Re-run §6 commands to regenerate.*
