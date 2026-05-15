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

// Snapshot of the user's current draft coupon. Sent on every chat request
// so the bot answers "what's in my coupon" / "is this pick safe" / "what's
// the payout" without the user pasting it in.
export type ChatCouponContext = {
  mode: "power" | "flex";
  stake: number;
  picks: Array<{
    prediction_id: string;
    player_name: string;
    team_abbr: string | null;
    market: PropMarket;
    line: number;
    pick: PickSide;
    confidence: number;
  }>;
};

export type ChatStreamEvent =
  | { type: "text"; value: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "error"; message: string }
  | { type: "done" };
