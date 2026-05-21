import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeFeatures } from "./features";
import { selectAltLinePick } from "./alt-line";
import { detectAll, type DetectedPattern } from "./patterns";
import type { PlayerGameStatLine, Prediction, PropMarket } from "./types";
import type { Game, Player, Team } from "@/lib/sports/types";
import { loadAltLaddersForGames, oddsKey } from "@/lib/signals/odds/repo";
import { americanFromDecimal } from "@/lib/signals/odds/provider";
import type { OddsPlayerMarket } from "@/lib/signals/odds";

const MARKETS: PropMarket[] = [
  "points",
  "rebounds",
  "assists",
  "threes_made",
  "pra",
];

// Subset of MARKETS the odds provider actually quotes. Markets outside this
// set (e.g. PRA) will be skipped when "real odds required" is in force,
// because there's nothing to look up against.
const ODDS_BACKED_MARKETS = new Set<PropMarket>([
  "points",
  "rebounds",
  "assists",
  "threes_made",
]);

const HISTORY_DEPTH = 30;
const MIN_HISTORY = 5;
const MIN_AVG_MINUTES = 18;

// Alt-line engine (see .claude/ENGINE_STRATEGY.md). Bet the deepest line that
// still clears this calibrated win rate; show fewer, surer picks.
const TARGET_WIN_RATE = 0.85;
// Locked-starter gate: a real minutes floor across the last 5 (not just a
// healthy average), so a deep-line pick doesn't get voided by a DNP.
const MIN_MINUTES_FLOOR = 20;
const MIN_GAMES_AT_FLOOR = 4; // of the last 5

/**
 * Generate predictions for every NBA game on the given date.
 *
 * Reads exclusively from local DB (synced via /api/cron/sync-stats). No
 * external API calls — keep this fast and rate-limit free.
 */
