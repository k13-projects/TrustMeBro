@AGENTS.md
@CONVENTIONS.md

# TrustMeBro — Project Conventions

## Mission
NBA istatistik analizi yapan, **her maç için en fazla süre alacağı düşünülen oyuncular** üzerinden güven puanlı bet önerileri üreten, kullanıcının ikiye katlama (2×) hedefini destekleyen bir web uygulaması. Sistem kendi kararlarını öğrenir: kazandığı bet için **+1.0**, kaybettiği bet için **−1.0** puan alır (symmetric ledger; ayrıca bro coupon ledger için per-leg score).

## Scope — MVP

| In MVP                                            | Out of MVP                          |
| ------------------------------------------------- | ----------------------------------- |
| Sadece NBA                                        | NFL / diğer sporlar                 |
| Player + team prop bahisleri (points/reb/ast/3PM) | Spread / total / moneyline (Phase 2)|
| Günlük & per-game tahminler                       | Live in-play bahsi                  |
| Renk kodlu karşılaştırma dashboard'u              | Mobile native app                   |
| History (kullanıcı kendi oynadıklarını işaretler) | Otomatik bookmaker entegrasyonu     |
| Off-court signals (magazin/newsletter/social)     | Çok dilli içerik                    |

## Source Decisions (Eren & Kazimiro, 2026-05-14)

Karar log'u — değiştirilirse buraya tarih + sebep ekle:

- **2026-05-14**: NBA-only MVP. NFL ileride.
- **2026-05-14**: Tahmin scope = her maç için "en fazla süre alabileceği düşünülen oyuncular". Sayı sınırı yok; eşik = beklenen dakika.
- **2026-05-14**: Güven puanı 0–100, justification olarak hangi check'lerin geçtiği gösterilecek.
- **2026-05-14**: Günlük min. 10 pick, güvene göre sıralı. Tepede **Günün Bahsi** (yıldızlı, en yüksek güven).
- **2026-05-14**: Kombo bahis — iki yüksek güvenli pick'i birleştirme özelliği.
- **2026-05-14**: Ödül/Ceza: +1.0 / −0.5. Artıda kalmak hayati. Test fazı — sistem pozitif kalabilecek mi?
- **2026-05-16**: Symmetric scoring — engine picks lost = **-1.0** (was -0.5). "Düz hesap" — `score = wins − losses`. Coupons get a separate leg-aware ledger (`bro_stats.score`): all legs hit → `+legs_won`, any leg missed → `-legs_lost`, all void → `0`. See migration 0014 + `src/lib/scoring/coupons.ts`.
- **2026-05-14**: Off-court inputs (magazin, sosyal medya, yakın çevre) tahmine girdi olmalı, sadece sayısal data değil.
- **2026-05-14**: Live odds takibi — en yüksek oranı bul (value bet).
- **2026-05-14**: Kaynak hiyerarşisi: **official NBA API/site > balldontlie > Google fallback**. "İnternette ara" güvenilir değil; kaynağı pinle.
- **2026-05-14**: Dashboard renk kodu: sezon avg / önceki maç / ondan önceki maç farklı renk; son 5 ayrı + son 10 ortalama yan yana.
- **2026-05-14**: History: kullanıcı tek tıkla "ben bu beti oynadım" işaretler, sonucu kaydeder.
- **2026-05-14**: Pattern engine: anomalileri/döngüleri yakalamalı (örn. "her 6 maçta sıfırlanma"). Sapma alert'i: "ortalama 8 ama önceki maç 5 yaptı".
- **2026-09-09**: Champions League added as the live football competition; World Cup 2026 archived (frozen, browsable, exportable). Per-competition ledgers. See "Football competitions" below.
- **2026-09-14**: **Turkish Süper Lig (`tur.1`) added as a live competition.** ESPN carries it on the same feed shape as the UEFA competitions, so fixtures, standings, clubs and news cost nothing. Odds are the only metered part; see the cadence note under "Football competitions".
- **2026-09-14**: **Turkish bookmakers rejected as an odds source.** Bilyoner, Tuttur, Misli and iddaa publish rates but all price off the same state betting pool, so they would supply one opinion wearing four logos — and the engine finds value by shopping between *independent* books. The Odds API already carries 33 for this league, Pinnacle included. None of them publishes an API, and iddaa operates under Turkey's state betting monopoly, so scraping them would also breach the house ToS rule.
- **2026-09-15**: **Users can build their own coupons** from any outcome on the odds board, not only from engine picks. The engine's pick is a small marker, never a preselected state — conflating our opinion with the user's choice makes it unclear whose decision it was. Coupon and engine ledgers stay separate, as before.
- **2026-09-15**: **Publishing is a choice; the record is not.** Sharing a coupon does **not** lock at kickoff — people decide what goes on the board, whenever. But a **graded** score prediction can no longer be deleted (migration 0034), because removing a bad call after the fact turns the leaderboard into a highlights reel. An *ungraded* call can still be deleted: changing your mind before a match is not hiding anything.
- **2026-09-15**: **Primary address is `tmb.k13projects.com`.** `tmb.erenunur.com` stays attached and serves a **307** (deliberately temporary — a 301 is cached for months and would make the hierarchy painful to reverse). Both hosts are allow-listed in Supabase auth; the app derives its OAuth `redirectTo` from `window.location.origin`, so sign-in follows whichever host the visitor used.
- **2026-05-14**: Canonical timezone = **America/Los_Angeles**. NBA maçları US saatinde oynanıyor ve PT gece yarısı sleyt'in en geç kapanma anı, dolayısıyla "bugün" tüm sayfa/cron/chat için LA günü demektir. `todayIsoDate()` LA tarihini döndürür; sabit `PROJECT_TIMEZONE` ifadesi [src/lib/date.ts](src/lib/date.ts)'te.

