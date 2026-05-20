import { NextResponse } from "next/server";
import { assertCronAuth } from "../../cron/_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayIsoDate, isoDateOffset } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase 0 of the engine win-rate pivot (see .claude/ENGINE_STRATEGY.md).
// Read-only calibration readout: is our "confidence" actually a probability,
// which markets earn their keep, and where do voids come from? Every later
// engine change is graded against this.
//
// Auth: Bearer CRON_SECRET (same gate as the cron jobs), since there's no
// admin session yet.

type Cell = {
  won: number;
  lost: number;
  void: number;
  pending: number;
  hit_pct: number | null;
};

type Row = {
  confidence: number | null;
  market: string;
  pick: "over" | "under";
  status: "pending" | "won" | "lost" | "void";
  is_bet_of_the_day: boolean;
  generated_at: string;
  game: { status: string | null; postseason: boolean | null } | null;
};

function empty(): Cell {
  return { won: 0, lost: 0, void: 0, pending: 0, hit_pct: null };
}

function tally(rows: Row[]): Cell {
  const c = empty();
  for (const r of rows) {
    if (r.status === "won") c.won++;
    else if (r.status === "lost") c.lost++;
    else if (r.status === "void") c.void++;
    else c.pending++;
  }
  const settled = c.won + c.lost;
  c.hit_pct = settled > 0 ? Math.round((1000 * c.won) / settled) / 10 : null;
  return c;
}

function groupBy<K extends string | number>(
  rows: Row[],
  key: (r: Row) => K,
): Record<string, Cell> {
  const buckets = new Map<K, Row[]>();
  for (const r of rows) {
    const k = key(r);
    const list = buckets.get(k) ?? [];
    list.push(r);
    buckets.set(k, list);
  }
  const out: Record<string, Cell> = {};
  for (const [k, list] of [...buckets.entries()].sort()) {
    out[String(k)] = tally(list);
  }
  return out;
}

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("predictions")
    .select(
      "confidence, market, pick, status, is_bet_of_the_day, generated_at, game:games!inner(status, postseason)",
    )
    .limit(10000);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows: Row[] = (data ?? []).map((r) => {
    const game = Array.isArray(r.game) ? (r.game[0] ?? null) : r.game;
    return { ...r, game } as Row;
  });

  const cohort = (conf: number | null): string => {
    if (conf === null) return "unknown";
    if (conf >= 90) return "90+";
    if (conf >= 80) return "80-89";
    if (conf >= 70) return "70-79";
    if (conf >= 60) return "60-69";
    return "<60";
  };

  const today = todayIsoDate();
  const since = (days: number) => {
    const cutoff = `${isoDateOffset(today, -days)}T00:00:00Z`;
    return rows.filter((r) => r.generated_at >= cutoff);
  };

  // Void provenance — the thing that flagged the settlement bug. A void on a
  // cancelled game is expected; a void on a Final game is suspicious (likely a
  // pick settled before its box score was ingested).
  const voids = rows.filter((r) => r.status === "void");
  const voidByGameStatus = groupBy(voids, (r) =>
    (r.game?.status ?? "unknown").toLowerCase(),
  );

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    total_predictions: rows.length,
    overall: tally(rows),
    by_confidence_band: groupBy(rows, (r) =>
      r.confidence === null ? -1 : Math.floor(r.confidence / 10) * 10,
    ),
    by_cohort: groupBy(rows, (r) => cohort(r.confidence)),
    by_market: groupBy(rows, (r) => r.market),
    by_pick_side: groupBy(rows, (r) => r.pick),
    bet_of_the_day: tally(rows.filter((r) => r.is_bet_of_the_day)),
    void_by_game_status: voidByGameStatus,
    rolling: {
      last_7d: tally(since(7)),
      last_14d: tally(since(14)),
    },
  });
}
