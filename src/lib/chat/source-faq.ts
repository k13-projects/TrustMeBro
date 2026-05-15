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
  - Two games ago: purple.
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