## Stack

- **Next.js 16.2.6** App Router, Turbopack default. **ALWAYS** check `node_modules/next/dist/docs/` before writing routing/data-fetching code.
- **React 19.2.4**
- **Tailwind v4** (CSS-first config, no `tailwind.config.js`)
- **Supabase** — `@supabase/ssr` for SSR cookies, `@supabase/supabase-js` for direct calls
- **SWR** for client-side data fetching (server cache for SSR is preferred)
- **Zod** for validation at all external boundaries (API responses, form input, search params)
- Data source — currently `balldontlie.io` (free tier, see `src/lib/sports/nba/balldontlie.ts`). Plan to add official NBA stats API when MVP validates.

## Next.js 16 — Critical Differences vs. Training Data

Your training data is for older Next.js. The following are **breaking** and must be honored:

1. **`searchParams` / `params` are `Promise`** in route handlers and pages:
   ```ts
   type PageProps = { searchParams: Promise<{ date?: string }> };
   export default async function Page({ searchParams }: PageProps) {
     const { date } = await searchParams;
   }
   ```
2. **`middleware` is renamed `proxy`** — file is `src/proxy.ts`, not `src/middleware.ts`. Codemod can migrate.
3. **Turbopack is default** for both `next dev` and `next build`. No `--turbo` flag needed.
4. **`experimental_ppr` removed** — PPR stabilized.
5. **`unstable_` prefix dropped** for stabilized APIs. Check `unstable_instant` for instant navigation.
6. **Node 20.9+** required; TypeScript 5.1+.
7. **`next/headers`** — `cookies()` and `headers()` are async; must be `await`ed (see `src/lib/supabase/server.ts`).

When in doubt: `ls node_modules/next/dist/docs/01-app/` then read the relevant guide. Don't guess.

## Directory Structure

```
src/
  app/
    (marketing)/                    # public landing — to add
    (app)/                          # authenticated zones — to add when auth lands
      page.tsx                      # Today's picks + Bet of the Day
      games/[id]/page.tsx           # Per-game pick sheet
      players/[id]/page.tsx         # Player season + L5 + L10 view
      teams/[id]/page.tsx           # Team-level view (current: src/app/teams)
      history/page.tsx              # User's tracked bets
      score/page.tsx                # System reward/penalty status
    api/
      cron/
        sync-stats/route.ts         # Daily NBA stat sync
        generate-predictions/route.ts # Daily prediction generation
        track-odds/route.ts         # Hourly odds polling
        scrape-news/route.ts        # News/magazine polling
        settle-bets/route.ts        # Post-game settlement + score update
      bets/
        [id]/play/route.ts          # User marks bet as played
  lib/
    sports/                         # Provider interface + implementations
      types.ts
      nba/{provider.ts, balldontlie.ts, index.ts}
    analysis/                       # Prediction engine — pure functions
      features.ts                   # L5/L10/season/H2H/home-away computations
      patterns.ts                   # Anomaly + cycle detection
      confidence.ts                 # 0–100 score
      reasoning.ts                  # Build "why" justification object
      predictions.ts                # Per-player per-market pick generator
      bet-of-the-day.ts             # Highest-confidence picker
    signals/                        # Off-court inputs
      news/                         # Bleacher, ESPN gossip scraping
      odds/                         # Bookmaker odds polling
      newsletters/                  # Gmail inbound parsing
      social/                       # X/Reddit signals
    scoring/
      reward.ts                     # +1.0 / -0.5 mechanism
    supabase/{server.ts, browser.ts}
    date.ts
  db/
    migrations/                     # Numbered SQL files
```

## Module Conventions

### Sports provider
- Every sport must implement an interface (see `NbaProvider`).
- Provider files go in `lib/sports/<sport>/`. Default export is a singleton factory: `nbaProvider()`.
- All external API calls live behind providers — pages and analysis modules never `fetch()` directly.

### Analysis modules
- **Pure functions**. Take stat data + game context, return scored output.
- No DB calls, no `fetch()`. Inputs are injected.
- Outputs are typed (`Prediction`, `Reasoning`, `ConfidenceBreakdown`).
- This makes them testable without mocks and reusable in cron jobs, API routes, and Server Components.

### Signals modules
- Each signal source has its own subdir with a `fetch.ts` (acquisition), `parse.ts` (extraction), `index.ts` (public surface).
- Output: `Signal` rows with `player_id`, `team_id`, `source`, `sentiment` (-1..+1), `summary`, `captured_at`.

### Supabase usage
- **Server Components & route handlers** → `createSupabaseServerClient()`.
- **Client Components** → `createSupabaseBrowserClient()`.
- **Service-role key** is server-only and never imported from client code. Files using it must start with `import "server-only"`.
- **Row Level Security (RLS) is mandatory** on every user-facing table before launch.

