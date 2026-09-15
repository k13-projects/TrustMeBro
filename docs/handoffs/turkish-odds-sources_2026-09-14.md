# Research: cheaper/free bookmaker odds source for Turkish Süper Lig

**Date:** 2026-09-14 · **Requested by:** Kazim (via James) · **Scope:** odds only — fixtures/scores/standings (ESPN, free) are out of scope.

## Recommendation (read this, skip the table if you're in a hurry)

**Stay on The Odds API. Don't migrate.** Nothing free clears the bar (a real free tier with multiple sharp/mainstream bookmakers on a domestic league), and nothing cheap-and-real beats the zero-migration-cost option of managing the existing account better. Two moves, in order of preference:

1. **$0/mo — poll Süper Lig less than daily.** The credit collision is arithmetic, not a coverage problem: Süper Lig is 1 match window/week but daily polling wastes credits on off-days. The Odds API already has everything we need (h2h + totals, uk/eu regions, `soccer_turkey_super_league` confirmed live today) in the exact shape `SoccerOddsQuote` already expects. Tightening the poll cadence for domestic-league-only days (vs. UCL/UEL/UECL midweek clusters) buys back most of the ~120 credits/month without touching code architecture. This is a scheduling decision, not a new integration — flagging it as the cheapest lever, not prescribing the change itself (no code written, per scope).
2. **$30/mo — The Odds API's own 20K plan**, if the credit math still gets tight once NBA season and Süper Lig+UCL/UEL/UECL overlap (Oct–May, every year). 20,000 credits/month vs. a few hundred needed is not a close call, it's all-sports/all-bookmakers/all-markets on the plan we already speak fluently, plus historical odds as a bonus. This is a config/billing change, not an engineering project — no new provider module, no new `SoccerOddsQuote` mapping, no new failure mode to learn.

**If a genuinely different/second source is wanted anyway** (redundancy, or to eventually replace The Odds API outright for football), **API-Football Pro ($19/mo, 7,500 req/day, odds endpoint included at every tier)** is the only other candidate worth a trial — everything else is either enterprise-priced, has a free tier that structurally excludes domestic leagues, or doesn't exist as a documented API at all. Its actual Süper Lig bookmaker depth is unverified from public docs (see table) — don't commit before a real trial call confirms bookmaker count and consensus quality for this specific league.

**Nothing at "free or under $10/mo" beats what we already have.** That's the honest answer to the question as asked.

---

## Comparison table

