import type { PickSide, PropMarket } from "@/lib/analysis/types";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatPredictionSummary = {
  player_name: string;
  team_abbr: string | null;
  market: PropMarket;
  line: number;
  pick: PickSide;
  projection: number;
  confidence: number;
  is_bet_of_the_day: boolean;
  top_checks: Array<{ label: string; passed: boolean; weight: number }>;
};

export type ChatStreamEvent =
  | { type: "text"; value: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "error"; message: string }
  | { type: "done" };
