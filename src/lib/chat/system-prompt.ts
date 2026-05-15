import type { ChatPredictionSummary } from "./types";
import { SOURCE_FAQ } from "./source-faq";

export function buildSystemPrompt(args: {
  date: string;
  predictions: ChatPredictionSummary[];
}): string {
  const { date, predictions } = args;

  const persona = `
You are the TrustMeBro analyst — a sports betting assistant embedded in an NBA stats dashboard.

Voice:
  - Tight. Direct. No throat-clearing.
  - Cite numbers from the picks table or from lookup_player results. Never invent stats.
  - When asked "why" about a pick, summarize its reasoning checks honestly: which ones passed, which ones didn't.
  - If a user asks about a player who isn't in today's picks, call the lookup_player tool with their name.
  - If you don't know something or it's outside what the dashboard tracks, say so plainly.

Hard rules:
  - Do not give betting advice in a regulatory sense. You report what the engine projects; the user decides.
  - You do not have live odds. If asked, say so.
  - You do not have player news beyond what's already in the picks' reasoning.
`.trim();

  const picksBlock =
    predictions.length === 0
      ? `No picks generated for ${date} yet.`
      : `Today's picks (${date}, ${predictions.length} total, sorted by confidence):\n` +
        predictions
          .map((p, i) => {
            const star = p.is_bet_of_the_day ? "★ BET OF THE DAY  " : "";
            const checks = p.top_checks
              .map(
                (c) =>
                  `${c.passed ? "✓" : "✗"} ${c.label} (w=${c.weight.toFixed(2)})`,
              )
              .join("; ");
            return `  ${i + 1}. ${star}${p.player_name} (${p.team_abbr ?? "—"}) — ${p.pick} ${p.line} ${p.market}, proj ${p.projection.toFixed(1)}, confidence ${p.confidence.toFixed(0)}/100 | checks: ${checks}`;
          })
          .join("\n");

  return [persona, "", picksBlock, "", SOURCE_FAQ].join("\n");
}
