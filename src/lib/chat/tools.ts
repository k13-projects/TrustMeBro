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
  // Strip PostgREST filter metacharacters (commas, parens, dots, asterisks)
  // so a name like "O'Neal, Jr." can't escape the .or() filter expression.
  // Keep letters, spaces, hyphens, apostrophes — the union of real NBA names.
  const raw = (args.name ?? "")
    .replace(/[^\p{L}\s'\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return { ok: false, reason: "Empty player name." };

  const supabase = await createSupabaseServerClient();

  // Tokens >= 2 chars only — a stray letter shouldn't broaden the search.
  const tokens = raw.split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) return { ok: false, reason: `Couldn't parse player name "${args.name}".` };

  // Build one combined OR that requires SOME token to hit first/last name.
  // Final disambiguation happens in JS so we don't trust .or() chain semantics.
  const orExpr = tokens
    .flatMap((t) => [`first_name.ilike.%${t}%`, `last_name.ilike.%${t}%`])
    .join(",");

  const { data: players, error } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, team_id, teams:teams(abbreviation)")
    .or(orExpr)
    .limit(20);
  if (error) return { ok: false, reason: `db error: ${error.message}` };
  if (!players || players.length === 0) {
    return { ok: false, reason: `No player matched "${raw}".` };
  }

  // Score candidates: exact full-name match > all-tokens-present > anything.
  const lcTokens = tokens.map((t) => t.toLowerCase());
  const scored = players
    .map((p) => {
      const full = `${p.first_name} ${p.last_name}`.toLowerCase();
      const allTokensHit = lcTokens.every((t) => full.includes(t));
      const isExact = full === raw.toLowerCase();
      return { p, score: (isExact ? 100 : 0) + (allTokensHit ? 10 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  if (scored[0].score === 0) {
    return { ok: false, reason: `No player matched "${raw}".` };
  }
  const player = scored[0].p;
  const team = Array.isArray(player.teams) ? player.teams[0] : player.teams;

  const { data: rows, error: statsErr } = await supabase
    .from("player_game_stats")
    .select(
      "game_id, player_id, team_id, minutes, points, rebounds, assists, steals, blocks, turnovers, personal_fouls, fgm, fga, fg3m, fg3a, ftm, fta, is_home, started, games:games!inner(date)",
    )
    .eq("player_id", player.id)
    .limit(40);

  if (statsErr) return { ok: false, reason: `db error: ${statsErr.message}` };
  if (!rows || rows.length === 0) {
    return {
      ok: false,
      reason: `Found ${player.first_name} ${player.last_name} but no game stats are recorded yet.`,
    };
  }

  // computeFeatures contract: history MUST be sorted desc by game_date.
  // Sort in JS off the joined date — game_id isn't monotonic with date
  // (postseason, postponed games, all-star break).
  const history: PlayerGameStatLine[] = rows
    .map((r) => {
      const g = Array.isArray(r.games) ? r.games[0] : r.games;
      return { row: r, date: g?.date ?? "" };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 20)
    .map(({ row: r, date }) => ({
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
      game_date: date,
    }));

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
