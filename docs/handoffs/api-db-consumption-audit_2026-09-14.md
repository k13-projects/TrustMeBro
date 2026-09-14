# TrustMeBro — API & Database Consumption Audit
**2026-09-14 · Mariana (backend-integrations-engineer) · Read-only investigation, no code changes**

## Verdict

We are **not** over-consuming anything right now. The Odds API has burned 28 of 500 monthly credits (472 remaining, confirmed live against the account), the Supabase database is 57MB of the 500MB free-tier cap, and every on-visit refresh path (ESPN, Odds API, news) is already gated behind a single-flight, throttled lock — not a naive fetch-on-every-request. The one real, imminent risk is NBA's Odds API cost the day `NBA_LIGHT_MODE` gets turned off for the new season: player-prop credits at 10x cost can burn the whole monthly budget in a handful of days at full volume — but that's a known, already-documented tradeoff (CLAUDE.md already says "expect to upgrade to ~$30/mo"), not a bug to fix. Nothing here needs new rate-limiting code today.

**Account note:** I could not check the production `NBA_LIGHT_MODE` value or Vercel cron run history — this session is authenticated as `algosift@gmail.com` (Halil's account per house Gold Rule), and TrustMeBro is K13-only, so I did not touch Vercel MCP for this project. Confirm from the Vercel dashboard on Tiger's account, or tell me to re-run this check from that session.

## Resource summary

| Resource | Free-tier limit | Current usage | Headroom | Risk |
|---|---|---|---|---|
| The Odds API (NBA + soccer combined) | 500 req-credits/mo | **28 used**, 472 remaining (live-checked) | 94% | 🟢 low now / 🔴 high once NBA season resumes at full volume |
| Supabase DB storage | 500 MB | 57 MB (`pg_database_size`) | 89% | 🟢 low |
| `soccer_news` table | — | 12,542 rows / 28 MB (biggest table by far) | — | 🟡 watch, not urgent |
| ESPN (unofficial, free) | no published quota, but rate-limits/blocks by IP | throttled to daily cron + 2min/30min on-visit gates + 30s Next.js fetch cache | large | 🟢 low |
| balldontlie (NBA) | free tier | daily cron only, cached 30s–24h at the fetch layer | large | 🟢 low, and currently zero (NBA_LIGHT_MODE) |
| Vercel Hobby cron | 1 invocation/day per cron | 10 crons, all daily (Hobby-compliant) | n/a | 🟢 low |
| Vercel function invocations | soft/no hard cap on Hobby, but real cost signal | every `/football/*` + most pages `force-dynamic` (one invocation per view) | — | 🟢 low at current traffic |

## Findings, ranked by actual risk

### 1. NBA Odds API credit cost when the season resumes — real, but already known (🔴 medium-high, not urgent today)
`src/app/api/cron/track-odds/route.ts:130-160` calls `provider.listEvents()` once (free discovery call), then `provider.listPlayerPropsForEvent()` **once per matched game per day**, requesting 4 alternate-line player-prop markets (`src/lib/signals/odds/the-odds-api.ts:16-21`). Player-prop markets cost roughly 10 credits/market/region on The Odds API's real pricing, so a single NBA game with a full slate of props can run ~30-40+ credits; a 10-12 game NBA night could plausibly burn 100-150+ credits in one cron run. At a 500/mo budget that's 3-5 days of runway if NBA runs every day at full volume — this is exactly the arithmetic CLAUDE.md's Environment Variables section already calls out ("expect to upgrade to ~$30/mo for steady-state"). **Right now this costs nothing**: `nbaLightMode()` (`src/app/api/cron/_light-mode.ts`) early-exits every NBA cron including `track-odds` while `NBA_LIGHT_MODE=true`. Locally `.env.local` has no `NBA_LIGHT_MODE` key at all, so I can't confirm the production value from here (see account note above) — but the live Odds API quota check (28/500 used, `x-requests-last: 0` on the free metadata endpoint) is consistent with NBA odds pulls **not** currently running.
- **Action needed:** none now. When NBA season starts, re-check quota burn after the first live day and confirm the $30/mo upgrade is in place before letting it run unattended for a month.

### 2. LiveTracker polling has no idle/hidden-tab cutoff, but the fetch layer already absorbs the fan-out (🟡 low, cosmetic)
`src/components/soccer/LiveTracker.tsx:64-95` polls `/api/soccer/matches/[id]/live` every 20s (`POLL_MS = 20_000`) while a match is live or within 20 minutes of kickoff, and correctly stops once `finished`/`state === "post"`. It has **no `document.visibilitychange` check** — a backgrounded tab keeps polling. That said, the actual upstream cost is bounded: the live route (`src/app/api/soccer/matches/[id]/live/route.ts`) calls `provider.getMatchDetail()` / `getMatchEvents()`, which hit ESPN's `/summary` endpoint through `fetchJson()` in `src/lib/sports/soccer/espn.ts:354` with `revalidate: 30` — Next's fetch-data-cache means any number of concurrent viewers polling the same match within a 30s window collapse into one real ESPN call. So 50 people watching one match doesn't mean 50x ESPN calls; it means at most one ESPN call every 30s regardless of viewer count. The Supabase read (`soccer_matches` by id, one row) per poll is trivial.
- **Action needed:** none required. If you want to be tidy, adding a `visibilitychange` pause is a 10-line nice-to-have, not a fix for an actual leak — skip it unless you're already touching this file.

### 3. Soccer/football on-visit refresh (`maybeRefresh`) — correctly implemented, not the risk it looks like (🟢 low, verified)
`src/lib/ingest/refresh.ts:19-73` is a single atomic conditional `UPDATE ... WHERE running=false AND (last_run_at is null OR last_run_at < staleBefore)` against `ingest_state` (migration `0021_ingest_state.sql`). Only the caller whose UPDATE actually matches a row gets to run; every other concurrent visitor's UPDATE matches nothing and returns `"skipped"`. A crashed run self-heals via `claimed_at` aging past `staleLockMs` (default 5 min). This is called from three pages only — `src/app/football/page.tsx:91` (2 min stale, refreshes ESPN fixtures), `src/app/football/schedule/page.tsx:46` (same, 2 min), `src/app/football/news/page.tsx:40` (30 min stale, RSS/news ingest). None of these three touch the Odds API — only ESPN (free) and RSS/news sources.
  - **1000 hits/minute worst case:** every hit still does the `ingest_state` upsert (`refresh.ts:31-33`) before the conditional UPDATE — so 1000 hits = ~2000 tiny primary-key-indexed writes to a single-row-per-key table, not 1000 external API calls. Only one of those 1000 requests actually runs `refreshFixturesWindow()` or the news ingest per stale window. This is a Vercel-invocation-count concern (dimension 4 below), not an external-API-quota concern.
  - **Bot/crawler risk:** a crawler hitting `/football`, `/football/schedule`, `/football/news` repeatedly triggers the same single-flight gate — no amplification vs. a human visitor pattern.
  - **NBA has no equivalent on-visit refresh** — `maybeRefresh` is only wired into the three football pages above; NBA pages rely purely on the daily cron (currently irrelevant anyway, light mode is on).

### 4. `soccer_news` table growth — the single biggest table, but not close to the ceiling (🟡 watch)
Live query against `DATABASE_URL` (2026-09-14): total DB size **57 MB** / 500 MB limit. `soccer_news` is 12,542 rows / **28 MB** — half the entire database, and by far the largest table (next is `player_game_stats` at 3.2 MB / 15,296 rows). `n_dead_tup: 1144`, `last_autovacuum: 2026-09-10` — autovacuum is running, no bloat problem. At the current per-day ingestion rate (daily cron + on-visit backstop, 24h lookback window, three live competitions) this table could plausibly 2-3x before hitting even 10% of the DB cap — not urgent, but it's the one table worth a pruning policy conversation if it keeps growing at this rate for another 6+ months. Nothing else in the schema grows unbounded: `odds_snapshots` (NBA) and soccer odds snapshots both have an explicit 48h prune (`src/lib/signals/odds/repo.ts:33-34`, `src/lib/sports/soccer/repo.ts:149-150`) that actually ran — `odds_snapshots` is 0 rows / 5.3 MB shell (already vacuumed, `last_autovacuum: 2026-06-17`), consistent with pruning working, not with it being dead code. `soccer_odds_history` (the never-pruned movement-chart series, by design per CLAUDE.md) is only 270 rows / 112 kB — negligible.
- **Action needed:** none today. Worth a light retention policy (e.g., drop `soccer_news` rows older than N months) if the table doubles again — not now.

### 5. Everything else checked and clean
- **balldontlie (NBA):** `src/lib/sports/nba/balldontlie.ts:47-141` — every endpoint sets an explicit Next `revalidate` (players/teams 24h, games/stats 30-60s), called only from daily crons, currently zero-volume under `NBA_LIGHT_MODE`. No retry loops anywhere in the fetch helper — a failed fetch throws once and bubbles to the route boundary (per project convention), it does not retry-storm.
- **ESPN:** `src/lib/sports/soccer/espn.ts` sets `revalidate` per endpoint (30s for live match summary/scoreboard, 10 min for standings, 24h for team list, 6h for squads) and has exactly one 403-triggered retry against the alternate host per call (`fetchJson:61-64`), not a loop — bounded to 2 attempts max.
- **Odds API 8-day-window / skip-empty-days gating:** verified in code, not just documented. `src/app/api/cron/soccer/track-odds/route.ts:96-101` builds the date window in code (`ahead ?? 8`); `:145-155` explicitly skips a competition with `"no unfinished matches in window — no credits spent"` before calling `fetchSoccerOdds`. NBA's `track-odds/route.ts:75-83` likewise returns `skipped: "no games on target dates"` before ever touching the Odds API.
- **Vercel crons:** all 10 entries in `vercel.json` are daily (`0 H * * *` / `M H * * *`), Hobby-compliant — no sub-daily expressions that would fail at deploy.
- **Client-side polling:** no `SWR` `refreshInterval` usage anywhere in the codebase (grepped clean) and no other `useEffect` polling loop besides `LiveTracker` (item 2 above).
- **Matview refresh (`bro_stats`):** only refreshed from `src/lib/scoring/settle-coupons.ts:168` (`rpc("refresh_bro_stats")`), which runs from the daily `settle-bets`/`settle-coupons` cron path — not on page visit, not per-request.
- **`select("*")` / unbounded queries:** the handful of `select("*")` hits (`src/app/teams/[id]/page.tsx:67`, `src/app/scorecard/page.tsx:92`, `src/lib/analysis/run.ts:76,83`) are all single-row lookups or small batched-by-id queries (teams: 34 rows total; players: 568 rows total, filtered to one slate's team IDs) — no N+1 pattern, no per-row query loop found in any Server Component page I checked.
- **Indexes:** every hot path table (`games`, `soccer_matches`, `predictions`, `soccer_predictions`, `soccer_news`, `player_game_stats`, `system_score_history`, `soccer_odds_history`) has an index matching its actual query shape (date, competition+date, game_id, status, published, etc.) — confirmed via `pg_indexes` against production. No missing-index red flags.

## Recommended fixes

**Actually necessary: none.** Nothing here is broken, and nothing needs new code today. The system already does the two things that matter — single-flight on-visit refresh, and explicit skip-if-no-work gates on the expensive Odds API calls — correctly.

**Nice to have, skip for now:**
- `visibilitychange` pause on `LiveTracker`'s polling loop (cosmetic; upstream cost is already absorbed by the 30s fetch cache).
- A retention/archive policy for `soccer_news` once it's meaningfully closer to the DB cap (it's at 5.6% of the limit today — revisit in a few months, not now).
- Clean up the stale "Gemini engine-take fallbacks" comment in `src/app/api/cron/scrape-news/route.ts:12` — grepped the actual `engine-take.ts` implementations (both NBA and soccer) and found no LLM/HTTP call in either; they're template-generated from our own prediction data, not an external API cost. The comment is just out of date, not a hidden risk — but worth a one-line fix next time that file is touched.
- Re-run the NBA-season Odds-credit math with real numbers after the first live day this season, once `NBA_LIGHT_MODE` is off, to confirm the $30/mo upgrade assumption still holds — not a code change, just a checkpoint.

## Human gate
None of the above requires a decision before shipping anything — this was a read-only audit and no code changed. The one open item is verifying `NBA_LIGHT_MODE`'s production value and recent cron history on the Tiger's-account Vercel session (I deliberately did not check this from the current algosift-authenticated session per house Gold Rule).

## Files touched
None — read-only. Files read/queried for evidence:
- `src/lib/ingest/refresh.ts`, `src/db/migrations/0021_ingest_state.sql`
- `src/app/api/cron/track-odds/route.ts`, `src/app/api/cron/soccer/track-odds/route.ts`
- `src/lib/signals/odds/the-odds-api.ts`, `src/lib/signals/odds/repo.ts`, `src/lib/sports/soccer/repo.ts`
- `src/lib/sports/soccer/espn.ts`, `src/lib/sports/soccer/live.ts`
- `src/components/soccer/LiveTracker.tsx`, `src/app/api/soccer/matches/[id]/live/route.ts`
- `src/lib/sports/nba/balldontlie.ts`
- `src/app/football/page.tsx`, `src/app/football/schedule/page.tsx`, `src/app/football/news/page.tsx`
- `src/lib/signals/news/engine-take.ts`, `src/lib/signals/news/soccer/engine-take.ts`, `src/app/api/cron/scrape-news/route.ts`
- `src/app/teams/[id]/page.tsx`, `src/app/scorecard/page.tsx`, `src/lib/analysis/run.ts`
- `vercel.json`, `.env.local` (existence/keys only, no secrets echoed)
- Live queries: production Postgres via `DATABASE_URL` (`pg_database_size`, `pg_stat_user_tables`, `pg_indexes`, row counts on `soccer_news`, `odds_snapshots`, `soccer_odds_history`, `predictions`, `games`, `player_game_stats`, etc.); The Odds API free `/v4/sports` metadata endpoint for live quota headers (472/500 remaining, 0 cost for that call itself).

## Next
qa-test-engineer or security-auditor, at Kazim's discretion — this audit found nothing that blocks anything; it's informational. No urgent follow-up required.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
