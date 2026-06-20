import type { PickSide, PropMarket } from "@/lib/analysis/types";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

export type ChatSport = "nba" | "soccer";

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

// Soccer is match-level (no player dimension): home/draw/away, over/under
// goals, both-teams-to-score. `side_label` is the human rendering of
// (market, side, line) against the two team names, precomputed so the prompt
// doesn't have to know team names to phrase a pick.
export type SoccerChatPredictionSummary = {
  match: string;
  market: SoccerMarket;
  side: MatchSide;
  side_label: string;
  line: number | null;
  confidence: number;
  best_odds: number;
  is_banko: boolean;
  kickoff: string | null;
  top_checks: Array<{ label: string; passed: boolean; weight: number }>;
};

// Snapshot of the user's current draft coupon. Sent on every chat request
// so the bot answers "what's in my coupon" / "is this pick safe" / "what's
// the payout" without the user pasting it in. A coupon is single-sport, so
// the top-level `sport` and every pick's `sport` agree.
export type ChatCouponPick =
  | {
      sport: "nba";
      prediction_id: string;
      player_name: string;
      team_abbr: string | null;
      market: PropMarket;
      line: number;
      pick: PickSide;
      confidence: number;
    }
  | {
      sport: "soccer";
      prediction_id: string;
      match: string;
      market: SoccerMarket;
      side: MatchSide;
      side_label: string;
      line: number | null;
      confidence: number;
      best_odds: number | null;
    };

export type ChatCouponContext = {
  mode: "power" | "flex";
  stake: number;
  sport: ChatSport;
  picks: ChatCouponPick[];
};

export type ChatStreamEvent =
  | { type: "text"; value: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "error"; message: string }
  | { type: "done" };
