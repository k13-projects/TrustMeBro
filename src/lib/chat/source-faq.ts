/**
 * Static FAQ injected into the chatbot system prompt. Captures the "Source
 * Decisions" log from CLAUDE.md in chatbot-friendly prose so the bot can
 * answer questions like "where does the data come from?" or "how does the
 * scoring work?" without us building real retrieval.
 *
 * When CLAUDE.md's Source Decisions section changes, update this string too.
 */
export const SOURCE_FAQ = `
TrustMeBro — Source & Methodology FAQ

"Today" everywhere in the app means today in America/Los_Angeles.
NBA games are played on US clock, and PT midnight is the latest a slate
can run, so the date rolls over there — not at UTC midnight.

Data sources, in priority order:
  1. Official NBA API / NBA.com.
  2. balldontlie.io (free tier) — currently the primary feed.
  3. ESPN public API as a fallback.
  We never "search the internet" — every number is pinned to a source.

Scope (MVP):
  - NBA only. NFL and other sports are out of scope until NBA proves out.
  - Player prop bets (points, rebounds, assists, threes_made, minutes,
    steals, blocks) and team-level props. No spreads, totals, or moneyline.
  - Daily + per-game projections. No live in-play betting.
  - Pick universe: "players expected to log the most minutes per game" —
    no fixed roster size limit; the threshold is expected minutes.

Confidence scoring:
  - 0–100. Built from weighted checks against the line:
    L5 average vs line, L10 average vs line, season average, home/away
    split, head-to-head vs opponent, anomaly flags, off-court signals.
  - Each pick exposes the checks that passed and their weights — that's
    the "reasoning" the dashboard shows.

Daily output:
  - Minimum 10 picks per day, sorted by confidence.
  - Highest-confidence pick is promoted to "Bet of the Day" (starred).
  - Combo bets: two high-confidence picks can be paired.

System reward/penalty (the "Trust Me Bro" honesty mechanism):
  - Won bet: +1.0 to system_score.
  - Lost bet: -0.5 to system_score.
  - Void / push: no change.
  - Goal: stay positive. If we can't, the engine isn't worth trusting.

Dashboard color code:
  - Season average: blue.
  - Previous game: amber.
  - Two games ago: cyan.
  - Last 10 average: emerald.
  - Anomaly alert: triggers when the last-game value is > 1.5 std dev
    from the L10 average.

Off-court signals (inputs beyond raw stats):
  - Magazine / press articles.
  - Newsletters (parsed from inbox).
  - Social media (X, Reddit).
  - Injury reports, press-conference quotes.
  - Odds movement (bookmaker line shifts).

History:
  - Users mark "I played this" on a prediction; the result is recorded.
  - Settlement runs after games finalize. Both the system score and the
    user's personal record update.

Legal posture:
  - This is an analysis + education tool. We present projections; we do
    not integrate with bookmakers and do not accept wagers.
`.trim();

/**
 * Soccer / World Cup variant of the FAQ. The football side of the app runs a
 * separate engine (match markets, not player props) with its own ledger, so
 * the methodology differs enough to warrant its own prompt block. Surfaced
 * when the active sport is soccer. Keep in sync with the soccer engine
 * (src/lib/analysis/soccer/engine.ts) and CLAUDE.md's soccer notes.
 */
export const SOCCER_SOURCE_FAQ = `
TrustMeBro — Football (World Cup) Source & Methodology FAQ

"Today" everywhere in the app means today in America/Los_Angeles. Kickoff
times shown to you are in that frame unless stated otherwise.

Data sources:
  - Match schedule, scores, and standings: ESPN's public soccer API.
  - Odds: bookmaker player/market odds via The Odds API, captured into
    snapshots. Confidence is built from those odds, not guessed.
  - We never "search the internet" — every number is pinned to a source.

Scope:
  - Match-level markets only — there is no player-prop dimension in football:
      • Match Result (match_winner): home win / draw / away win.
      • Total Goals (total_goals): over/under a goals line (e.g. 2.5).
      • Both Teams To Score (btts): yes / no.
  - Pre-match picks. No live in-play betting.

How the engine picks:
  - For each market it de-vigs the consensus probability across bookmakers
    (strips the overround, averages across books), lightly nudged by league-
    table form (points + goal difference, capped at ~4 points).
  - It backs only its single best read per market — not every outcome — and
    only when that read beats a coin flip (de-vigged probability ≥ 50%).
    Backing every side is self-defeating on a win-rate scoreboard (a 3-way
    match result caps at 33%). Best-side-only lifted the backtest from ~40%
    to ~69%.
  - Confidence = the de-vigged probability scaled to 0–100. Expected value =
    (probability × best decimal odds) − 1, using the best price across books.

BANKO:
  - The engine's highest-conviction reads (its strongest, safest picks) are
    flagged BANKO. In backtest the BANKO tier (confidence ≥ 60) hit ~83%.

Confidence reasoning (the checks you can cite):
  - "De-vigged consensus probability" (weight 0.7) — the core read.
  - "Bookmaker agreement" (weight 0.2) — how many books priced the full market.
  - "Table form edge" (weight 0.1) — only on match result, when standings
    favor one side.

System reward/penalty (football has its own ledger, separate from NBA):
  - Won pick: +1.0. Lost pick: −1.0. Void / push: no change.
  - Engine coupons (BANKO / multiplier / surprise parlays) combine legs; a
    coupon needs every leg to land.

Legal posture:
  - This is an analysis + education tool. We present projections; we do not
    integrate with bookmakers and do not accept wagers.
`.trim();
