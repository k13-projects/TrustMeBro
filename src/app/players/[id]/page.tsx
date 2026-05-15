import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { teamColors } from "@/lib/sports/nba/branding";
import { computeFeatures, isAnomalousLastGame } from "@/lib/analysis/features";
import { statValue } from "@/lib/analysis/market-field";
import { detectAll, type DetectedPattern } from "@/lib/analysis/patterns";
import type {
  PlayerGameStatLine,
  PropMarket,
} from "@/lib/analysis/types";
import { JerseyChip } from "@/components/JerseyChip";
import { PickRow } from "@/components/PickRow";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SeasonStatsBlock } from "@/components/SeasonStatsBlock";
import { StatComparisonCard } from "@/components/StatComparisonCard";
import { TeamBadge } from "@/components/TeamBadge";
import type { PredictionRow, TeamLite } from "@/components/types";

export const revalidate = 30;

const MARKETS: PropMarket[] = ["points", "rebounds", "assists", "threes_made"];

type PageProps = {
  params: Promise<{ id: string }>;
};

type StatGame = {
  date: string;
  home_team_id: number;
  visitor_team_id: number;
  status: string;
  home_team_score: number;
  visitor_team_score: number;
};

type StatRow = {
  game_id: number;
  team_id: number;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  personal_fouls: number | null;
  fgm: number | null;
  fga: number | null;
  fg_pct: number | null;
  fg3m: number | null;
  fg3a: number | null;
  ftm: number | null;
  fta: number | null;
  is_home: boolean;
  started: boolean | null;
  games: StatGame | null;
};

function normalizeStatRow(raw: unknown): StatRow {
  const r = raw as Record<string, unknown> & {
    games?: StatGame | StatGame[] | null;
  };
  const games = Array.isArray(r.games) ? (r.games[0] ?? null) : (r.games ?? null);
  return { ...(r as unknown as StatRow), games };
}

type PlayerRow = {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  height: string | null;
  weight: string | null;
  jersey_number: string | null;
  college: string | null;
  country: string | null;
  team_id: number | null;
  team: TeamLite | null;
};

type PatternRow = {
  pattern_type: string;
  market: PropMarket | null;
  description: string;
  confidence: number | string | null;
  detected_at: string;
};

