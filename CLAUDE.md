@AGENTS.md
@CONVENTIONS.md

# TrustMeBro — Project Conventions

## Mission
NBA istatistik analizi yapan, **her maç için en fazla süre alacağı düşünülen oyuncular** üzerinden güven puanlı bet önerileri üreten, kullanıcının ikiye katlama (2×) hedefini destekleyen bir web uygulaması. Sistem kendi kararlarını öğrenir: kazandığı bet için **+1.0**, kaybettiği bet için **−0.5** puan alır.

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
- **2026-05-14**: Off-court inputs (magazin, sosyal medya, yakın çevre) tahmine girdi olmalı, sadece sayısal data değil.
- **2026-05-14**: Live odds takibi — en yüksek oranı bul (value bet).
- **2026-05-14**: Kaynak hiyerarşisi: **official NBA API/site > balldontlie > Google fallback**. "İnternette ara" güvenilir değil; kaynağı pinle.
- **2026-05-14**: Dashboard renk kodu: sezon avg / önceki maç / ondan önceki maç farklı renk; son 5 ayrı + son 10 ortalama yan yana.
- **2026-05-14**: History: kullanıcı tek tıkla "ben bu beti oynadım" işaretler, sonucu kaydeder.
- **2026-05-14**: Pattern engine: anomalileri/döngüleri yakalamalı (örn. "her 6 maçta sıfırlanma"). Sapma alert'i: "ortalama 8 ama önceki maç 5 yaptı".
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

Until real bookmaker odds wire in, the engine constructs lines synthetically as
`line = floor(L10_mean) + 0.5`. By construction the L10 mean is always above
that line, which biases the slate toward **over**. Confidence is computed
relative to that synthetic line, so a high-confidence pick today is *not* a
value bet — it's a high-conviction projection. "Confidence ≠ EV" until
`/api/cron/track-odds` ships with `ODDS_API_KEY`.

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

- Stored in `system_score` table — single row + history.
- Settled by `/api/cron/settle-bets` after games finalize.
- **Won**: `score += 1.0`
- **Lost**: `score -= 0.5`
- **Void / Push**: no change.
- Score history kept for analysis. Surface on `/score` with all-time chart.

## Dashboard Conventions

- Color coding (Tailwind tokens):
  - Season average → `text-blue-500`
  - Previous game → `text-amber-500`
  - Two games ago → `text-cyan-500` (was purple — purple is banned outside of team colors; see [src/components/StatColor.ts](src/components/StatColor.ts))
  - Last 5 individual bars → neutral with delta arrows
  - Last 10 average → `text-emerald-500`
- **Palette rule (2026-05-14):** `purple` / `fuchsia` / `violet` / `indigo` are **banned** in app chrome and components. They may only appear when rendering a team's actual brand color. The accent palette is Robinhood-style: emerald/green for primary action, rose for negatives, white-on-dark for text.
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
- `ODDS_API_KEY` — bookmaker odds provider (TBD; consider The Odds API)
- `CRON_SECRET` — to protect `/api/cron/*` endpoints from unauthorized invocation

## Cron Schedule (Vercel)

| Endpoint                          | Frequency             | Purpose                                |
| --------------------------------- | --------------------- | -------------------------------------- |
| `/api/cron/sync-stats`            | daily @ 10:00 UTC     | Pull yesterday's box scores            |
| `/api/cron/generate-predictions`  | daily @ 14:00 UTC     | Compute today's picks + Bet of the Day |
| `/api/cron/track-odds`            | every 30 min, gameday | Capture odds snapshots                 |
| `/api/cron/scrape-news`           | every 2h              | Magazine/social pulls                  |
| `/api/cron/settle-bets`           | every 30 min, gameday | Settle finalized games, update score   |

## When You're Stuck

1. Read the relevant doc in `node_modules/next/dist/docs/` — version-matched, authoritative.
2. Check existing patterns in the repo before inventing new ones.
3. If a transcript decision conflicts with current state, the decision wins until explicitly overridden in this file.
