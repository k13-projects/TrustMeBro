import "server-only";

import { Type, type FunctionDeclaration } from "@google/genai";
import { computeFeatures } from "@/lib/analysis/features";
import type { PlayerGameStatLine, PropMarket } from "@/lib/analysis/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const LOOKUP_PLAYER_DECLARATION: FunctionDeclaration = {
  name: "lookup_player",
  description:
    "Look up an NBA player's recent stats by name. Returns season, L5, and L10 averages for points, rebounds, assists, threes, and minutes, plus the last game's line. Call this when the user asks about a player who is not in today's picks.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description:
          "Full or partial player name (e.g. 'LeBron James' or 'Tatum').",
      },
    },
    required: ["name"],
  },
};

type LookupPlayerResult =
  | {
      ok: true;
      player: {
        id: number;
        name: string;
        position: string | null;
        team_abbr: string | null;
      };
      markets: Record<
        PropMarket,
        {
          season_avg: number;
          last5_avg: number;
          last10_avg: number;
          last_game: number | null;
        }
      >;
      last_game_date: string | null;
      games_used: number;
    }
  | { ok: false; reason: string };

const MARKETS: PropMarket[] = [
  "points",
  "rebounds",
  "assists",
  "threes_made",
  "minutes",
  "steals",
  "blocks",
];

export async function runLookupPlayer(args: {
  name: string;
}): Promise<LookupPlayerResult> {
  const raw = (args.name ?? "").trim();
  if (!raw) return { ok: false, reason: "Empty player name." };

  const supabase = await createSupabaseServerClient();

  // Split on whitespace so "LeBron James" matches first+last,
  // but "Tatum" still matches a last name on its own.
  const tokens = raw.split(/\s+/).filter(Boolean);
  let query = supabase
    .from("players")
    .select("id, first_name, last_name, position, team_id, teams:teams(abbreviation)")
    .limit(5);
  for (const t of tokens) {
    query = query.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%`);
  }

  const { data: players, error } = await query;
  if (error) return { ok: false, reason: `db error: ${error.message}` };
  if (!players || players.length === 0) {
    return { ok: false, reason: `No player matched "${raw}".` };
  }

  // Prefer an exact full-name match when ambiguous.
  const exact = players.find((p) => {
    const full = `${p.first_name} ${p.last_name}`.toLowerCase();
    return full === raw.toLowerCase();
  });
  const player = exact ?? players[0];
  const team = Array.isArray(player.teams) ? player.teams[0] : player.teams;

  const { data: rows, error: statsErr } = await supabase
    .from("player_game_stats")
    .select(
      "game_id, player_id, team_id, minutes, points, rebounds, assists, steals, blocks, turnovers, personal_fouls, fgm, fga, fg3m, fg3a, ftm, fta, is_home, started, games:games!inner(date)",
    )
    .eq("player_id", player.id)
    .order("game_id", { ascending: false })
    .limit(20);

  if (statsErr) return { ok: false, reason: `db error: ${statsErr.message}` };
  if (!rows || rows.length === 0) {
    return {
      ok: false,
      reason: `Found ${player.first_name} ${player.last_name} but no game stats are recorded yet.`,
    };
  }

  const history: PlayerGameStatLine[] = rows.map((r) => {
    const g = Array.isArray(r.games) ? r.games[0] : r.games;
    return {
      game_id: r.game_id,
      player_id: r.player_id,
      team_id: r.team_id,
      minutes: r.minutes,
      points: r.points,
      rebounds: r.rebounds,
      assists: r.assists,
      steals: r.steals,
      blocks: r.blocks,
      turnovers: r.turnovers,
      personal_fouls: r.personal_fouls,
      fgm: r.fgm,
      fga: r.fga,
      fg3m: r.fg3m,
      fg3a: r.fg3a,
      ftm: r.ftm,
      fta: r.fta,
      is_home: r.is_home,
      started: r.started,
      game_date: g?.date ?? "",
    };
  });

  type MarketSummary = {
    season_avg: number;
    last5_avg: number;
    last10_avg: number;
    last_game: number | null;
  };
  const markets = Object.fromEntries(
    MARKETS.map((market): [PropMarket, MarketSummary] => {
      const f = computeFeatures({
        player_id: player.id,
        market,
        history,
        opponent_team_id: -1,
      });
      return [
        market,
        {
          season_avg: round1(f.season.mean),
          last5_avg: round1(f.last5.mean),
          last10_avg: round1(f.last10.mean),
          last_game: f.last_game_value,
        },
      ];
    }),
  ) as Record<PropMarket, MarketSummary>;

  return {
    ok: true,
    player: {
      id: player.id,
      name: `${player.first_name} ${player.last_name}`,
      position: player.position,
      team_abbr: team?.abbreviation ?? null,
    },
    markets,
    last_game_date: history[0]?.game_date ?? null,
    games_used: history.length,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summarizeToolResult(
  name: string,
  result: unknown,
): string {
  if (name !== "lookup_player") return "Tool finished.";
  const r = result as LookupPlayerResult;
  if (!r.ok) return r.reason;
  const m = r.markets;
  return `${r.player.name} (${r.player.team_abbr ?? "—"}, ${
    r.games_used
  } games) — pts ${m.points.last5_avg}/${m.points.last10_avg}/${m.points.season_avg} (L5/L10/season), reb ${m.rebounds.last5_avg}, ast ${m.assists.last5_avg}, 3PM ${m.threes_made.last5_avg}, min ${m.minutes.last5_avg}`;
}