| Source | Süper Lig odds? | Markets | Bookmakers | Free tier (verified) | Cheapest paid entry | Auth / shape | Verdict |
|---|---|---|---|---|---|---|---|
| **The Odds API (current)** | Yes — `soccer_turkey_super_league` confirmed live 2026-09-14 | h2h, totals, (BTTS needs per-event endpoint) | Full uk/eu bookmaker set, modal-consensus already built | 500 credits/mo, 4 credits/call at our params (2 markets × 2 regions) | $30/mo → 20,000 credits/mo | REST/JSON, header-based credit counters, already integrated (`src/lib/signals/odds/soccer.ts`) | **Keep.** The only "problem" is credit budgeting during NBA overlap, not coverage or quality. |
| **API-Football** (api-football.com / RapidAPI) | Marketing claims 60+ bookmakers platform-wide and lists Turkey Süper Lig as a covered league; **per-league bookmaker depth for Süper Lig specifically is not documented publicly** | Pre-match + in-play odds, all endpoints available on every tier (free included) — historical *seasons* are the thing free tier restricts, not the odds endpoint itself | 60+ claimed platform-wide; unverified for this league | 100 req/day, 10 req/min, odds endpoint accessible (not gated by tier) | Pro $19/mo → 7,500 req/day; Ultra $29/mo → 75,000/day; Mega $39/mo → 150,000/day | REST/JSON, `x-rapidapi-key` or direct key; response shape is fixture-centric (odds per fixture per bookmaker) — needs a new parser, not a drop-in for `SoccerOddsQuote` | **Best fallback if a second source is truly wanted.** Verify Süper Lig bookmaker count with a live trial call before committing budget or engineering time. |
| **Sportmonks** | Yes, explicitly: "Süper Lig access is included in every paid plan" | Base plans include "pre-match & in-play odds"; a separate **Premium Odds Feed (TXODDS)** add-on (~€129/mo) is sold on top for deeper bookmaker granularity/movement — unclear if base-plan odds depth is enough for modal-consensus use | 50+ claimed for the premium add-on; base-plan depth undocumented | **None** — no odds without a paid plan | Starter €29/mo (~$31) for league access + base odds; **effectively ~$140+/mo** if the Premium Odds Feed is needed for real multi-bookmaker consensus | REST/JSON, well-documented, would need a full new provider module | Over budget on the "under $10" ask, and the useful odds tier (Premium) is far over budget. Deprioritized. |
| **odds-api.io** | Unconfirmed — free tier is capped to "2 recreational bookmakers," and Süper Lig's presence in that 2-bookmaker set isn't documented | h2h and totals typical of the category, unconfirmed for this tier | **2 recreational bookmakers only** on free; sharp books/exchanges are paid-only | 100 req/hour (500/day) — **but the vendor's own pricing page states new free API keys are "paused indefinitely" as of this check**, i.e. not obtainable for a new signup right now | Solo £49/mo (2 bookmakers) → Pro £229/mo (15 bookmakers) | REST/JSON | **Disqualified for now** — free tier is gated shut to new signups, and even when open, 2 recreational books isn't enough for a modal-consensus approach. |
| **SportsGameOdds** | Not present at free tier (8 US leagues: NFL/NBA/MLB/NHL etc.); unconfirmed even at Rookie ($99/mo, 17 leagues) | Odds, scores, settlement bundled as "objects" | 9 bookmakers on free tier (all US-facing); breadth grows with paid tiers | 2,500 objects/mo, 10 req/min, **no Süper Lig** | Rookie $99/mo (100k objects) | REST/JSON | **Disqualified for this need** — free tier structurally US-major-league-only; even paid entry tier's Süper Lig coverage is unconfirmed and priced above budget anyway. |
| **OddsJam** | Presumably (large sportsbook-scanner coverage), but undocumented — there is no public pricing or self-serve signup for the developer API | N/A — sales-gated | N/A | **None** | No published price; community reports ≈$5,000+/mo, contact-sales only | Opaque | **Disqualified — price/access model.** Not a "trade-off," just not reachable at any budget this project has. |
| **OpticOdds** | Same situation as OddsJam | N/A | N/A | **None** | No published price; community reports ≈$5,000/mo *per sport*, enterprise sales only | Opaque | **Disqualified — price/access model.** |
| **Pinnacle (official API)** | N/A | N/A | N/A | N/A | N/A | **Pinnacle closed public API access on 2025-07-23.** No official path exists anymore. | **Disqualified — no longer exists.** |
| **Pinnacle via third-party resellers** (pinnapi, SharpAPI's Sharp tier, etc.) | Unconfirmed for Süper Lig specifically | Varies | Mirrors Pinnacle's own book (1 bookmaker, albeit a sharp one) | Some claim small free tiers (100 req/day) | $99–$399/mo depending on reseller | Unofficial re-hosting of a feed Pinnacle itself shut off | **Flagged as unofficial/fragile** — these are third parties reverse-engineering or re-selling access to a bookmaker that itself closed public access; can vanish or get cut off with no notice, and Süper Lig depth is unverified. Not recommended even setting aside cost. |
| **football-data.org** | No — odds are an explicit **paid add-on**, not in the free tier at all | N/A on free | N/A on free | 10 req/min, 12 competitions, **no odds** | Odds add-on ~€15/mo *on top of* other required add-ons (livescores €12 + deep data €29 + statistics €15) → **€70+/mo stack** for narrower coverage than The Odds API's $30/mo tier | REST/JSON | **Disqualified for this need** — free tier has zero odds; paid stack is worse value than staying put. |
| **football-data.co.uk** (historical CSVs) | Yes — confirmed: Turkish Süper Lig CSVs from the 1994/95 season through the current 2026/27 season, last updated 2026-09-07 | Match odds (1X2), total goals (O/U), Asian handicap | ~15+ bookmakers historically, not individually itemized on the page | Free, no auth, plain CSV download | N/A — free | Static CSV, not an API; **historical only, no live/upcoming odds** | **Good, free, but not a live-odds source.** Genuinely useful for backtesting the engine's Süper Lig picks against real historical lines — worth pulling in separately from the live-odds question, not a substitute for it. |
| **Turkish domestic operators** (İddaa, Nesine, Bilyoner, Misli, Tuttur) | See below | — | — | — | — | — | **Disqualified.** See legal/ToS section. |

---

## Turkish domestic bookmakers — why they're disqualified, plainly

None of İddaa, Nesine, Bilyoner, Misli, or Tuttur publish a documented public API for odds data. There is no developer portal, no API key signup, no rate-limit docs — nothing to integrate against. That alone rules them out under this project's own rule (JSON over HTTP, stable, documented).

Checked `robots.txt` directly on each domain today (2026-09-14) as a factual data point, not as a green light:
- **iddaa.com** explicitly lists `claude-code`, `claudebot`, `chatgpt-user`, `anthropic-ai`, and other AI-agent user-agents with `Allow: /` (only match-detail pages are disallowed for the generic crawler group). Crawling is *technically* not blocked.
- **nesine.com** goes further — it publishes an `llms.txt` and explicitly allows `ClaudeBot`, `anthropic-ai`, `GPTBot`, `PerplexityBot`, etc. with `Allow: /`.
- **misli.com** and **tuttur.com** block only account/session pages (standard practice), nothing odds-related.
- **bilyoner.com**'s `robots.txt` endpoint returned a login-wall JSON error rather than a real robots file.

**This does not change the disqualification.** `robots.txt` allowing a crawler to fetch pages is not the same thing as a license to systematically extract betting lines and redistribute them inside a commercial-facing product — that's a ToS and licensing question, and none of these operators has a public ToS clause (or any API terms at all) granting that. More importantly:

- İddaa operates under Turkey's state betting monopoly, regulated by the **Spor Toto Teşkilat Başkanlığı** under **Law No. 7258** (the law that criminalizes unlicensed betting operation and, by extension, unauthorized commercial exploitation of licensed betting data/markets). This is a real Turkish regulatory exposure, not a hypothetical one, for a US-based app systematically pulling and redistributing İddaa-sourced lines.
- Nesine, Bilyoner, Misli, and Tuttur are themselves licensees operating *under* that same state framework, not independent commercial data vendors — the same exposure applies by extension.
- Building against any of them would necessarily mean reverse-engineering an internal/undocumented endpoint (no public API exists), which is exactly the "unofficial endpoint" risk called out in the brief: it can vanish, get blocked, or get legally contested with zero notice, and it fails the "respect ToS" house rule regardless of what `robots.txt` happens to say.

**Conclusion: not a trade-off, a hard no.** Flagging this clearly per the brief's instruction — this isn't "cheaper but riskier," it's disqualified on documentation, ToS, and Turkish gaming-law grounds simultaneously.

---

## What it would actually cost us per month

| Option | Monthly cost | What changes |
|---|---|---|
| **The Odds API, tighter Süper Lig poll cadence** | **$0** | No code migration. Scheduling/cadence tuning only (not specified here — no code was written per scope). Stays inside the existing 500-credit free tier even during NBA overlap, *if* the cadence is actually tightened on non-matchday windows. |
| **The Odds API, 20K plan** | **$30** | No code migration at all — same key, same endpoint, same `SoccerOddsQuote` shape. Credit ceiling stops being a planning problem for any sport this project will plausibly add. |
| **API-Football Pro** (only if a second/independent source is wanted) | **$19** | New provider module, new response parser, new mapping into `SoccerOddsQuote`, and a trial run first to confirm Süper Lig bookmaker depth is actually usable for modal-consensus picks — real engineering cost on top of the $19. |

---

## Risk notes — what's unofficial/undocumented and could vanish

- **Pinnacle via any third-party reseller** (pinnapi, SharpAPI's Sharp tier) — mirrors a feed Pinnacle itself shut off publicly in July 2025. Structurally fragile: it depends on the reseller maintaining access Pinnacle didn't intend to keep open.
- **Any Turkish domestic-operator "API"** — would necessarily be an unofficial/reverse-engineered internal endpoint, since none publishes a real one. Same fragility as above, plus the legal exposure covered above. Disqualified regardless.
- **odds-api.io's free tier** — currently closed to new signups per the vendor's own pricing page ("new free API keys are paused indefinitely"), so even the free option that does exist can't actually be obtained today.

Nothing in the recommended path (staying on The Odds API, either cadence-tuned or upgraded to 20K) touches an undocumented endpoint at all — that's part of why it's the recommendation.

---

## Sources

- [The Odds API — pricing](https://the-odds-api.com/) (20K/100K/5M/15M paid tiers, verified via primary site fetch 2026-09-14)
- [The Odds API — Football Odds page](https://the-odds-api.com/sports-odds-data/football-odds.html)
- [API-Football — pricing plans](https://www.api-football.com/pricing)
- [API-Football — how ratelimit works](https://www.api-football.com/news/post/how-ratelimit-works)
- [Sportmonks — Football API pricing](https://www.sportmonks.com/football-api/plans-pricing/)
- [Sportmonks — Süper Lig API page](https://www.sportmonks.com/football-api/super-lig-api/)
- [odds-api.io — free tier pricing](https://odds-api.io/pricing/free)
- [odds-api.io — pricing](https://odds-api.io/pricing)
- [SportsGameOdds — pricing](https://sportsgameodds.com/pricing)
- [football-data.org — pricing](https://www.football-data.org/pricing)
- [football-data.co.uk — Turkey Süper Lig historical odds](https://www.football-data.co.uk/turkeym.php)
- [pinnapi — "The Pinnacle API Closed" writeup on the July 2025 shutdown](https://pinnapi.com/blog/pinnacle-api-alternative-2026)
- iddaa.com, nesine.com, misli.com, tuttur.com, bilyoner.com `/robots.txt` — fetched directly 2026-09-14
- Spor Toto Teşkilat Başkanlığı / Law No. 7258 — general legal-framework context via Turkish legal-practice search results (kadimhukuk.com.tr, esercelik.av.tr); no direct primary statute text fetched, flagged as general-context, not verbatim legal citation

**Caveat on secondary sources:** a cluster of near-identical "odds API comparison" content sites (oddspapi.io, sharpapi.io, thestatsapi.com, bigballsdata.com, parlay-api.com, wagerlab.app, highlightly.net, freeapihub.com, goal-api.com) surfaced repeatedly and appear to be SEO/marketing content that cite and rank against each other rather than independent reporting. Numbers from those were **not** used in this report's table unless corroborated on the named vendor's own primary domain (e.g., odds-api.io's own `/pricing` page, api-football.com's own pricing page, sportmonks.com's own pages). Treat any number attributed only to one of those comparison sites, anywhere else, with real skepticism.

---

## Status      PASS
## Summary     Investigated 10+ bookmaker-odds sources for Turkish Süper Lig against TrustMeBro's free-or-<$10/mo bar. None clear it with comparable coverage/quality. Recommendation: stay on The Odds API — tighten Süper Lig poll cadence for $0, or take their own $30/mo 20K-credit plan if the cadence fix isn't enough — both are zero-migration. Turkish domestic operators (İddaa/Nesine/Bilyoner/Misli/Tuttur) are disqualified on no-documented-API + Turkish gaming-law grounds, not just ToS technicalities. football-data.co.uk is a genuine free historical-odds CSV source, good for backtesting only.
## For Kazim   There's no free replacement for the Süper Lig odds source — everything free either doesn't cover Turkish domestic odds or caps out at 1-2 minor bookmakers; the cheapest real fix is just polling Süper Lig less often (free) or paying our current provider $30/month instead of switching providers. The Turkish betting sites (İddaa, Nesine, etc.) don't have a public data feed at all, and pulling their odds would run into real Turkish gambling-law risk, not just a terms-of-service technicality — so that path is off the table.
## Files       docs/handoffs/turkish-odds-sources_2026-09-14.md (this report — research only, no code changed)
## Risks       None from this research itself (no code touched). Implementation risk to flag whenever cadence tuning or a plan upgrade is actually made: NBA season and Süper Lig/UCL/UEL/UECL overlap Oct–May every year, so the credit budget should be re-checked each season, not assumed static.
## Next        solutions-architect (Selma) if Kazim wants the credit-budget/cadence fix or the $30/mo upgrade scoped into an actual implementation plan; no engineering work should start from this report alone.
## Human gate  The $30/mo plan upgrade is a real (if small) recurring cost — that's a money decision for Kazim, not an autonomous one. Everything else in this report is informational.
