import type { Reasoning, PropMarket } from "./types";

const MARKET_NOUN: Record<PropMarket, string> = {
  points: "points",
  rebounds: "rebounds",
  assists: "assists",
  threes_made: "threes",
  minutes: "minutes",
  pra: "PRA",
  steals: "steals",
  blocks: "blocks",
};

// Each check label gets a hand-written phrase template so the summary reads
// like an actual sentence instead of "Last 5 avg 28.6 vs 25.5". Falls back
// to a generic phrase for any future label we add but forget to wire here.
function phraseForCheck(
  label: string,
  value: number,
  marketNoun: string,
): string {
  const v = formatStat(value);
  switch (label) {
    case "Last 5 avg":
      return `he averaged ${v} ${marketNoun} over his last 5 games`;
    case "Last 10 avg":
      return `his last 10 average sits at ${v}`;
    case "Season avg":
      return `he's at ${v} for the season`;
    case "Home avg":
      return `at home he averages ${v}`;
    case "Away avg":
      return `on the road he averages ${v}`;
    case "Vs. opponent":
      return `he's gone for ${v} against this opponent historically`;
    case "Last game":
      return `he posted ${v} in his most recent game`;
    default:
      return `${label.toLowerCase()} reads ${v}`;
  }
}

function formatStat(n: number): string {
  if (Math.abs(n) >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(1);
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
}

type PredictionLike = {
  line: number;
  pick: "over" | "under";
  market: string;
  reasoning: Reasoning | null;
  projection: number;
};

/**
 * Build a 1-2 sentence natural-language explanation of why the engine
 * picked this side of the prop. Uses the top 2-3 passed checks by weight.
 *
 * Falls back to a stat-light line if no statistical check passed (rare —
 * usually means the engine fired on off-court signals alone).
 */
export function buildReasoningSummary(prediction: PredictionLike): string {
  const reasoning = prediction.reasoning as Reasoning | null;
  const checks = reasoning?.checks ?? [];

  const passed = checks
    .filter((c) => c.passed && c.weight >= 0.05)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const side = prediction.pick === "over" ? "OVER" : "UNDER";
  const marketNoun =
    MARKET_NOUN[prediction.market as PropMarket] ?? prediction.market;
  const lead = `Picked ${side} ${prediction.line} ${marketNoun}`;

  if (passed.length === 0) {
    return `${lead} — engine projection landed at ${formatStat(prediction.projection)}, mostly carried by off-court signals on this slate.`;
  }

  const phrases = passed.map((c) => phraseForCheck(c.label, c.value, marketNoun));
  const body = joinPhrases(phrases);
  // Drop the "OVER 25.5 points" prefix in favor of starting the sentence
  // with the most important reason. Lead reads as a tag, body reads as prose.
  return `${lead} because ${body}.`;
}
