import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SoccerCompetition } from "@/lib/sports/soccer/competitions";

// Pure grading rule (0024): exact score = 3, right result (home/draw/away) =
// 1, otherwise 0. No push/void case here — unlike engine picks, a score call
// always resolves once the match finishes.
export function scoreCall(
  call: { home: number; away: number },
  final: { home: number; away: number },
): 0 | 1 | 3 {
  if (call.home === final.home && call.away === final.away) return 3;
  const callResult = call.home > call.away ? "home" : call.home < call.away ? "away" : "draw";
  const finalResult = final.home > final.away ? "home" : final.home < final.away ? "away" : "draw";
  return callResult === finalResult ? 1 : 0;
}

// Finds this competition's ungraded calls whose match has finished, grades
// each with `scoreCall`, and writes points + graded_at. Returns the count
// graded. Mirrors the shape of settleSoccer in ./settle.ts (same
// `soccer_matches!inner` join pattern) — the settle job calls this alongside
// settleSoccer, not the other way around.
export async function gradeScoreCalls(competition: SoccerCompetition): Promise<number> {
  const supabase = supabaseAdmin();
  const { data: rows, error } = await supabase
    .from("soccer_score_predictions")
    .select(
      "id, home_goals, away_goals, soccer_matches!inner(home_score, away_score, finished)",
    )
    .eq("competition", competition)
    .is("points", null)
    .eq("soccer_matches.finished", true);
  if (error) throw new Error(`load ungraded score calls: ${error.message}`);
  if (!rows || rows.length === 0) return 0;

  const now = new Date().toISOString();
  let graded = 0;

  for (const r of rows as Array<{
    id: string;
    home_goals: number;
    away_goals: number;
    soccer_matches:
      | { home_score: number; away_score: number; finished: boolean }
      | { home_score: number; away_score: number; finished: boolean }[]
      | null;
  }>) {
    const match = Array.isArray(r.soccer_matches)
      ? (r.soccer_matches[0] ?? null)
      : r.soccer_matches;
    if (!match) continue;
    const points = scoreCall(
      { home: r.home_goals, away: r.away_goals },
      { home: match.home_score, away: match.away_score },
    );
    const { error: updateErr } = await supabase
      .from("soccer_score_predictions")
      .update({ points, graded_at: now })
      .eq("id", r.id);
    if (updateErr) throw new Error(`grade score call ${r.id}: ${updateErr.message}`);
    graded += 1;
  }

  return graded;
}