export default async function PlayerDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: player } = (await supabase
    .from("players")
    .select(
      "id, first_name, last_name, position, height, weight, jersey_number, college, country, team_id, team:teams(id, abbreviation, full_name)",
    )
    .eq("id", id)
    .maybeSingle()) as { data: PlayerRow | null };

  if (!player) notFound();

  const team: TeamLite | null = Array.isArray(player.team)
    ? (player.team[0] ?? null)
    : player.team;

  const [{ data: statsRaw }, { data: predictionsRaw }, { data: patternsRaw }] =
    await Promise.all([
      supabase
        .from("player_game_stats")
        .select(
          "game_id, team_id, minutes, points, rebounds, assists, steals, blocks, turnovers, personal_fouls, fgm, fga, fg_pct, fg3m, fg3a, ftm, fta, is_home, started, games!inner(date, home_team_id, visitor_team_id, status, home_team_score, visitor_team_score)",
        )
        .eq("player_id", id)
        .order("games(date)", { ascending: false })
        .limit(30),
      supabase
        .from("predictions")
        .select(
          "id, game_id, player_id, market, line, pick, projection, confidence, is_bet_of_the_day, reasoning, player:players!inner(id, first_name, last_name, team_id, position, jersey_number)",
        )
        .eq("player_id", id)
        .eq("status", "pending")
        .order("confidence", { ascending: false }),
      supabase
        .from("patterns")
        .select("pattern_type, market, description, confidence, detected_at")
        .eq("player_id", id)
        .order("detected_at", { ascending: false }),
    ]);

  const stats = (statsRaw ?? []).map(normalizeStatRow);

  const history: PlayerGameStatLine[] = stats.map((s) => ({
    game_id: s.game_id,
    player_id: id,
    team_id: s.team_id,
    minutes: s.minutes,
    points: s.points,
    rebounds: s.rebounds,
    assists: s.assists,
    steals: s.steals,
    blocks: s.blocks,
    turnovers: s.turnovers,
    personal_fouls: s.personal_fouls,
    fgm: s.fgm,
    fga: s.fga,
    fg3m: s.fg3m,
    fg3a: s.fg3a,
    ftm: s.ftm,
    fta: s.fta,
    is_home: s.is_home,
    started: s.started,
    game_date: s.games?.date ?? "",
  }));

  const opponentForGame = (s: StatRow): number => {
    if (!s.games) return 0;
    return s.team_id === s.games.home_team_id
      ? s.games.visitor_team_id
      : s.games.home_team_id;
  };

  const opponentIds = Array.from(
    new Set(stats.map(opponentForGame).filter((v) => v > 0)),
  );
  const { data: oppTeams } = opponentIds.length
    ? await supabase
        .from("teams")
        .select("id, abbreviation, full_name")
        .in("id", opponentIds)
    : { data: [] };
  const teamById = new Map<number, TeamLite>(
    ((oppTeams ?? []) as TeamLite[]).map((t) => [t.id, t]),
  );

  const predictions = (predictionsRaw ?? []) as unknown as PredictionRow[];

  const livePatterns: DetectedPattern[] = MARKETS.flatMap((m) =>
    detectAll(history, m),
  );
  const savedPatterns = (patternsRaw ?? []) as PatternRow[];

  const anomalyByMarket = new Map<
    PropMarket,
    { z: number; mean: number; value: number } | null
  >();
  let anyAnomaly = false;
  for (const m of MARKETS) {
    const features = computeFeatures({
      player_id: id,
      market: m,
      history,
      opponent_team_id: 0,
    });
    if (
      isAnomalousLastGame(features) &&
      features.last_game_value !== null &&
      features.last10.stdev > 0
    ) {
      const z =
        Math.abs(features.last_game_value - features.last10.mean) /
        features.last10.stdev;
      anomalyByMarket.set(m, {
        z,
        mean: features.last10.mean,
        value: features.last_game_value,
      });
      anyAnomaly = true;
    } else {
      anomalyByMarket.set(m, null);
    }
  }

  const colors = teamColors(team?.abbreviation);
  const fullName = `${player.first_name} ${player.last_name}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <Hero
        player={player}
        fullName={fullName}
        team={team}
        colors={colors}
        history={history}
        anyAnomaly={anyAnomaly}
      />

      <SeasonStatsBlock history={history} variant="full" />

      <section className="grid gap-3 md:grid-cols-2">
        {MARKETS.map((market) => {
          const features = computeFeatures({
            player_id: id,
            market,
            history,
            opponent_team_id: 0,
          });
          const last5Values = history
            .slice(0, 5)
            .map((s) => statValue(s, market))
            .filter((v): v is number => v !== null);
          const prevValue = statValue(history[0] ?? null as never, market);
          const prev2Value = statValue(history[1] ?? null as never, market);
          return (
            <StatComparisonCard
              key={market}
              features={features}
              market={market}
              last5Values={last5Values}
              prevValue={history[0] ? prevValue : null}
              prev2Value={history[1] ? prev2Value : null}
              anomaly={anomalyByMarket.get(market) ?? null}
            />
          );
        })}
      </section>

      {livePatterns.length + savedPatterns.length > 0 ? (
        <PatternsCard live={livePatterns} saved={savedPatterns} />
      ) : null}

      {predictions.length > 0 ? (
        <ActivePicksCard predictions={predictions} team={team} />
      ) : null}

      {history.length > 0 ? (
        <GameLogCard
          history={history}
          stats={stats}
          teamById={teamById}
          ownTeamId={team?.id ?? null}
        />
      ) : null}
    </div>
  );
}

function Hero({
  player,
  fullName,
  team,
  colors,
  history,
  anyAnomaly,
}: {
  player: PlayerRow;
  fullName: string;
  team: TeamLite | null;
  colors: { primary: string; secondary: string };
  history: PlayerGameStatLine[];
  anyAnomaly: boolean;
}) {
  const gamesPlayed = history.filter(
    (h) => h.minutes !== null && h.minutes > 0,
  ).length;
  return (
    <section className="relative overflow-hidden rounded-3xl glass-strong glass-sheen grain">
      <div
        aria-hidden
        className="absolute -inset-px opacity-50 pointer-events-none"
        style={{
          background: `radial-gradient(40rem 22rem at 8% 30%, ${colors.primary}66, transparent 60%), radial-gradient(30rem 18rem at 92% 80%, ${colors.secondary}55, transparent 60%)`,
        }}
      />
      <div className="relative p-6 sm:p-8 flex items-start gap-6 flex-wrap">
        <PlayerAvatar
          playerId={player.id}
          firstName={player.first_name}
          lastName={player.last_name}
          abbreviation={team?.abbreviation ?? ""}
          size={140}
        />
        <div className="flex-1 min-w-[220px] space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-sm text-foreground/65">
            <TeamBadge team={team} size={24} />
            <span>{team?.full_name ?? "Free agent"}</span>
            <JerseyChip number={player.jersey_number} />
            {player.position ? (
              <span className="text-xs text-foreground/55 font-mono uppercase">
                {player.position}
              </span>
            ) : null}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            {fullName}
          </h1>
          <div className="flex items-center gap-3 flex-wrap text-xs text-foreground/55">
            {player.height ? <span>{player.height}</span> : null}
            {player.weight ? <span>{player.weight} lbs</span> : null}
            {player.college ? <span>{player.college}</span> : null}
            {player.country && player.country !== "USA" ? (
              <span>{player.country}</span>
            ) : null}
            <span className="font-mono tabular-nums">
              {gamesPlayed} games recorded
            </span>
          </div>
        </div>
        {anyAnomaly ? (
          <div
            className="rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 px-3 py-1 text-[11px] font-medium uppercase tracking-wider"
            title="At least one market deviated more than 1.5σ in the last game"
          >
            ⚠ Anomaly last game
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PatternsCard({
  live,
  saved,
}: {
  live: DetectedPattern[];
  saved: PatternRow[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
        Patterns
      </h2>
      <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
        {live.map((p, i) => (
          <PatternRow
            key={`live-${i}`}
            type={p.pattern_type}
            market={p.market}
            description={p.description}
            confidence={Number(p.confidence)}
            badge="Live"
          />
        ))}
        {saved.map((p, i) => (
          <PatternRow
            key={`saved-${i}`}
            type={p.pattern_type}
            market={p.market}
            description={p.description}
            confidence={p.confidence == null ? null : Number(p.confidence)}
            badge="Saved"
          />
        ))}
      </div>
    </section>
  );
}

function PatternRow({
  type,
  market,
  description,
  confidence,
  badge,
}: {
  type: string;
  market: PropMarket | string | null;
  description: string;
  confidence: number | null;
  badge: "Live" | "Saved";
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="rounded-md bg-purple-500/15 text-purple-300 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium">
          {type.replaceAll("_", " ")}
        </span>
        {market ? (
          <span className="rounded-md bg-white/5 text-foreground/65 px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono">
            {market}
          </span>
        ) : null}
        <p className="text-sm text-foreground/85 truncate">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-foreground/45">
          {badge}
        </span>
        {confidence !== null ? (
          <span className="font-mono tabular-nums text-xs text-foreground/70">
            {Math.round(confidence * 100)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ActivePicksCard({
  predictions,
  team,
}: {
  predictions: PredictionRow[];
  team: TeamLite | null;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
        Active Picks
      </h2>
      <div className="grid gap-3">
        {predictions.map((p) => (
          <PickRow key={p.id} prediction={p} team={team} />
        ))}
      </div>
    </section>
  );
}

function GameLogCard({
  history,
  stats,
  teamById,
  ownTeamId,
}: {
  history: PlayerGameStatLine[];
  stats: StatRow[];
  teamById: Map<number, TeamLite>;
  ownTeamId: number | null;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
        Last {history.length} games
      </h2>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-black/40 backdrop-blur">
              <tr className="text-left text-foreground/55">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Opp</th>
                <th className="px-2 py-2 font-medium">Result</th>
                <th className="px-2 py-2 font-medium text-right">MIN</th>
                <th className="px-2 py-2 font-medium text-right">PTS</th>
                <th className="px-2 py-2 font-medium text-right">REB</th>
                <th className="px-2 py-2 font-medium text-right">AST</th>
                <th className="px-2 py-2 font-medium text-right">3PM</th>
                <th className="px-2 py-2 font-medium text-right">FG%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stats.map((s, i) => {
                const row = buildGameLogRow(s, history[i], teamById, ownTeamId);
                return (
                  <tr
                    key={s.game_id}
                    className="hover:bg-white/3 font-mono tabular-nums"
                  >
                    <td className="px-3 py-2 text-foreground/85">{row.date}</td>
                    <td className="px-2 py-2 text-foreground/65">
                      <span className="flex items-center gap-1.5">
                        <span>{row.locationGlyph}</span>
                        {row.oppId ? (
                          <Link
                            href={`/teams/${row.oppId}`}
                            className="hover:underline"
                          >
                            {row.oppAbbr}
                          </Link>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <ResultBadge result={row.result} />
                      {row.scoreText ? (
                        <span className="ml-1 text-[10px] text-foreground/45">
                          {row.scoreText}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right text-foreground/85">
                      {row.minutes}
                    </td>
                    <td className="px-2 py-2 text-right text-foreground/85">
                      {row.points}
                    </td>
                    <td className="px-2 py-2 text-right text-foreground/85">
                      {row.rebounds}
                    </td>
                    <td className="px-2 py-2 text-right text-foreground/85">
                      {row.assists}
                    </td>
                    <td className="px-2 py-2 text-right text-foreground/85">
                      {row.threes}
                    </td>
                    <td className="px-2 py-2 text-right text-foreground/65">
                      {row.fgPct}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="sm:hidden divide-y divide-white/5">
          {stats.map((s, i) => {
            const row = buildGameLogRow(s, history[i], teamById, ownTeamId);
            return (
              <li key={s.game_id} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-foreground/85 font-mono tabular-nums">
                    <span>{row.date}</span>
                    <span className="text-foreground/45">·</span>
                    <span className="text-foreground/65">
                      {row.locationGlyph}{" "}
                      {row.oppId ? (
                        <Link
                          href={`/teams/${row.oppId}`}
                          className="hover:underline"
                        >
                          {row.oppAbbr}
                        </Link>
                      ) : null}
                    </span>
                    {row.scoreText ? (
                      <span className="text-foreground/45 text-[10px]">
                        {row.scoreText}
                      </span>
                    ) : null}
                  </div>
                  <ResultBadge result={row.result} />
                </div>
                <div className="grid grid-cols-5 gap-1.5 font-mono tabular-nums">
                  <MiniStat label="MIN" value={row.minutes} />
                  <MiniStat label="PTS" value={row.points} emphasis />
                  <MiniStat label="REB" value={row.rebounds} />
                  <MiniStat label="AST" value={row.assists} />
                  <MiniStat label="3PM" value={row.threes} />
                </div>
                <div className="text-[10px] text-foreground/45 font-mono tabular-nums">
                  FG {row.fgPct}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

type GameLogRow = {
  date: string;
  oppId: number | null;
  oppAbbr: string;
  locationGlyph: "vs" | "@";
  result: "W" | "L" | null;
  scoreText: string | null;
  minutes: string;
  points: string;
  rebounds: string;
  assists: string;
  threes: string;
  fgPct: string;
};

function buildGameLogRow(
  s: {
    game_id: number;
    minutes: number | null;
    points: number | null;
    rebounds: number | null;
    assists: number | null;
    fg3m: number | null;
    fg_pct: number | null;
    is_home: boolean;
    games: {
      home_team_id: number;
      visitor_team_id: number;
      home_team_score: number;
      visitor_team_score: number;
    } | null;
  },
  h: { game_date: string },
  teamById: Map<number, TeamLite>,
  ownTeamId: number | null,
): GameLogRow {
  const oppId = s.games
    ? s.is_home
      ? s.games.visitor_team_id
      : s.games.home_team_id
    : null;
  const opp = oppId ? teamById.get(oppId) : null;
  const ownScore =
    ownTeamId !== null && s.games
      ? ownTeamId === s.games.home_team_id
        ? s.games.home_team_score
        : s.games.visitor_team_score
      : null;
  const oppScore =
    ownTeamId !== null && s.games
      ? ownTeamId === s.games.home_team_id
        ? s.games.visitor_team_score
        : s.games.home_team_score
      : null;
  const result: "W" | "L" | null =
    ownScore !== null && oppScore !== null
      ? ownScore > oppScore
        ? "W"
        : ownScore < oppScore
          ? "L"
          : null
      : null;
  return {
    date: h.game_date.slice(5),
    oppId: oppId ?? null,
    oppAbbr: opp?.abbreviation ?? "",
    locationGlyph: s.is_home ? "vs" : "@",
    result,
    scoreText:
      ownScore !== null && oppScore !== null
        ? `${ownScore}-${oppScore}`
        : null,
    minutes: s.minutes !== null ? s.minutes.toFixed(0) : "—",
    points: s.points !== null ? String(s.points) : "—",
    rebounds: s.rebounds !== null ? String(s.rebounds) : "—",
    assists: s.assists !== null ? String(s.assists) : "—",
    threes: s.fg3m !== null ? String(s.fg3m) : "—",
    fgPct: s.fg_pct !== null ? `${(s.fg_pct * 100).toFixed(0)}%` : "—",
  };
}

function ResultBadge({ result }: { result: "W" | "L" | null }) {
  if (result === "W") {
    return (
      <span className="rounded bg-emerald-400/15 text-emerald-300 px-1.5 py-0.5 text-[10px]">
        W
      </span>
    );
  }
  if (result === "L") {
    return (
      <span className="rounded bg-rose-400/15 text-rose-300 px-1.5 py-0.5 text-[10px]">
        L
      </span>
    );
  }
  return <span className="text-foreground/40">·</span>;
}

function MiniStat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/8 px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-widest text-foreground/45">
        {label}
      </div>
      <div
        className={emphasis ? "text-base font-semibold" : "text-sm text-foreground/85"}
      >
        {value}
      </div>
    </div>
  );
}

