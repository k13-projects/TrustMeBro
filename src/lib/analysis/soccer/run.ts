import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  loadLatestSoccerOdds,
  loadTeamForm,
} from "@/lib/sports/soccer/repo";
import { buildCoupons } from "./coupons";
import { predictMatch, type SoccerPrediction } from "./engine";

const predKey = (p: {
  match_id: number;
  market: string;
  side: string;
  line: number | null;
}) => `${p.match_id}:${p.market}:${p.side}:${p.line ?? -1}`;

export type GenerateResult = {
  matches: number;
  predictions: number;
  coupons: number;
  banko: number;
};

// Generate soccer predictions + engine coupons for the given LA-days.
// Reads odds snapshots (must be populated by track-odds first) and the latest
// standings form, runs the pure engine, then regenerates pending rows.
export async function generateSoccerPredictions(
  dates: string[],
): Promise<GenerateResult> {
  const supabase = supabaseAdmin();
  const empty: GenerateResult = { matches: 0, predictions: 0, coupons: 0, banko: 0 };

  const { data: matches, error: matchErr } = await supabase
    .from("soccer_matches")
    .select("id, home_team_id, away_team_id")
    .in("date", dates)
    .eq("finished", false);
  if (matchErr) throw new Error(`load matches: ${matchErr.message}`);
  if (!matches || matches.length === 0) return empty;

  const matchIds = matches.map((m) => m.id);
  const [oddsByMatch, form] = await Promise.all([
    loadLatestSoccerOdds(matchIds),
    loadTeamForm(),
  ]);

  const predictions: SoccerPrediction[] = [];
  for (const m of matches) {
    const quotes = oddsByMatch.get(m.id) ?? [];
    if (quotes.length === 0) continue;
    predictions.push(
      ...predictMatch({
        match_id: m.id,
        home_form: form.get(m.home_team_id) ?? null,
        away_form: form.get(m.away_team_id) ?? null,
        quotes,
      }),
    );
  }
  if (predictions.length === 0) return { ...empty, matches: matches.length };

  const bundle = buildCoupons(predictions);
  const bankoKeys = new Set(bundle.banko.map(predKey));
  for (const p of predictions) {
    if (bankoKeys.has(predKey(p))) p.is_banko = true;
  }

  // Regenerate: drop pending coupons first (legs cascade), then pending preds.
  await supabase.from("engine_coupons").delete().eq("sport", "soccer").eq("status", "pending");
  await supabase.from("soccer_predictions").delete().eq("status", "pending").in("match_id", matchIds);

  const { data: inserted, error: insErr } = await supabase
    .from("soccer_predictions")
    .insert(
      predictions.map((p) => ({
        match_id: p.match_id,
        market: p.market,
        side: p.side,
        line: p.line,
        probability: p.probability,
        confidence: p.confidence,
        best_odds: p.best_odds,
        bookmaker: p.bookmaker,
        expected_value: p.expected_value,
        reasoning: p.reasoning,
        is_banko: p.is_banko,
      })),
    )
    .select("id, match_id, market, side, line");
  if (insErr) throw new Error(`insert predictions: ${insErr.message}`);

  const idByKey = new Map<string, string>();
  for (const r of inserted ?? []) idByKey.set(predKey(r), r.id as string);

  let couponsWritten = 0;
  for (const coupon of bundle.coupons) {
    const legIds = coupon.legs
      .map((l) => idByKey.get(predKey(l)))
      .filter((id): id is string => Boolean(id));
    if (legIds.length < 2) continue;

    const { data: cp, error: cpErr } = await supabase
      .from("engine_coupons")
      .insert({
        sport: "soccer",
        kind: coupon.kind,
        target_multiplier: coupon.target_multiplier,
        leg_count: legIds.length,
        combined_odds: coupon.combined_odds,
        combined_probability: coupon.combined_probability,
      })
      .select("id")
      .single();
    if (cpErr || !cp) throw new Error(`insert coupon: ${cpErr?.message}`);

    const { error: legErr } = await supabase.from("engine_coupon_legs").insert(
      legIds.map((soccer_prediction_id, i) => ({
        coupon_id: cp.id,
        soccer_prediction_id,
        leg_order: i,
      })),
    );
    if (legErr) throw new Error(`insert coupon legs: ${legErr.message}`);
    couponsWritten += 1;
  }

  return {
    matches: matches.length,
    predictions: predictions.length,
    coupons: couponsWritten,
    banko: bundle.banko.length,
  };
}
