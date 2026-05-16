import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OddsPlayerMarket, OddsQuote } from "./types";

export async function insertOddsSnapshots(
  quotes: OddsQuote[],
): Promise<{ inserted: number }> {
  if (quotes.length === 0) return { inserted: 0 };
  const supabase = supabaseAdmin();
  const rows = quotes.map((q) => ({
    game_id: q.game_id,
    player_id: q.player_id,
    market: q.market,
    line: q.line,
    pick: q.pick,
    bookmaker: q.bookmaker,
    odds: q.price_decimal,
    captured_at: q.captured_at,
  }));
  const { error, count } = await supabase
    .from("odds_snapshots")
    .insert(rows, { count: "exact" });
  if (error) throw new Error(`odds_snapshots insert: ${error.message}`);
  return { inserted: count ?? rows.length };
}

export type BestOdds = {
  line: number;
  bookmaker: string;
  price_decimal: number;
  price_american: number;
  side: "over" | "under";
  book_count: number;
};

type OddsSnapshotRow = {
  line: number;
  pick: "over" | "under";
  bookmaker: string;
  odds: number;
  captured_at: string;
};

/**
 * Load the most recent snapshot per (game, player, market) and reduce to a
 * single best quote per side: modal line across books, best price on that
 * line. We pick over/under per side independently — the caller decides which
 * one to bet based on its projection.
 */
export async function loadLatestOddsForGames(
  gameIds: number[],
): Promise<
  Map<string, { over: BestOdds | null; under: BestOdds | null }>
> {
  const out = new Map<
    string,
    { over: BestOdds | null; under: BestOdds | null }
  >();
  if (gameIds.length === 0) return out;

  const supabase = supabaseAdmin();
  // 24-hour staleness window — older quotes are likely irrelevant by the time
  // a game tips off. Keep this generous enough to survive one missed cron run.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("game_id, player_id, market, line, pick, bookmaker, odds, captured_at")
    .in("game_id", gameIds)
    .gte("captured_at", since)
    .order("captured_at", { ascending: false });
  if (error) throw new Error(`odds_snapshots read: ${error.message}`);
  if (!data || data.length === 0) return out;

  // Group rows by (game, player, market). For each group: latest snapshot per
  // bookmaker (data is already DESC by captured_at, so first-seen wins). Then
  // pick the modal line and the best price on it for each side.
  type Key = string;
  const groups = new Map<Key, OddsSnapshotRow[]>();
  for (const row of data) {
    if (row.player_id == null) continue;
    const key = `${row.game_id}:${row.player_id}:${row.market}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const [key, rows] of groups) {
    const latestByBook = new Map<string, OddsSnapshotRow>();
    for (const r of rows) {
      if (!latestByBook.has(r.bookmaker)) latestByBook.set(r.bookmaker, r);
    }
    const consensusLine = modalLine([...latestByBook.values()].map((r) => r.line));
    if (consensusLine == null) {
      out.set(key, { over: null, under: null });
      continue;
    }
    const onConsensus = [...latestByBook.values()].filter(
      (r) => r.line === consensusLine,
    );
    out.set(key, {
      over: bestOnSide(onConsensus, "over", consensusLine),
      under: bestOnSide(onConsensus, "under", consensusLine),
    });
  }

  return out;
}

function modalLine(lines: number[]): number | null {
  if (lines.length === 0) return null;
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  let best = lines[0];
  let bestCount = 0;
  for (const [l, c] of counts) {
    if (c > bestCount || (c === bestCount && l < best)) {
      best = l;
      bestCount = c;
    }
  }
  return best;
}

function bestOnSide(
  rows: OddsSnapshotRow[],
  side: "over" | "under",
  line: number,
): BestOdds | null {
  const onSide = rows.filter((r) => r.pick === side);
  if (onSide.length === 0) return null;
  const best = onSide.reduce((a, b) => (b.odds > a.odds ? b : a));
  return {
    line,
    bookmaker: best.bookmaker,
    price_decimal: best.odds,
    price_american: decimalToAmerican(best.odds),
    side,
    book_count: onSide.length,
  };
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function oddsKey(
  game_id: number,
  player_id: number,
  market: OddsPlayerMarket,
): string {
  return `${game_id}:${player_id}:${market}`;
}