export async function generateForDate(date: string) {
  const supabase = supabaseAdmin();

  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select(
      "id, date, datetime, season, status, period, time, postseason, home_team_id, visitor_team_id, home_team_score, visitor_team_score",
    )
    .eq("date", date);
  if (gamesErr) throw new Error(`load games: ${gamesErr.message}`);
  if (!games || games.length === 0) {
    return { date, games: 0, predictions: 0, bet_of_the_day_id: null };
  }

  const teamIds = new Set<number>();
  for (const g of games) {
    teamIds.add(g.home_team_id);
    teamIds.add(g.visitor_team_id);
  }

  // Pre-load the full alt-line ladder per (game, player, market) in one query.
  // Picks are gated on a ladder existing AND a deep line clearing the target
  // win rate — no ladder (or nothing deep enough), no pick.
  const laddersByKey = await loadAltLaddersForGames(games.map((g) => g.id));

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("*")
    .in("id", [...teamIds]);
  if (teamsErr) throw new Error(`load teams: ${teamsErr.message}`);
  const teamById = new Map<number, Team>((teams ?? []).map((t) => [t.id, t]));

  const { data: players, error: playersErr } = await supabase
    .from("players")
    .select("*")
    .in("team_id", [...teamIds]);
  if (playersErr) throw new Error(`load players: ${playersErr.message}`);

  const playersByTeam = new Map<number, Player[]>();
  for (const p of players ?? []) {
    if (p.team_id == null) continue;
    const list = playersByTeam.get(p.team_id) ?? [];
    list.push({ ...p, team: teamById.get(p.team_id)! });
    playersByTeam.set(p.team_id, list);
  }

  await supabase
    .from("predictions")
    .update({ is_bet_of_the_day: false })
    .gte("generated_at", `${date}T00:00:00Z`)
    .lte("generated_at", `${date}T23:59:59Z`);

  const newPredictions: Prediction[] = [];
  const patternsByMarket: Array<{
    player_id: number;
    market: PropMarket;
    pattern: DetectedPattern;
  }> = [];

  for (const g of games) {
    const game: Game = {
      id: g.id,
      date: g.date,
      datetime: g.datetime,
      season: g.season,
      status: g.status,
      period: g.period,
      time: g.time,
      postseason: g.postseason,
      home_team: teamById.get(g.home_team_id)!,
      home_team_score: g.home_team_score,
      visitor_team: teamById.get(g.visitor_team_id)!,
      visitor_team_score: g.visitor_team_score,
    };
    if (!game.home_team || !game.visitor_team) continue;

    for (const teamId of [g.home_team_id, g.visitor_team_id]) {
      const isHome = teamId === g.home_team_id;
      const opponentId = isHome ? g.visitor_team_id : g.home_team_id;
      const opponent = teamById.get(opponentId)!;
      const roster = playersByTeam.get(teamId) ?? [];

      const playerIds = roster.map((p) => p.id);
      if (playerIds.length === 0) continue;

      const { data: stats, error: statsErr } = await supabase
        .from("player_game_stats")
        .select(
          "game_id, player_id, team_id, minutes, points, rebounds, assists, steals, blocks, turnovers, personal_fouls, fgm, fga, fg3m, fg3a, ftm, fta, is_home, started, games!inner(date, home_team_id, visitor_team_id)",
        )
        .in("player_id", playerIds)
        .order("games(date)", { ascending: false })
        .limit(HISTORY_DEPTH * playerIds.length);
      if (statsErr) throw new Error(`load stats: ${statsErr.message}`);

      const historyByPlayer = new Map<number, PlayerGameStatLine[]>();
      for (const row of stats ?? []) {
        const list = historyByPlayer.get(row.player_id) ?? [];
        if (list.length >= HISTORY_DEPTH) continue;
        const gameJoin = Array.isArray(row.games)
          ? (row.games[0] as
              | { date: string; home_team_id: number; visitor_team_id: number }
              | undefined)
          : (row.games as
              | { date: string; home_team_id: number; visitor_team_id: number }
              | null);
        const opponentId = gameJoin
          ? row.is_home
            ? gameJoin.visitor_team_id
            : gameJoin.home_team_id
          : null;
        list.push({
          game_id: row.game_id,
          player_id: row.player_id,
          team_id: row.team_id,
          opponent_team_id: opponentId,
          minutes: row.minutes,
          points: row.points,
          rebounds: row.rebounds,
          assists: row.assists,
          steals: row.steals,
          blocks: row.blocks,
          turnovers: row.turnovers,
          personal_fouls: row.personal_fouls,
          fgm: row.fgm,
          fga: row.fga,
          fg3m: row.fg3m,
          fg3a: row.fg3a,
          ftm: row.ftm,
          fta: row.fta,
          is_home: row.is_home,
          started: row.started,
          game_date: gameJoin?.date ?? "",
        });
        historyByPlayer.set(row.player_id, list);
      }

      for (const player of roster) {
        const history = historyByPlayer.get(player.id) ?? [];
        if (history.length < MIN_HISTORY) continue;

        const recent = history.slice(0, 10);
        const minutesValues = recent
          .map((h) => h.minutes)
          .filter((m): m is number => m !== null);
        if (minutesValues.length === 0) continue;
        const avgMin =
          minutesValues.reduce((s, v) => s + v, 0) / minutesValues.length;
        if (avgMin < MIN_AVG_MINUTES) continue;

        // Locked-starter gate: a real minutes floor over the last 5, not just a
        // healthy average — a deep alt-line pick is wasted if the player sits.
        const gamesAtFloor = history
          .slice(0, 5)
          .filter((h) => (h.minutes ?? 0) >= MIN_MINUTES_FLOOR).length;
        if (gamesAtFloor < MIN_GAMES_AT_FLOOR) continue;

        for (const market of MARKETS) {
          // Pattern detection feeds the dashboard badges only; it no longer
          // moves confidence (the alt-line probability stands on its own).
          const patterns = detectAll(history, market);
          patternsByMarket.push(
            ...patterns.map((p) => ({ player_id: player.id, market, pattern: p })),
          );

          // Only markets the book quotes an alt ladder for (PRA is skipped).
          if (!ODDS_BACKED_MARKETS.has(market)) continue;
          const ladder = laddersByKey.get(
            oddsKey(g.id, player.id, market as OddsPlayerMarket),
          );
          if (!ladder || ladder.length === 0) continue;

          const features = computeFeatures({
            player_id: player.id,
            market,
            history,
            opponent_team_id: opponent.id,
          });

          // Pick the shallowest deep line that still clears the target win
          // rate. No qualifying line ⇒ no pick (selectivity by design).
          const sel = selectAltLinePick({
            ladder,
            features,
            isHome,
            targetWinRate: TARGET_WIN_RATE,
          });
          if (!sel) continue;

          const confidence = Math.round(sel.prob_calibrated * 1000) / 10;
          const expected_value =
            Math.round((sel.prob_calibrated * sel.price_decimal - 1) * 1000) /
            1000;

          newPredictions.push({
            game_id: g.id,
            player_id: player.id,
            market,
            line: sel.line,
            pick: sel.side,
            projection: Math.round(sel.projection * 10) / 10,
            confidence,
            expected_value,
            reasoning: {
              checks: [
                {
                  label: "Projection vs line",
                  passed: true,
                  value: Math.round(sel.projection * 10) / 10,
                  target: sel.line,
                  weight: 1,
                },
                {
                  label: "Calibrated P(clear)",
                  passed: confidence >= TARGET_WIN_RATE * 100,
                  value: confidence,
                  target: Math.round(TARGET_WIN_RATE * 100),
                  weight: 0,
                },
              ],
              signals: [],
              odds: {
                bookmaker: sel.bookmaker,
                price_decimal: sel.price_decimal,
                price_american: americanFromDecimal(sel.price_decimal),
                book_count: 1,
              },
            },
            is_bet_of_the_day: false,
            status: "pending",
            generated_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  if (newPredictions.length === 0) {
    return { date, games: games.length, predictions: 0, bet_of_the_day_id: null };
  }

  // Bet of the Day = the single highest-confidence (most calibrated-certain)
  // pick across the slate.
  const botd =
    newPredictions.length > 0
      ? [...newPredictions].sort((a, b) => b.confidence - a.confidence)[0]
      : null;
  const rows = newPredictions.map((p) => ({
    game_id: p.game_id,
    player_id: p.player_id,
    market: p.market,
    line: p.line,
    pick: p.pick,
    projection: p.projection,
    confidence: p.confidence,
    expected_value: p.expected_value,
    reasoning: p.reasoning,
    is_bet_of_the_day: botd ? sameKey(p, botd) : false,
    status: p.status,
    generated_at: p.generated_at,
  }));

  const { data: upserted, error: upErr } = await supabase
    .from("predictions")
    .upsert(rows, { onConflict: "game_id,player_id,market,line,pick" })
    .select("id, is_bet_of_the_day");
  if (upErr) throw new Error(`predictions upsert: ${upErr.message}`);

  const botdRow = upserted?.find((r) => r.is_bet_of_the_day);

  // Persist detected patterns so dashboards can badge picks without
  // recomputing 30 games of history per request. Dedup by
  // (player_id, pattern_type, market) — the unique index from 0004 lets us
  // upsert. Expire 24h out so stale patterns roll off.
  if (patternsByMarket.length > 0) {
    const seen = new Set<string>();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const patternRows = patternsByMarket
      .filter(({ player_id, market, pattern }) => {
        const key = `${player_id}:${pattern.pattern_type}:${market}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ player_id, market, pattern }) => ({
        player_id,
        pattern_type: pattern.pattern_type,
        market,
        description: pattern.description,
        confidence: pattern.confidence,
        evidence: pattern.evidence,
        expires_at: expiresAt,
      }));
    if (patternRows.length > 0) {
      await supabase
        .from("patterns")
        .upsert(patternRows, {
          onConflict: "player_id,pattern_type,market",
        });
    }
  }

  return {
    date,
    games: games.length,
    predictions: rows.length,
    bet_of_the_day_id: botdRow?.id ?? null,
    patterns: patternsByMarket.length,
  };
}

function sameKey(a: Prediction, b: Prediction): boolean {
  return (
    a.game_id === b.game_id &&
    a.player_id === b.player_id &&
    a.market === b.market &&
    a.line === b.line &&
    a.pick === b.pick
  );
}
