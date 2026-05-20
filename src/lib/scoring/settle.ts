import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { statValue } from "@/lib/analysis/market-field";
import type {
  BetStatus,
  PlayerGameStatLine,
  PropMarket,
} from "@/lib/analysis/types";
import { applyReward } from "./reward";

type PendingPrediction = {
  id: string;
  game_id: number;
  player_id: number;
  market: PropMarket;
  line: number;
  pick: "over" | "under";
  game_status: string;
};

const isCancelled = (s: string) =>
  s.includes("cancel") || s.includes("postpone") || s.includes("suspend");

type GameStatRow = {
  game_id: number;
  player_id: number;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  fg3m: number | null;
};

export type SettleResult = {
  considered: number;
  settled: number;
  won: number;
  lost: number;
  void: number;
  // Final games whose box scores haven't been ingested yet — left pending on
  // purpose rather than voided, so a later run grades them once stats land.
  deferred: number;
};

/**
 * Resolve a single prediction against an actual box-score row.
 *
 * Rules (per CLAUDE.md):
 *  - No stat row, minutes is null, or minutes === 0  → void (DNP).
 *  - result_value null                                → void.
 *  - line push (result_value === line)                → void.
 *  - over hit / under hit                             → won.
 *  - otherwise                                        → lost.
 *
 * Minutes market special case: a DNP voids both sides — you don't get to win
 * an under by not appearing. The `null/0 minutes` branch above covers it for
 * every market including minutes.
 */
export function resolveOutcome(
  pending: PendingPrediction,
  stat: GameStatRow | null,
): { outcome: BetStatus; result_value: number | null } {
  if (!stat || stat.minutes === null || stat.minutes === 0) {
    return { outcome: "void", result_value: null };
  }
  // statValue handles combined markets like 'pra' that aren't a single
  // column. GameStatRow is a subset of PlayerGameStatLine, so this cast is
  // safe for every market we read here.
  const value = statValue(stat as unknown as PlayerGameStatLine, pending.market);
  if (value === null) return { outcome: "void", result_value: null };
  if (value === pending.line) return { outcome: "void", result_value: value };
  const over = value > pending.line;
  const hit = pending.pick === "over" ? over : !over;
  return { outcome: hit ? "won" : "lost", result_value: value };
}

/**
 * Settle every pending prediction whose game is now final.
 *
 * Idempotent: re-running on the same data is a no-op because the
 * `status='pending'` filter excludes already-settled rows.
 */
export async function settlePending(): Promise<SettleResult> {
  const supabase = supabaseAdmin();

  const { data: rawPending, error: pendingErr } = await supabase
    .from("predictions")
    .select(
      "id, game_id, player_id, market, line, pick, games!inner(status)",
    )
    .eq("status", "pending");
  if (pendingErr) throw new Error(`load pending: ${pendingErr.message}`);

  type RawRow = PendingPrediction & {
    games: { status: string } | { status: string }[] | null;
  };
  const pending = (rawPending ?? [])
    .map((r) => {
      const row = r as unknown as RawRow;
      const games = Array.isArray(row.games) ? row.games[0] : row.games;
      const status = games?.status?.toLowerCase() ?? "";
      // Final → grade it. Cancelled/postponed → void it (game produces no
      // result). Anything still scheduled or in-progress stays pending.
      if (!status.includes("final") && !isCancelled(status)) return null;
      return {
        id: row.id,
        game_id: row.game_id,
        player_id: row.player_id,
        market: row.market,
        line: row.line,
        pick: row.pick,
        game_status: status,
      } satisfies PendingPrediction;
    })
    .filter((r): r is PendingPrediction => r !== null);

  if (pending.length === 0) {
    return { considered: 0, settled: 0, won: 0, lost: 0, void: 0, deferred: 0 };
  }

  const gameIds = Array.from(new Set(pending.map((p) => p.game_id)));
  const playerIds = Array.from(new Set(pending.map((p) => p.player_id)));

  const { data: stats, error: statsErr } = await supabase
    .from("player_game_stats")
    .select(
      "game_id, player_id, minutes, points, rebounds, assists, steals, blocks, fg3m",
    )
    .in("game_id", gameIds)
    .in("player_id", playerIds);
  if (statsErr) throw new Error(`load stats: ${statsErr.message}`);

  const statByKey = new Map<string, GameStatRow>();
  const gamesWithStats = new Set<number>();
  for (const s of (stats ?? []) as GameStatRow[]) {
    statByKey.set(`${s.game_id}:${s.player_id}`, s);
    gamesWithStats.add(s.game_id);
  }

  let won = 0;
  let lost = 0;
  let voided = 0;
  let settled = 0;
  let deferred = 0;

  for (const p of pending) {
    const cancelled = isCancelled(p.game_status);

    // Ingest-lag guard: a Final game with ZERO box-score rows means stats
    // haven't landed yet. Voiding here is the bug that stuck 125 picks
    // (settled-before-ingest). Leave them pending for a later run instead.
    // A player merely missing from a game that DOES have other stat rows is a
    // genuine DNP and still voids below via resolveOutcome.
    if (!cancelled && !gamesWithStats.has(p.game_id)) {
      deferred++;
      continue;
    }

    const stat = statByKey.get(`${p.game_id}:${p.player_id}`) ?? null;
    const { outcome, result_value } = cancelled
      ? { outcome: "void" as BetStatus, result_value: null }
      : resolveOutcome(p, stat);

    const { error: predUpdErr } = await supabase
      .from("predictions")
      .update({
        status: outcome,
        result_value,
        settled_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    if (predUpdErr) {
      throw new Error(`update prediction ${p.id}: ${predUpdErr.message}`);
    }

    const { error: userUpdErr } = await supabase
      .from("user_bets")
      .update({
        status: outcome,
        result_value,
        settled_at: new Date().toISOString(),
      })
      .eq("prediction_id", p.id)
      .eq("status", "pending");
    if (userUpdErr) {
      throw new Error(`mirror user_bets for ${p.id}: ${userUpdErr.message}`);
    }

    if (outcome === "won") won++;
    else if (outcome === "lost") lost++;
    else voided++;
    settled++;

    if (outcome === "won" || outcome === "lost") {
      await applyReward({ prediction_id: p.id, outcome });
    }
  }

  return { considered: pending.length, settled, won, lost, void: voided, deferred };
}
