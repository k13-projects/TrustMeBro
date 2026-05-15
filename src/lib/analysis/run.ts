import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildPrediction, pickBetOfTheDay } from "./predictions";
import { detectAll, type DetectedPattern } from "./patterns";
import { statValue } from "./market-field";
import type {
  PlayerGameStatLine,
  Prediction,
  PropMarket,
  SignalImpact,
} from "./types";
import type { Game, Player, Team } from "@/lib/sports/types";

const MARKETS: PropMarket[] = [
  "points",
  "rebounds",
  "assists",
  "threes_made",
  "pra",
];

const HISTORY_DEPTH = 30;
const MIN_HISTORY = 5;
const MIN_AVG_MINUTES = 18;

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
      const team = teamById.get(teamId)!;
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

        for (const market of MARKETS) {
          const values = recent
            .map((h) => statValue(h, market))
            .filter((v): v is number => v !== null);
          if (values.length < 3) continue;
          const l10mean = values.reduce((s, v) => s + v, 0) / values.length;
          if (l10mean < 0.5) continue;
          const line = Math.floor(l10mean) + 0.5;

          // Detect patterns for this market and surface them as signals to
          // the confidence scorer. Pattern impact aligns with the implied
          // pick direction.
          //
          // cold_streak — boosts an under, penalizes an over.
          // home_away_split — boosts an over only when the player is on
          //   their better side tonight; penalizes overs and boosts unders
          //   when they're on their worse side. Without this check, a split
          //   would nudge confidence positive no matter which side the
          //   player was playing — which is what the audit flagged.
          const patterns = detectAll(history, market);
          const patternSignals: SignalImpact[] = patterns.map((p) => {
            const provisionalPick = l10mean >= line ? "over" : "under";
            let aligns: boolean;
            if (p.pattern_type === "cold_streak") {
              aligns = provisionalPick === "under";
            } else if (p.pattern_type === "home_away_split") {
              const ev = p.evidence as {
                home_mean?: number;
                away_mean?: number;
              };
              const homeMean = ev.home_mean ?? 0;
              const awayMean = ev.away_mean ?? 0;
              const onBetterSide = isHome
                ? homeMean >= awayMean
                : awayMean >= homeMean;
              // Better side → confirm over / contradict under.
              // Worse side  → confirm under / contradict over.
              aligns =
                provisionalPick === "over" ? onBetterSide : !onBetterSide;
            } else {
              aligns = true;
            }
            return {
              source: `pattern:${p.pattern_type}`,
              impact: p.confidence * (aligns ? 0.5 : -0.5),
              note: p.description,
            };
          });

          const prediction = buildPrediction({
            game,
            player,
            team,
            opponent,
            history,
            market,
            line,
            signals: patternSignals,
          });
          newPredictions.push(prediction);
          patternsByMarket.push(...patterns.map((p) => ({ player_id: player.id, market, pattern: p })));
        }
      }
    }
  }

  if (newPredictions.length === 0) {
    return { date, games: games.length, predictions: 0, bet_of_the_day_id: null };
  }

  const botd = pickBetOfTheDay(newPredictions);
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
