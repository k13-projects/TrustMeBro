import type {
  ChatCouponContext,
  ChatPredictionSummary,
  ChatSport,
  SoccerChatPredictionSummary,
} from "./types";
import { SOURCE_FAQ, SOCCER_SOURCE_FAQ } from "./source-faq";
import { marketLabel } from "@/components/MarketLabel";
import { marketLabel as soccerMarketLabel } from "@/lib/sports/soccer/labels";
import {
  fallbackPayoutMap,
  powerPayoutFrom,
  flexPayoutFrom,
} from "@/lib/analysis/payouts";

function couponHeader(coupon: ChatCouponContext): string[] {
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
  return [
    `${n}-pick ${coupon.mode.toUpperCase()}`,
    `stake $${coupon.stake.toFixed(2)}`,
    multiplier !== null && potential !== null
      ? `${multiplier}× → $${potential.toFixed(2)}`
      : "no multiplier available for this pick count/mode",
    `combined ${combined}%`,
  ];
}

function renderCoupon(coupon: ChatCouponContext): string {
  const lines = coupon.picks.map((p, i) => {
    if (p.sport === "soccer") {
      return `${i + 1}. **${p.match}** — ${p.side_label} · ${soccerMarketLabel(p.market)} · conf ${p.confidence.toFixed(0)}`;
    }
    return `${i + 1}. **${p.player_name}** (${p.team_abbr ?? "—"}) — ${p.pick.toUpperCase()} ${p.line} ${marketLabel(p.market)} · conf ${p.confidence.toFixed(0)}`;
  });
  return [
    `**User's current draft coupon** (not yet saved — they're building it in the cart drawer):`,
    `- ${couponHeader(coupon).join(" · ")}`,
    ...lines.map((l) => `- ${l}`),
    "",
    `When the user asks about "my coupon" / "this combo" / "my picks", refer to these picks specifically. If they ask whether a pick is risky, compare its confidence to the rest of the slate. Don't recommend they remove or add picks unless they ask — they decide.`,
  ].join("\n");
}

function nbaPersona(): string {
  return `
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
}

function soccerPersona(): string {
  return `
You are the TrustMeBro analyst — a sports betting assistant embedded in a football / World Cup stats dashboard.

Football is match-level: there are no player props here. The markets are Match Result (home / draw / away), Total Goals (over/under a line), and Both Teams To Score (yes/no). Talk in those terms — never reference points, rebounds, assists, or any NBA prop.

Voice:
  - Tight. Direct. No throat-clearing.
  - Cite the numbers from the picks table or from lookup_team results. Never invent stats.
  - When asked "why" about a pick, summarize its reasoning checks honestly: which ones passed, which ones didn't. The core read is the de-vigged consensus probability across books.
  - If a user asks about a team that isn't in today's picks, call the lookup_team tool with the team name.
  - If you don't know something or it's outside what the dashboard tracks, say so plainly.

Format:
  - Output GitHub-flavored markdown. Use **bold** for emphasis, bullet lists with "- ", numbered lists where order matters.
  - Each bullet on its own line — never separate ideas with semicolons or "|" on a single line.
  - For reasoning checks, render one per bullet: "- ✓ De-vigged consensus probability (weight 0.70)".
  - Keep paragraphs short. Prefer lists over walls of text.
  - Do not use h1/h2 headings (#). Bold lead-ins are fine.

Hard rules:
  - Do not give betting advice in a regulatory sense. You report what the engine projects; the user decides.
  - The engine backs only its single best read per market — don't suggest it has an opinion on the other sides unless the user asks you to reason about them.
  - You do not have team news or injury reports beyond what's in the picks' reasoning.

Follow-ups:
  - End every response with a new line containing exactly the marker <<<followups>>> followed by three short follow-up questions, one per line, each prefixed with "- ".
  - These are next-questions a curious user might ask given what you just said. Keep them under ~60 characters each.
  - Do not announce or reference the marker in prose. Place it after the final paragraph/list of your answer.
`.trim();
}

function renderChecks(
  checks: Array<{ label: string; passed: boolean; weight: number }>,
): string {
  return checks
    .map(
      (c) => `   - ${c.passed ? "✓" : "✗"} ${c.label} (w=${c.weight.toFixed(2)})`,
    )
    .join("\n");
}

function nbaPicksBlock(
  date: string,
  predictions: ChatPredictionSummary[],
): string {
  if (predictions.length === 0) return `No picks generated for ${date} yet.`;
  return (
    `Today's picks (${date}, ${predictions.length} total, sorted by confidence):\n\n` +
    predictions
      .map((p, i) => {
        const star = p.is_bet_of_the_day ? "★ BET OF THE DAY — " : "";
        return `${i + 1}. ${star}**${p.player_name}** (${p.team_abbr ?? "—"}) — ${p.pick.toUpperCase()} ${p.line} ${p.market}\n   - Projection: ${p.projection.toFixed(1)} · Confidence: ${p.confidence.toFixed(0)}/100\n${renderChecks(p.top_checks)}`;
      })
      .join("\n\n")
  );
}

function soccerPicksBlock(
  date: string,
  predictions: SoccerChatPredictionSummary[],
): string {
  if (predictions.length === 0)
    return `No football picks generated for ${date} yet.`;
  return (
    `Today's football picks (${date}, ${predictions.length} total, sorted by confidence):\n\n` +
    predictions
      .map((p, i) => {
        const star = p.is_banko ? "★ BANKO — " : "";
        return `${i + 1}. ${star}**${p.match}** — ${p.side_label} (${soccerMarketLabel(p.market)})\n   - Confidence: ${p.confidence.toFixed(0)}/100 · Best odds: ${p.best_odds.toFixed(2)}${p.kickoff ? ` · Kickoff: ${p.kickoff}` : ""}\n${renderChecks(p.top_checks)}`;
      })
      .join("\n\n")
  );
}

export function buildSystemPrompt(args: {
  sport: ChatSport;
  date: string;
  nbaPredictions?: ChatPredictionSummary[];
  soccerPredictions?: SoccerChatPredictionSummary[];
  coupon?: ChatCouponContext | null;
}): string {
  const { sport, date, coupon } = args;
  const isSoccer = sport === "soccer";

  const persona = isSoccer ? soccerPersona() : nbaPersona();
  const picksBlock = isSoccer
    ? soccerPicksBlock(date, args.soccerPredictions ?? [])
    : nbaPicksBlock(date, args.nbaPredictions ?? []);
  const faq = isSoccer ? SOCCER_SOURCE_FAQ : SOURCE_FAQ;

  const couponBlock =
    coupon && coupon.picks.length > 0 ? renderCoupon(coupon) : "";

  return [
    persona,
    "",
    picksBlock,
    ...(couponBlock ? ["", couponBlock] : []),
    "",
    faq,
  ].join("\n");
}
