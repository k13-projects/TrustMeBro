import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import type { SoccerCompetition } from "./competitions";
import type { CouponView, PredictionDetail } from "./queries";

// Single-row lookups for share cards (OG images, /api/og/*). Kept separate
// from queries.ts (which only ever fetches lists scoped to a competition) so
// that file's shape doesn't have to grow a by-id variant of every query.
//
// `TEAM_COLS` / `PREDICTION_SELECT` mirror the shapes in queries.ts — not
// imported because those are module-private there.

type RawTeam = {
  id: number;
  name: string;
  abbreviation: string;
  crest_url: string | null;
  color?: string | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const TEAM_COLS = "id, name, abbreviation, crest_url, color";

type RawPrediction = {
  id: string;
  competition: string;
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  confidence: number;
  best_odds: number;
  expected_value: number | null;
  is_banko: boolean;
  status: PredictionDetail["status"];
  soccer_matches:
    | { datetime: string | null; stage: string | null; home: RawTeam | RawTeam[] | null; away: RawTeam | RawTeam[] | null }
    | Array<{ datetime: string | null; stage: string | null; home: RawTeam | RawTeam[] | null; away: RawTeam | RawTeam[] | null }>
    | null;
};

const PREDICTION_SELECT =
  "id, competition, match_id, market, side, line, confidence, best_odds, expected_value, is_banko, status, " +
  "soccer_matches(datetime, stage, " +
  `home:soccer_teams!soccer_matches_home_team_id_fkey(${TEAM_COLS}), ` +
  `away:soccer_teams!soccer_matches_away_team_id_fkey(${TEAM_COLS}))`;

function toPredictionDetail(p: RawPrediction): PredictionDetail {
  const match = one(p.soccer_matches);
  const home = one(match?.home ?? null);
  const away = one(match?.away ?? null);
  return {
    id: p.id,
    competition: p.competition as SoccerCompetition,
    match_id: p.match_id,
    market: p.market,
    side: p.side,
    line: p.line,
    confidence: Number(p.confidence),
    best_odds: Number(p.best_odds),
    expected_value: p.expected_value === null ? null : Number(p.expected_value),
    is_banko: p.is_banko,
    status: p.status,
    home: home?.name ?? "Home",
    away: away?.name ?? "Away",
    home_crest: home?.crest_url ?? null,
    away_crest: away?.crest_url ?? null,
    home_abbr: home?.abbreviation ?? "",
    away_abbr: away?.abbreviation ?? "",
    home_color: home?.color ?? null,
    away_color: away?.color ?? null,
    datetime: match?.datetime ?? null,
    stage: match?.stage ?? null,
  };
}

// A single engine pick by id, any status — for the pick share card.
export async function getPredictionById(id: string): Promise<PredictionDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_predictions")
    .select(PREDICTION_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? toPredictionDetail(data as unknown as RawPrediction) : null;
}

// A single engine coupon by id, any status — for the coupon share card.
export async function getEngineCouponById(id: string): Promise<CouponView | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("engine_coupons")
    .select(
      "id, kind, target_multiplier, combined_odds, combined_probability, status, " +
        "engine_coupon_legs(leg_order, soccer_predictions(" +
        PREDICTION_SELECT +
        "))",
    )
    .eq("sport", "soccer")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as {
    id: string;
    kind: CouponView["kind"];
    target_multiplier: number | null;
    combined_odds: number;
    combined_probability: number | null;
    status: string;
    engine_coupon_legs: Array<{
      leg_order: number;
      soccer_predictions: RawPrediction | RawPrediction[] | null;
    }>;
  };
  const legs = (row.engine_coupon_legs ?? [])
    .sort((a, b) => a.leg_order - b.leg_order)
    .map((l) => one(l.soccer_predictions))
    .filter((p): p is RawPrediction => Boolean(p))
    .map(toPredictionDetail);
  return {
    id: row.id,
    kind: row.kind,
    target_multiplier: row.target_multiplier,
    combined_odds: Number(row.combined_odds),
    combined_probability: row.combined_probability === null ? null : Number(row.combined_probability),
    status: row.status,
    legs,
  };
}