### Validation
- All API responses validated with Zod before crossing module boundaries.
- All search params parsed with Zod (don't trust `URLSearchParams` types).

## Database Conventions

- Migrations are **forward-only**, numbered (`0001_init.sql`, `0002_add_odds.sql`).
- One concern per migration.
- Every table has `created_at timestamptz default now()` and (where relevant) `updated_at`.
- Foreign keys named `<table>_id`.
- Enums for fixed sets (e.g., `prop_market`, `bet_status`).
- RLS on every table with user-visible data.

## Prediction Engine Contract

The engine emits a pick only when real bookmaker odds exist for the
(game, player, market). `/api/cron/track-odds` pulls player-prop snapshots
from The Odds API into `odds_snapshots`; `/api/cron/generate-predictions`
reads the latest snapshot per group, uses the modal line across books as
the consensus, picks the best price on the chosen side, and computes
`expected_value = (confidence/100) * decimal_odds - 1`. No `ODDS_API_KEY`
(or no odds for the day) ⇒ zero picks. The old `floor(L10_mean) + 0.5`
synthetic line has been retired — confidence is now a probability against
the price you'd actually bet.

**Soccer emission gates (2026-09-16, `src/lib/analysis/soccer/engine.ts`).**
Measured on 208 graded picks: 60% had negative expected value and lost as a
group; draws hit 18%; unders hit 48% against a 54% breakeven; banko picks hit
80% while everything else hit 48%. The engine now emits only picks with
`0 <= expected_value <= 0.25` (a larger edge reads as miscalibration, not
value), never draws or unders (flag `ENABLE_DRAW_AND_UNDER_PICKS`), and
builds coupons from banko legs only. Non-banko rows are labelled **Lean** in
the UI (`TierBadge`), banko rows **Banko**. Backtest: 208 picks at 55% and
+4.8 units becomes 60 picks at 63% and +5.3 units; banko alone 17W–2L.
Fewer picks is the intended trade (see the 2026-05-20 win-rate pivot).

A `Prediction` must include:
```ts
type Prediction = {
  id: string;
  game_id: number;
  player_id: number;
  market: 'points' | 'rebounds' | 'assists' | 'threes_made' | 'minutes';
  line: number;            // bookmaker line (or our projected line)
  pick: 'over' | 'under';
  projection: number;      // our projected stat value
  confidence: number;      // 0..100
  expected_value: number | null;  // if we have odds
  reasoning: Reasoning;    // structured "why"
  generated_at: string;
  status: 'pending' | 'won' | 'lost' | 'void';
};

type Reasoning = {
  checks: Array<{
    label: string;         // e.g., "Last 5 avg vs line"
    passed: boolean;
    value: number;
    target: number;
    weight: number;        // 0..1 contribution to confidence
  }>;
  signals: Array<{         // non-statistical inputs that moved the needle
    source: string;
    impact: number;        // -1..+1
    note: string;
  }>;
};
```

## Reward/Penalty Mechanism

Two separate ledgers, both surfaced on `/score`:

**Engine picks** (`system_score` + `system_score_history`)
- Settled by `/api/cron/settle-bets` after games finalize via the `apply_reward` RPC.
- **Won**: `score += 1.0`
- **Lost**: `score -= 1.0` (was -0.5; flipped 2026-05-16 — see migration 0014)
- **Void / Push**: no change.

**Coupon ledger** (`bro_stats` matview, public coupons only — see [src/lib/scoring/coupons.ts](src/lib/scoring/coupons.ts))
- Per-bro leg-aware score, refreshed at end of `settle-coupons.ts`:
  - **All legs hit** → `+legs_won` (2-pick won = +2, 3-pick won = +3)
  - **Any leg missed** → `-legs_lost` (2-pick 1H/1M = -1, 2-pick 0H/2M = -2)
  - **All void** → `0`
- Sum across a bro's shared coupons is their Bro Board ranking. `/score`
  shows both ledgers side-by-side and breaks coupons down by leg count
  (2×, 3×, 4×, 5×, 6×). Engine + coupon ledgers are deliberately separate
  so engine performance isn't muddled with how aggressive bros build their
  parlays.

## Dashboard Conventions

- Color coding (Tailwind tokens):
  - Season average → `text-blue-500`
  - Previous game → `text-amber-500`
  - Two games ago → `text-cyan-500` (was purple — purple is banned outside of team colors; see [src/components/StatColor.ts](src/components/StatColor.ts))
  - Last 5 individual bars → neutral with delta arrows
  - Last 10 average → `text-emerald-500`
- **Palette rule (2026-05-15, supersedes prior emerald-primary rule):** `purple` / `fuchsia` / `violet` / `indigo` are **banned** in app chrome and components. They may only appear when rendering a team's actual brand color. The accent palette is **TrustMeBro gold** (`#FFB800`, exposed as `--primary`) for primary action / CTAs / brand chrome — driven by the renovation mockups in `public/Design/`. **Emerald is reserved for positive-delta indicators only** (win streaks, ROI ↑, last-10 average — data-viz semantics). Rose for negatives. White-on-dark for body text. Full renovation context: [.claude/UI_RENOVATION.md](.claude/UI_RENOVATION.md).
- Pattern alert badge appears when last-game value is more than 1.5 standard deviations from L10 average.
- Compact display: prefer sparkline + scalar over multi-row tables when possible.

## Coding Style

- Server Components by default; only `"use client"` when needed (interactivity, hooks).
- No barrel `index.ts` files unless they serve a clear public-API surface (sports providers OK; UI components not).
- No comments explaining what code does — names should. Comments only for non-obvious WHY.
- Don't pre-extract helpers for one caller. Inline until pain.
- Don't add `try/catch` around code that can't throw, and don't catch errors you can't handle — let them bubble to a route-level boundary.
- Prefer `Date` math via `src/lib/date.ts` helpers, not inline.

## Security & Legal

- **API keys never client-side.** `NEXT_PUBLIC_*` is public; everything else server-only.
- Service role key never leaves server modules; enforce with `import "server-only"`.
- This is an **analysis & education tool** — we present projections, not bookmaker integration. No in-app wagering. History tracking is for user's own record-keeping.
- Comply with data source ToS. Scraping has limits; respect `robots.txt` and rate limits.
- If targeting users in regulated markets, geofencing TBD before any public launch.

## Environment Variables

See `.env.example`. Required keys:
- `BALLDONTLIE_API_KEY` — NBA stats
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, used by browser + SSR
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never `NEXT_PUBLIC_*`

Add as needed (and update `.env.example`):
**No paid APIs (Kazim, 2026-09-14).** The site runs on free tiers only. Do not
propose, wire, or assume a paid plan for any data source — that includes the
Odds API tier that would unlock domestic leagues, and any paid alerting or
monitoring service. If a feature needs money, it does not get built; say so and
stop. This is why outage alerting goes through the War Room rather than a
hosted pager.

- `ODDS_API_KEY` — The Odds API (https://the-odds-api.com). Load-bearing: `/api/cron/track-odds` needs it to pull player-prop snapshots, and `/api/cron/generate-predictions` produces zero picks without it (real odds gated). Free tier = 500 req/mo and player props cost 10x. **The old note here said "expect to upgrade to ~$30/mo" — that is superseded by the No-paid-APIs rule above.** If the free tier runs short, the answer is to spend fewer credits (narrow the cadence, drop a competition), never to buy a tier. Usage on 2026-09-15: ~40 of 500 used, with four live football competitions.
- `CRON_SECRET` — to protect `/api/cron/*` endpoints from unauthorized invocation
- `NBA_LIGHT_MODE` — off-season toggle. `"true"` makes every NBA cron early-exit (`{skipped:true}`) via `src/app/api/cron/_light-mode.ts`. The Vercel schedule is left intact; unset to wake the NBA side. Soccer crons ignore it.

## Football competitions (World Cup archive · Champions League live) — 2026-09-09

Football is multi-competition. Every soccer table carries a `competition`
column (ESPN league slug: `fifa.world`, `uefa.champions`) and the engine ledger
is one row per competition in `soccer_ledgers` (migration 0022). The registry
is [src/lib/sports/soccer/competitions.ts](src/lib/sports/soccer/competitions.ts):
label, season, `status: live | archived`, ESPN slugs (main + qualifying), Odds
API key, logo, theme.

- **Switching.** Cookie `tmb_competition` (1 year), read by `activeCompetition()`;
  absent ⇒ `DEFAULT_COMPETITION` (Champions League). The switcher lives in the
  `CompetitionBar` at the top of every `/football/*` page. Same URL tree serves
  both competitions.
- **Archived = frozen, not deleted.** The World Cup 2026 record (92 matches, 198
  graded picks, ledger +16 / 107W–91L, final tables, 11k news rows) stays in
  Postgres exactly as it finished and is fully browsable under the switcher.
  No cron pulls for an archived competition (`liveCompetitions()` gates them),
  no on-visit refresh, no odds credits. A JSON copy is committed at
  `docs/archive/world-cup-2026/` (`scripts/export-competition-archive.mjs`).
  To bring a competition back live: flip `status` in the registry.
- **Theming.** The football layout stamps `data-competition` on a wrapper; the
  Champions League scope re-tokens `--primary` (sky blue `#4FA6FF`, hue 212 —
  blue, not indigo), surfaces (midnight navy), and `--font-display` (Barlow
  Condensed, standing in for UEFA's "Champions" face) in `globals.css`. Club
  crests render contained (not flag-cropped) and each match pill gets a thin
  edge in the club's ESPN brand colour. The master gold stays on global chrome.
- **Rounds.** League-phase matchdays aren't in the ESPN payload; they're derived
  from the ISO week of the fixture (one matchday per week) in
  `groupIntoRounds()`. Qualifying rounds come from the `uefa.champions_qual`
  feed and are stored under the same competition with their stage slug.
- **Odds matching.** Bookmaker names ≠ ESPN names for clubs ("Slavia Praha" vs
  "Slavia Prague"). `team-match.ts` reconciles them (aliases + token overlap,
  both sides must clear the bar, ties refuse to guess); `track-odds` reports
  `unmatched` per run — check it after each matchday's first pull.
- **Cron cost.** One Odds API call per live competition per day (4 credits =
  2 markets × 2 regions), skipped on days a competition has no unfinished match
  inside the 8-day window. That gate works for UEFA because matchdays cluster,
  so most days cost nothing.
- **Odds cadence (2026-09-14).** It does **not** work for a weekly domestic
  league: the Süper Lig plays Fri–Mon nearly every week Aug–May, so an 8-day
  window is satisfied almost daily (~120 credits/month on its own). Narrowing
  the window does not fix it — even 2 days still fires ~6 days a week. The fix
  is a **cadence limit**, not a smaller window: `oddsCadence`
  (`{minHours, freshWithinHours}`) on `CompetitionMeta`, `null` for UEFA and the
  archive (unthrottled, unchanged). Süper Lig runs `{78, 24}` — at most one pull
  every ~3.25 days, and the near-kickoff refresh may only bring the *next
  scheduled* pull forward, never add one, which is what stops it firing on all
  four days of a round. Simulated over a full season: **~35 credits/month**.
  Last-pull clock lives in `ingest_state`; see `soccer/odds-cadence.ts`.
- **Club name matching (2026-09-14).** Turkish clubs carry sponsor prefixes and
  suffixes the books use and ESPN does not (`Torku Konyaspor` vs `Konyaspor`,
  `Kasimpasa SK` vs `Kasimpasa`), plus diacritics. Aliases live in
  `team-match.ts`; `normalizeTeamName()` also folds **dotless ı**, which has no
  NFKD decomposition and therefore does not fold on its own — without that,
  search returned nothing for `Kasımpaşa` spelled the way Turks spell it.
- **Odds movement.** Raw snapshots are still pruned after 48h; `track-odds`
  also writes one compact consensus row per (match, market, side) per run to
  `soccer_odds_history` (migration 0023), never pruned — that is the series
  the match page charts. The window is 8 days ahead so a matchday gets a daily
  point once books list it.
- **Live competitions (2026-09-14):** Champions League, Europa League,
  Conference League (`uefa.champions`, `uefa.europa`, `uefa.europa.conf`, each
  with its `*_qual` ESPN feed) and the **Turkish Süper Lig** (`tur.1`, no
  qualifying feed, ESPN logo id 18, red `#E30A17` theme). World Cup archived.
- **Provider health + fallback (2026-09-14).** Four tiers, always preferring
  the first: `site.web.api.espn.com` → `site.api.espn.com` → **UEFA's own feed**
  (`match.uefa.com/v5/matches`, `soccer/uefa.ts`) → ESPN's core API
  (`sports.core.api.espn.com`), which honours dates but returns `$ref` links.
  The last two only ever close out finished matches so picks still grade.
  UEFA is the one source that shares no failure domain with ESPN, which is the
  point of it; it needs no key and no account, but carries only results, so it
  can never replace ESPN for stats, lineups, commentary or crests. It has
  nothing to say about the World Cup (FIFA's competition, not UEFA's).
  `provider-health.ts` records which source served the data (migration 0028:
  `soccer_provider_health` + `soccer_provider_incidents`), `ProviderBanner`
  says so on every football page while degraded, and each transition posts to
  `ALERT_WEBHOOK_URL` when one is set (Discord/Slack/any JSON webhook).
  While degraded, every page view re-probes the primary after the response,
  so the site returns to it on its own. **Never let an upstream failure be
  silent** — that is what cost three days in September.
- **How an outage reaches Kazim (2026-09-14).** Through the **K13 War Room**,
  not email and not a paid pager. `/api/health` is public, unauthenticated and
  free: one row, no secrets, always HTTP 200, with the state in the body so the
  reader always gets the detail. The War Room's `selftest --live` canary reads
  it, and raises the board's amber/red strip plus the SessionStart report when
  `status` is anything but `ok`. Registered in
  `K13-WarRoom/.k13/health-endpoints.json`. `status: "unknown"` (nothing has
  reported yet) is deliberately not an alert. `ALERT_WEBHOOK_URL` still works
  if one is ever set, but nothing depends on it being set.
- **ESPN host (2026-09-13).** `site.api.espn.com` returns 403 to Vercel;
  every call goes through `site.web.api.espn.com` with a 403 fallback to the
  other host (`src/lib/sports/soccer/espn.ts`). See `.claude/Lessons.md`.
- **ESPN date ranges are dead (2026-09-16).** `dates=YYYYMMDD-YYYYMMDD`
  answers 400 on both hosts; `listMatchesInRange` walks the window one day at
  a time. Any non-2xx now records a provider failure before throwing.
- **Cron run log (2026-09-16).** Every soccer cron runs inside `runCronJob`
  (`src/lib/ingest/cron-runs.ts`, table `cron_runs`, migration 0035): one row
  per invocation with summary or error. `/api/health` reports the last run
  per job and marks it `overdue` after 26h without a success; a failed or
  overdue job makes `status` non-ok, which the War Room canary picks up.
  Multi-competition crons wrap each competition separately so one league's
  failure cannot stop the others.
- **Settle on visit (2026-09-16).** `settleOnVisit(competition)`
  (`src/lib/ingest/soccer-settle.ts`) runs behind `maybeRefresh` on the
  football home with a 5-minute throttle and grades only when a pending pick's
  match has finished. The cron and the on-visit path share the same sequence
  so they cannot drift.
- **Default competition (2026-09-16).** With no `tmb_competition` cookie, the
  landing competition is the live one with a match in play, else the nearest
  upcoming kickoff, never a fixed default that can be 26 days from action. The
  `CompetitionBar` shows a live dot on any tab with a match in play.
- **Pages (Wave 1, 2026-09-13).** `/football/match/[id]` (ESPN summary:
  form, stats, lineups, commentary + our picks, rates, odds movement),
  `/football/club/[id]` (profile, cross-competition schedule, squad, engine
  record, news), `/football/value` (edge board, 15% floor, pre-match only),
  `/football/bracket` (ties via `bracket.ts`; needs `winner_team_id` for
  shoot-outs, migration 0025), scoreboard breakdown (`getEngineBreakdown`).
- **Wave 3, usability (2026-09-13).** The football home has three modes:
  matchday slate, **between matchdays** (countdown, next round, last round
  replayed, derived table movement, storylines — `home-queries.ts` +
  `Home*` components), and the archive. Nav is grouped (`NavEntry` /
  `NavGroup` in `registry.ts`) so the desktop row fits from 1024 instead of
  1536, with `BottomBar` on phones. Kickoffs render in the viewer's zone via
  `src/lib/tz.ts` + `<LocalTime>` + a footer toggle — **`PROJECT_TIMEZONE`
  remains the canonical day boundary and must not change**. Search palette
  (Cmd-K, `/api/soccer/search`, accent-folded `name_search`, alias table),
  following clubs (`soccer_team_follows`, migration 0026), `/football/clubs`,
  `/football/glossary`, and URL-driven filters on the Value board.
- **Wave 2 (2026-09-13).** Live tracker on match pages (`LiveTracker` +
  `/api/soccer/matches/[id]/live`; in-play win probability from
  `live-prob.ts`, Poisson on the pre-match consensus), bro score predictions
  (`/football/predictions`, `soccer_score_predictions` migration 0024,
  3 pts exact / 1 pt result, graded in settle-bets via `grade-calls.ts`),
  share cards (`next/og`: match OG image, `/api/og/pick/[id]`,
  `/api/og/coupon/[id]`, `ShareButton`).

## Deploy

Verify deploy state from Vercel itself, never from this section — these lines
go stale, which is the whole point of the house rule. They are here so a fresh
session knows *where* to look, not so it can skip looking.

- **Vercel project:** `trustmebro` (`prj_JGTOgBzCdEgOx5iGPcohKolbOkHh`), on the
  K13 account. Never the hosted Vercel MCP — that one is on Halil's account.
- **Production branch:** `main`. A merge to `main` redeploys on its own.
- **Primary address:** **https://tmb.k13projects.com**
- **Secondary:** `tmb.erenunur.com` → **307** to the primary. Temporary on
  purpose: browsers cache a 301 for months, which would make the hierarchy hard
  to reverse. Both hosts are allow-listed in Supabase auth and the app builds
  its OAuth `redirectTo` from `window.location.origin`, so sign-in works on
  either and follows whichever the visitor used.
- **No canonical/sitemap machinery to keep in sync:** the site is deliberately
  `disallow: /` in `robots.ts` with a hard bot block in `proxy.ts` (crawlers were
  ~95% of traffic and drained the transfer tier). The address is written down in
  exactly one place in the app: the share-card footer in `src/lib/og/blocks.tsx`.

---

## User-built coupons (2026-09-15)

Every outcome on the odds board is selectable, not just the engine's picks.
`MatchRates.tsx` is client-side; a **★** marks an outcome we have a prediction
row for, and nothing is ever preselected. A leg is `engine` or `user`
(`leg_source`), both on `soccer_coupon_legs`, both graded by the same pure
`outcome()` against final scores. Contract: `soccer/coupon-legs.ts`.

**The trust model is the important part, and it is structural, not a list of
rules.** Three audit rounds landed on it:

- `INSERT`/`UPDATE`/`DELETE` on `user_coupons`, `user_coupon_picks` and
  `soccer_coupon_legs` are **revoked from `authenticated`** (migration 0032).
  A browser client holds `SELECT` only. Every write goes through
  `POST /api/coupons` (service-role, verifies odds, line and kickoff) or a
  `SECURITY DEFINER` RPC. The API is the only door, not a politely suggested one.
- Round 1 patched columns instead, and the next hole was found within the hour:
  attach a leg to a **match that already finished**, pick the side that already
  won, leave `status` unset — every rule satisfied, and our own settlement grades
  it honestly. **The lesson: as long as a client can write to a table, every
  invariant has to be restated as a predicate, and forgetting one is the whole
  vulnerability.** Take the door away instead of enumerating the rules.
- Defense-in-depth binds **privileged writers too**, because a rule that only
  constrains ordinary users stops being a rule the day the server has a bug: a
  `BEFORE INSERT` trigger re-reads `soccer_matches.state`, `stake <= 10000`, and
  settlement recomputes payout from the legs it can actually see rather than
  trusting `potential_payout`.
- `soccer_score_predictions` had the identical shape and is fixed the same way
  (0033), plus a `BEFORE DELETE` guard on graded rows (0034).
- Note `refresh_bro_stats()`: Postgres grants `EXECUTE` to `PUBLIC` by default,
  so revoking only the named role would not have closed it.

Full record: `docs/reports/TrustMeBro_Security-Audit_2026-09-15.html`.

---

## Cron Schedule (Vercel)

NBA crons (top group) early-exit while `NBA_LIGHT_MODE=true` — the season is over.

| Endpoint                          | Frequency             | Purpose                                |
| --------------------------------- | --------------------- | -------------------------------------- |
| `/api/cron/sync-stats`            | daily @ 10:00 UTC     | Pull yesterday's box scores            |
| `/api/cron/generate-predictions`  | daily @ 14:00 UTC     | Compute today's picks + Bet of the Day |
| `/api/cron/track-odds`            | every 30 min, gameday | Capture odds snapshots                 |
| `/api/cron/scrape-news`           | every 2h              | Magazine/social pulls                  |
| `/api/cron/settle-bets`           | every 30 min, gameday | Settle finalized games, update score   |
| `/api/cron/soccer/sync-fixtures`  | daily @ 09:00 UTC     | Fixtures + scores + standings for every **live** football competition (`?competition=&from=&to=` to backfill) |
| `/api/cron/soccer/track-odds`     | daily @ 13:30 UTC     | Real bookmaker odds per live competition for the next 8 days (4 credits each); skips days with no unfinished matches; appends odds-movement history |
| `/api/cron/soccer/generate-predictions` | daily @ 15:00 UTC | Engine picks + coupons per live competition |
| `/api/cron/soccer/settle-bets`    | daily @ 11:30 UTC     | Grade finished matches → that competition's ledger |
| `/api/cron/soccer/scrape-news`    | daily @ 08:00 UTC     | News → `soccer_news` per live competition (/football/news) — backstop; the page also self-refreshes on visit when >30min stale |

**Hobby plan cron limits (verified 2026-06):** crons are capped at **once per day** on Hobby — sub-daily expressions (`*/30`, `0 */6`, etc.) **fail at deploy time**, so every `schedule` here must be daily. Hobby also only guarantees ±59min timing. Freshness beyond daily comes from on-visit `maybeRefresh()` (see `src/lib/ingest/refresh.ts`), not the cron. Function `maxDuration` ceiling on Hobby is 300s (Fluid Compute, on by default).

## When You're Stuck

1. Read the relevant doc in `node_modules/next/dist/docs/` — version-matched, authoritative.
2. Check existing patterns in the repo before inventing new ones.
3. If a transcript decision conflicts with current state, the decision wins until explicitly overridden in this file.


---

<!--K13_BROADCAST_START · managed by War Room — do not hand-edit-->
## 📡 War Room Broadcasts (org-wide rules)
> Synced from the K13 War Room. Each entry is a house rule that applies to every K13 project. Managed automatically — edit the rule in the War Room, not here.

<!--bc:2026-06-26-imagegen-global-->
### 2026-06-26 · Image generation — free, via /imagegen (Gemini Nano Banana) + central pool
**Need an image? Generate it free with `/imagegen`.** Run `/imagegen <subject, style, aspect>` (or read `/Users/k13/Desktop/PROJECTS/K13-WarRoom/starter-kit/IMAGEGEN.md` and follow it). Engine: GStack Browser → Google Gemini (Nano Banana), free / no credits; fallback Bing Image Creator. The agent never types your password — it asks you to log in if prompted.

**Central pool, zero duplicates.** Every generated image lands first in the shared pool `/Users/k13/Desktop/PROJECTS/generatedAssets/` with a raw name (`gen_<proj>_<topic>_<n>.png`) and is **never committed**. On your approval the used image is **moved** (not copied) into this project's correct folder with a proper name; unused variants stay in the pool. Only the final relocated, renamed asset enters the repo — under this project's own git rules (branch → PR → merge).

<!--bc:2026-06-26-reports-archive-and-qa-->
### 2026-06-26 · Reports: archive every version + pass two-agent Chrome QA before "done"
**Archive every report — never overwrite.** Each report is written to `docs/reports/<Project>_<Type>_<YYYY-MM-DD>.html` (e.g. `Miramar_Development-Report_2026-06-25.html`). Same-day re-run → append `_v2`, `_v3`. The dated file is **permanent** — if the site links a "latest", copy/symlink to it, but never delete or overwrite an older dated report. Filenames are client-facing, so they carry the project name + type + date and explain themselves in an email. Types: `Development-Report`, `Security-Audit`, `Legal-Compliance`.

**No report is "done" until it passes the two-agent Chrome QA gate.** One agent **builds** the report; a second **tests** it — opens it in Chrome, screenshots desktop + mobile like a real user, and runs the design-review checklist (spacing, hierarchy, AI-slop, palette match, motion + `prefers-reduced-motion`, broken assets/links, Gmail-safe base64). Loop: fail → fix → re-review, until **design approval**. Only on PASS does the report take its final archived name and ship. Record the approval in a sidecar `docs/reports/<same-name>.qa.json` (date, screenshots, verdict) so "design signed off" is provable. Applies to **all** reports — dev, security, legal.

<!--bc:2026-06-29-agent-agency-org-->
### 2026-08-13 · Team K13: named departments, the handoff contract & the autonomy contract
**K13 runs as team K13 — a controlled delivery pipeline, not a swarm.** Each AI specialist owns one repeatable stage, emits a predictable artifact, and hands off cleanly to the next. The **main Claude session is the GM (James)** — the only layer that sequences work (the hierarchy is flat: subagents don't spawn subagents, so agents never hand off to each other directly). **Jessica** runs Kazim's desk.

- **Roster + status legend:** `starter-kit/ORG.md` (War Room). Lean 7 to build first: Selma (`solutions-architect`) → Valentina (`brand-dna-designer`) → Natalia (`frontend-engineer`) → Olga (`qa-test-engineer`) → Irina (`security-auditor`) → Kate (`release-engineer`) → Gabi (`report-writer`). Human names are display labels; the functional `name:` is the routing key.
- **Handoff contract + Definition of Done:** `starter-kit/AGENT_HANDOFF_PROTOCOL.md`. Every delivery agent ends with the handoff block (Status / Summary / Files / Risks / Next / Human gate) and writes its artifact to `docs/handoffs/<stage>_<YYYY-MM-DD>.md` (same-day re-run → `_v2`, never overwrite).
- **Delegation is not optional.** James does not do a pipeline stage's work himself and call it done — every stage gets its named agent actually invoked (Task tool, `subagent_type` matching the agent file), even on a small project. **No artifact = the work never happened**: the War Room Org tab reads only `docs/handoffs/`, so skipping the artifact makes team K13 invisible on the board.
- **Autonomy contract — don't drip questions at Kazim.** Agents proceed by default. Only `Human gate` items come back to him: irreversible/destructive steps, money, real scope changes, anything that leaves for a client. Every other decision gets made, then **recorded in the handoff** instead of asked. Questions that genuinely survive are batched at the end of a run — never one at a time.
- **Parallel work:** sequential by default; James may fan out several agents **concurrently for independent work** (QA dimensions, security + a11y, research) and relay findings between them — each still writes its own handoff.
- **Agent vs skill:** token-heavy + isolatable → agent; in-context checklist/workflow → skill (compliance-checklist, media-generation).

<!--bc:2026-08-25-fitcheck-house-word-->
### 2026-08-25 · fitcheck: run the responsive-readiness pass after any layout, breakpoint or nav change
**Run `fitcheck` after any layout, breakpoint or nav change** — those are exactly the edits that regress one screen size while fixing another. `fitcheck` (alias `fit`) is the K13 responsive-readiness house pass: nine viewports (320 → 1920, including the two landscape sizes everyone forgets), a shared measurement harness with a trust gate, and the bug classes that only appear at one size — horizontal leaks, tap targets under the WCAG 2.5.8 AA floor, panels that are invisible but still in the tab order, scroll containers that strand their own header, and heroes that exactly fill a short viewport so nothing signals the page continues. It measures, looks, fixes at the source, and re-measures. It is also part of the P5 "done" checklist (`starter-kit/CONVENTIONS.md`). Skill: `~/.claude/skills/fitcheck/SKILL.md`.

<!--bc:2026-08-28-cc-commit-check-->
### 2026-08-28 · CC? — the pre-close commit check
**Ask `CC?` before closing a tab.** It means: "is anything lost if I close right now?" The session audits itself, read-only, and answers in one of two shapes: `✅ CC: safe to close` (one line of why), or `⚠️ CC: save these first` listing each unsaved item with a proposed save action, then waits for your pick. The sweep, in order: (1) git — uncommitted session work, unpushed commits, feature branches without a PR, open unmerged PRs (a repo's own known auto-refresh churn is excluded, not every dirty tree); (2) unwritten rules — corrections, decisions, or coined commands from the conversation not yet in this repo's `CLAUDE.md`/`Lessons.md`/memory; (3) deferrals not parked in a tracking ledger if this repo has one; (4) deliverables stranded in scratchpad/temp or outside any repo; (5) end of a working day — offer a journal/changelog entry if this repo keeps one, never auto-write it. `CC?` itself never saves anything — saving only happens after you choose.

<!--bc:2026-08-28-gstack-berths-->
### 2026-08-28 · GStack Berths: one browser slot per project
**Claim a `berth` for GStack Browser, do not share it blind.** GStack Browser is one shared Chromium instance for the whole machine by default (one profile directory, one fixed port 34567), not per project. Two Claude Code sessions in two different projects that both touch it (`/qa`, `/design-review`, `/browse`, `connect-chrome`, sidebar chat) end up driving the exact same window, stealing each other's active tab. The fix uses gstack's own supported per-workspace knobs: pin `CHROMIUM_PROFILE` and `BROWSE_PORT` in this project's `.claude/settings.json` under "env", derived from the dev port already claimed in `CONVENTIONS.md` so there is never a second table to drift: `BROWSE_PORT = <dev port> + 30000` (e.g. 9137 to 39137), `CHROMIUM_PROFILE = ~/.gstack/berths/<shortcode>`. Claim it once, the next time you are actively working in this project with GStack Browser alongside another active session; until claimed, nothing changes (opt-in, additive, no breakage). Never reach for `browse --force-restart` as a shortcut instead: it destroys the other session's tabs, cookies, and logins. Full spec + root cause: `K13-WarRoom/starter-kit/GSTACK_BERTHS.md`.

<!--bc:2026-09-02-merged-means-deployed-->
### 2026-09-02 · Merged means deployed: verify the live deploy from the host, never from a note
**On a project with a live address, `hm++` is finished when the production deployment made from the merge commit is READY and the URL was actually fetched, not at the merge.** Report "merged and live", or say exactly which of the two is missing. Underneath it: (1) **Deploy state is verified from the host (Vercel: `vercel projects ls`, or the REST API for a project linked to this repo), never from a `CLAUDE.md` line.** Those notes go stale: Lobster Lab's said "Vercel (planned)" for weeks while lobsterlab.us was live and auto-deploying, and trusting it led a session on 2026-09-02 to declare a live site "not wired", create a duplicate Vercel project, and briefly flip the real site to `noindex`. The Vercel project name may not equal the shortcode (`lobster-lab` vs `lobster`). (2) **A project that is not auto-deploying from `main` is a broken setup, not a state to report**: wire it (`Deploy Preview <shortcode>` adopts an existing project by its GitHub link and never touches Production's `NEXT_PUBLIC_SITE_URL` when the project serves another domain), then record the Vercel project, production branch, domains and the production site URL in this file's Deploy section, and keep that section true. Golden rule (Kazim, 2026-09-02): we learn from our mistakes once; the same one never gets a second session.

<!--bc:account-check-json-not-context-2026-09-14-->
### 2026-09-14 · Verify the logged-in account from ~/.claude.json, never from the session context line
**`~/.claude.json` → `oauthAccount.emailAddress` is the only source of truth for which account a terminal holds.** The session's injected context line ("The user's email address is …") is **not** — the two can disagree. On 2026-09-14 the context line said `algosift@gmail.com` while the real login was `eren@tigerhospitalitygroup.com`; a session took the context line at face value, declared a K13 Vercel verification blocked by the Gold Rule, and shipped that phantom caveat inside a delivered audit report. Kazim caught it.

Run the check **before** stating which account is active, and **before** declining any work on account grounds:

```
python3 -c "import json;print(json.load(open('/Users/k13/.claude.json'))['oauthAccount']['emailAddress'])"
```

**Brief subagents with the verified account.** A subagent inherits the same context line and will repeat the same wrong inference in its own handoff — which is exactly how the phantom caveat reached a delivered artifact instead of dying in one session's scratch.

**Wrong is wrong in both directions.** The Gold Rule guards against touching Halil's EDISYN accounts, but the opposite failure is just as real: falsely blocking legitimate K13 work, leaving a verification undone, and burying an untrue blocker in a deliverable. Neither counts as the safe side.

<!--K13_BROADCAST_END-->
