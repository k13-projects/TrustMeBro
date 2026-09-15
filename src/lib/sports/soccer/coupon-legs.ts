import { z } from "zod";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

// Contract for the soccer-leg half of POST /api/coupons — the shape a
// future rates-board UI (docs/handoffs/user-coupons-plan_2026-09-14.md
// section 4) builds its request body against. No "server-only": this file
// has no secrets, just types + the zod schema the client can validate
// against before it ever calls the endpoint.
//
// `kind: "engine"` is today's coupon leg — a soccer_predictions row the
// engine already generated. `kind: "user"` is a rates-board outcome the
// viewer picked directly, with no prediction backing it. Both are accepted
// side by side in the same coupon (a same-game or cross-game parlay mixing
// engine picks and user picks is allowed).
//
// The server NEVER trusts `odds_taken` as the price to lock in — it always
// re-derives the true consensus price for (match_id, market, side, line) at
// request time and freezes that number instead, rejecting the request if the
// client's number doesn't match within rounding (see
// docs/handoffs/user-coupons-backend_2026-09-14.md for the tolerance and the
// rest of the trust model). `odds_taken` is required here only so the
// request is self-describing and a mismatch can be reported clearly.
export const engineLegSchema = z.object({
  kind: z.literal("engine"),
  prediction_id: z.string().uuid(),
});

export const userLegSchema = z.object({
  kind: z.literal("user"),
  match_id: z.number().int().positive(),
  market: z.enum(["match_winner", "total_goals", "btts"]),
  side: z.enum(["home", "draw", "away", "over", "under", "yes", "no"]),
  // total_goals only; must be null for match_winner/btts. The server checks
  // it against the same modal line the rates board itself would show — a
  // client can't invent a friendlier line.
  line: z.number().nullable().default(null),
  odds_taken: z.number().positive(),
});

export const soccerLegSchema = z.discriminatedUnion("kind", [
  engineLegSchema,
  userLegSchema,
]);

export type EngineLegInput = z.infer<typeof engineLegSchema>;
export type UserLegInput = z.infer<typeof userLegSchema>;
export type SoccerLegInput = z.infer<typeof soccerLegSchema>;

// One canonical identity for a priced outcome: (match, market, side, line).
// Used both to spot which outcomes the engine already picked (rates board
// marker) and as the cart's dedupe key for a user-picked leg — same shape the
// server's own duplicate-outcome check (`soccer_coupon_legs_outcome_idx`) and
// dedupe logic (route.ts) key off, so a client-side key always matches what
// the server would compute.
export function outcomeKey(
  matchId: number,
  market: SoccerMarket,
  side: MatchSide,
  line: number | null,
): string {
  return `${matchId}:${market}:${side}:${line ?? ""}`;
}
