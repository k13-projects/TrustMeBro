import type { ChatCouponContext, ChatPredictionSummary } from "./types";
import { SOURCE_FAQ } from "./source-faq";
import { marketLabel } from "@/components/MarketLabel";
import {
  fallbackPayoutMap,
  powerPayoutFrom,
  flexPayoutFrom,
} from "@/lib/analysis/payouts";

function renderCoupon(coupon: ChatCouponContext): string {
  const map = fallbackPayoutMap();
  const n = coupon.picks.length;
  const multiplier =
    coupon.mode === "power"
      ? powerPayoutFrom(map, n)
      : flexPayoutFrom(map, n);
  const potential = multiplier !== null ? coupon.stake * multiplier : null;
  // Combined-confidence math mirrors generateCombos: naive independence
  // product, percentage with one-decimal floor.
  const combined =
    Math.floor(
      coupon.picks.reduce((acc, p) => acc * (p.confidence / 100), 1) * 1000,
    ) / 10;
  const headerBits = [
    `${n}-pick ${coupon.mode.toUpperCase()}`,
    `stake $${coupon.stake.toFixed(2)}`,
    multiplier !== null && potential !== null
      ? `${multiplier}× → $${potential.toFixed(2)}`
      : "no multiplier available for this pick count/mode",
    `combined ${combined}%`,
  ];
  const lines = coupon.picks.map(
    (p, i) =>
      `${i + 1}. **${p.player_name}** (${p.team_abbr ?? "—"}) — ${p.pick.toUpperCase()} ${p.line} ${marketLabel(p.market)} · conf ${p.confidence.toFixed(0)}`,
  );
  return [
    `**User's current draft coupon** (not yet saved — they're building it in the cart drawer):`,
    `- ${headerBits.join(" · ")}`,
    ...lines.map((l) => `- ${l}`),
    "",
    `When the user asks about "my coupon" / "this combo" / "my picks", refer to these picks specifically. If they ask whether a pick is risky, compare its confidence to the rest of the slate. Don't recommend they remove or add picks unless they ask — they decide.`,
  ].join("\n");
}

export function buildSystemPrompt(args: {
  date: string;
  predictions: ChatPredictionSummary[];
  coupon?: ChatCouponContext | null;
}): string {
  const { date, predictions, coupon } = args;

  const persona = `
You are the TrustMeBro analyst — a sports betting assistant embedded in an NBA stats dashboard.

Voice:
  - Tight. Direct. No throat-clearing.
  - Cite numbers from the picks table or from lookup_player results. Never invent stats.
  - When asked "why" about a pick, summarize its reasoning checks honestly: which ones passed, which ones didn't.
  - If a user asks about a player who isn't in today's picks, call the lookup_player tool with their name.
  - If you don't know something or it's outside what the dashboard tracks, say so plainly.

Format:
  - Output GitHub-flavored markdown. Use **bold** for emphasis, bullet lists with "- ", numbered lists where order matters.
  - Each bullet on its own line — never separate ideas with semicolons or "|" on a single line.
  - For reasoning checks, render one per bullet: "- ✓ Last-5 avg vs line (weight 0.45)".
  - Keep paragraphs short. Prefer lists over walls of text.
  - Do not use h1/h2 headings (#). Bold lead-ins are fine.

Hard rules:
  - Do not give betting advice in a regulatory sense. You report what the engine projects; the user decides.
  - You do not have live odds. If asked, say so.
  - You do not have player news beyond what's already in the picks' reasoning.

Follow-ups:
  - End every response with a new line containing exactly the marker <<<followups>>> followed by three short follow-up questions, one per line, each prefixed with "- ".
  - These are next-questions a curious user might ask given what you just said. Keep them under ~60 characters each.
  - Do not announce or reference the marker in prose. Place it after the final paragraph/list of your answer.
`.trim();

  const picksBlock =
    predictions.length === 0
      ? `No picks generated for ${date} yet.`
      : `Today's picks (${date}, ${predictions.length} total, sorted by confidence):\n\n` +
        predictions
          .map((p, i) => {
            const star = p.is_bet_of_the_day ? "★ BET OF THE DAY — " : "";
            const checks = p.top_checks
              .map(
                (c) =>
                  `   - ${c.passed ? "✓" : "✗"} ${c.label} (w=${c.weight.toFixed(2)})`,
              )
              .join("\n");
            return `${i + 1}. ${star}**${p.player_name}** (${p.team_abbr ?? "—"}) — ${p.pick.toUpperCase()} ${p.line} ${p.market}\n   - Projection: ${p.projection.toFixed(1)} · Confidence: ${p.confidence.toFixed(0)}/100\n${checks}`;
          })
          .join("\n\n");

  const couponBlock =
    coupon && coupon.picks.length > 0 ? renderCoupon(coupon) : "";

  return [
    persona,
    "",
    picksBlock,
    ...(couponBlock ? ["", couponBlock] : []),
    "",
    SOURCE_FAQ,
  ].join("\n");
}
