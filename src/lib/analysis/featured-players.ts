import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type FeaturedPlayer = {
  player_id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  jersey_number: string | null;
  team_id: number | null;
  team_abbreviation: string | null;
  team_full_name: string | null;
  /** The most recent pick we have for this player (today first, then any) */
  latest_pick: {
    prediction_id: string;
    game_id: number;
    market: string;
    line: number;
    pick: "over" | "under";
    confidence: number;
    is_bet_of_the_day: boolean;
    status: "pending" | "won" | "lost" | "void";
    generated_at: string;
  } | null;
};

type PredictionRow = {
  id: string;
  game_id: number;
  player_id: number;
  market: string;
  line: number;
  pick: "over" | "under";
  confidence: number;
  is_bet_of_the_day: boolean;
  status: "pending" | "won" | "lost" | "void";
  generated_at: string;
  player:
    | {
        id: number;
        first_name: string;
        last_name: string;
        position: string | null;
        jersey_number: string | null;
        team_id: number | null;
      }
    | Array<{
        id: number;
        first_name: string;
        last_name: string;
        position: string | null;
        jersey_number: string | null;
        team_id: number | null;
      }>
    | null;
};

/**
 * Pick the players to feature on the homepage. Strategy: BotD first
 * (highest editorial weight), then highest-confidence picks across today's
 * slate, deduped by player. If today has nothing pending, fall back to the
 * most recently generated picks regardless of date so the page never
 * features zero players.
 */
export async function pickFeaturedPlayers(
  todayIso: string,
  limit = 6,
): Promise<FeaturedPlayer[]> {
  const supabase = supabaseAdmin();

  // Step 1: today's predictions (BotD first, then by confidence).
  const { data: todayPredictions } = await supabase
    .from("predictions")
    .select(
      "id, game_id, player_id, market, line, pick, confidence, is_bet_of_the_day, status, generated_at, player:players!inner(id, first_name, last_name, position, jersey_number, team_id)",
    )
    .gte("generated_at", `${todayIso}T00:00:00Z`)
    .lte("generated_at", `${todayIso}T23:59:59Z`)
    .order("is_bet_of_the_day", { ascending: false })
    .order("confidence", { ascending: false });

  let rows = (todayPredictions ?? []) as PredictionRow[];

  // Step 2: if today is dry, pull the most recently generated regardless of date.
  if (rows.length === 0) {
    const { data: recent } = await supabase
      .from("predictions")
      .select(
        "id, game_id, player_id, market, line, pick, confidence, is_bet_of_the_day, status, generated_at, player:players!inner(id, first_name, last_name, position, jersey_number, team_id)",
      )
      .order("is_bet_of_the_day", { ascending: false })
      .order("generated_at", { ascending: false })
      .limit(limit * 4);
    rows = (recent ?? []) as PredictionRow[];
  }

  if (rows.length === 0) return [];

  // Dedupe by player_id, taking the first occurrence (which is already
  // sorted by is_bet_of_the_day desc, then confidence/generated_at desc).
  const seen = new Set<number>();
  const featured: FeaturedPlayer[] = [];
  const teamIds = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.player_id)) continue;
    const player = Array.isArray(row.player) ? row.player[0] : row.player;
    if (!player) continue;
    seen.add(row.player_id);
    if (player.team_id != null) teamIds.add(player.team_id);
    featured.push({
      player_id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      position: player.position,
      jersey_number: player.jersey_number,
      team_id: player.team_id,
      team_abbreviation: null,
      team_full_name: null,
      latest_pick: {
        prediction_id: row.id,
        game_id: row.game_id,
        market: row.market,
        line: Number(row.line),
        pick: row.pick,
        confidence: Number(row.confidence),
        is_bet_of_the_day: row.is_bet_of_the_day,
        status: row.status,
        generated_at: row.generated_at,
      },
    });
    if (featured.length >= limit) break;
  }

  // Hydrate team metadata in one query so the cards can show abbr / logo.
  if (teamIds.size > 0) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, abbreviation, full_name")
      .in("id", [...teamIds]);
    const teamById = new Map(
      (teams ?? []).map((t) => [t.id, t] as [number, { id: number; abbreviation: string; full_name: string }]),
    );
    for (const p of featured) {
      if (p.team_id == null) continue;
      const t = teamById.get(p.team_id);
      if (t) {
        p.team_abbreviation = t.abbreviation;
        p.team_full_name = t.full_name;
      }
    }
  }

  return featured;
}
