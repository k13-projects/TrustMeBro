import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { teamColors, teamLogoUrl } from "@/lib/sports/nba/branding";
import { computeFeatures, isAnomalousLastGame } from "@/lib/analysis/features";
import { statValue } from "@/lib/analysis/market-field";
import type { PlayerGameStatLine, PropMarket } from "@/lib/analysis/types";
import { JerseyChip } from "@/components/JerseyChip";
import { PlayerAvatar } from "@/components/PlayerAvatar";

export const revalidate = 60;

type PageProps = {
  params: Promise<{ id: string }>;
};

type TeamRow = {
  id: number;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
  full_name: string;
  name: string;
};

type PlayerLite = {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  jersey_number: string | null;
};

type StatRow = {
  game_id: number;
  player_id: number;
  team_id: number;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  fg3m: number | null;
  is_home: boolean;
  games:
    | { date: string }
    | { date: string }[]
    | null;
};

export default async function TeamDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const teamId = Number(rawId);
  if (!Number.isFinite(teamId)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: team } = (await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle()) as { data: TeamRow | null };

  if (!team) notFound();

  const { data: playersRaw } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, jersey_number")
    .eq("team_id", teamId)
    .order("last_name", { ascending: true });
  const players = (playersRaw ?? []) as PlayerLite[];

  const playerIds = players.map((p) => p.id);

  const { data: statsRaw } = playerIds.length
    ? await supabase
        .from("player_game_stats")
        .select(
          "game_id, player_id, team_id, minutes, points, rebounds, assists, steals, blocks, fg3m, is_home, games!inner(date)",
        )
        .in("player_id", playerIds)
        .order("games(date)", { ascending: false })
    : { data: [] };
  const stats = (statsRaw ?? []) as StatRow[];

  const historyByPlayer = new Map<number, PlayerGameStatLine[]>();
  for (const s of stats) {
    const list = historyByPlayer.get(s.player_id) ?? [];
    if (list.length >= 30) continue;
    const games = Array.isArray(s.games) ? (s.games[0] ?? null) : s.games;
    list.push({
      game_id: s.game_id,
      player_id: s.player_id,
      team_id: s.team_id,
      minutes: s.minutes,
      points: s.points,
      rebounds: s.rebounds,
      assists: s.assists,
      steals: s.steals,
      blocks: s.blocks,
      turnovers: null,
      personal_fouls: null,
      fgm: null,
      fga: null,
      fg3m: s.fg3m,
      fg3a: null,
      ftm: null,
      fta: null,
      is_home: s.is_home,
      started: null,
      game_date: games?.date ?? "",
    });
    historyByPlayer.set(s.player_id, list);
  }

  const { data: predictionsToday } = await supabase
    .from("predictions")
    .select("player_id")
    .eq("status", "pending")
    .in("player_id", playerIds.length > 0 ? playerIds : [-1]);
  const playersWithPicks = new Set<number>(
    (predictionsToday ?? []).map((r: { player_id: number }) => r.player_id),
  );

  const colors = teamColors(team.abbreviation);

  const rosterCards = players
    .map((p) => {
      const history = historyByPlayer.get(p.id) ?? [];
      const recent = history.slice(0, 10);
      const avgMinutes =
        recent.length > 0
          ? recent.reduce((s, h) => s + (h.minutes ?? 0), 0) / recent.length
          : 0;
      return { player: p, history, recent, avgMinutes };
    })
    .filter((r) => r.recent.length > 0)
    .sort((a, b) => b.avgMinutes - a.avgMinutes);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <TeamHero team={team} colors={colors} />

      <section className="space-y-3">
        <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          Roster · sorted by recent minutes
        </h2>
        {rosterCards.length === 0 ? (
          <div className="glass glass-sheen rounded-2xl p-8 text-center text-foreground/55">
            No recent box scores synced for this team.
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {rosterCards.map(({ player, recent, avgMinutes }) => (
              <PlayerTile
                key={player.id}
                player={player}
                team={team}
                recent={recent}
                avgMinutes={avgMinutes}
                hasPick={playersWithPicks.has(player.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TeamHero({
  team,
  colors,
}: {
  team: TeamRow;
  colors: { primary: string; secondary: string };
}) {
  const logo = teamLogoUrl(team.abbreviation);
  return (
    <section className="relative overflow-hidden rounded-3xl glass-strong glass-sheen grain">
      <div
        aria-hidden
        className="absolute -inset-px opacity-60 pointer-events-none"
        style={{
          background: `radial-gradient(40rem 24rem at 10% 30%, ${colors.primary}66, transparent 60%), radial-gradient(30rem 18rem at 90% 80%, ${colors.secondary}55, transparent 60%)`,
        }}
      />
      <div className="relative p-6 sm:p-10 flex items-center gap-6 flex-wrap">
        <div
          className="size-24 sm:size-32 rounded-3xl grid place-items-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${colors.primary}40, ${colors.secondary}25)`,
            boxShadow: `inset 0 0 0 1px ${colors.primary}66`,
          }}
        >
          {logo ? (
            <Image
              src={logo}
              alt={team.abbreviation}
              width={160}
              height={160}
              className="size-20 sm:size-24 object-contain"
              unoptimized
            />
          ) : (
            <span className="text-2xl font-semibold">{team.abbreviation}</span>
          )}
        </div>
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/55 font-mono">
            {team.conference} · {team.division}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            {team.full_name}
          </h1>
          <div className="text-xs text-foreground/55 font-mono">
            {team.abbreviation}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayerTile({
  player,
  team,
  recent,
  avgMinutes,
  hasPick,
}: {
  player: PlayerLite;
  team: TeamRow;
  recent: PlayerGameStatLine[];
  avgMinutes: number;
  hasPick: boolean;
}) {
  const pointsValues = recent
    .map((h) => h.points)
    .filter((v): v is number => v !== null);
  const lastGamePoints = recent[0]?.points ?? null;
  const l10Mean =
    pointsValues.length > 0
      ? pointsValues.reduce((s, v) => s + v, 0) / pointsValues.length
      : 0;

  const features = computeFeatures({
    player_id: player.id,
    market: "points" as PropMarket,
    history: recent,
    opponent_team_id: 0,
  });
  const anomaly =
    isAnomalousLastGame(features) && features.last_game_value !== null;

  return (
    <Link
      href={`/players/${player.id}`}
      className="glass glass-sheen rounded-2xl p-3 hover:bg-white/3 transition-colors space-y-3 block"
    >
      <header className="flex items-center gap-3">
        <PlayerAvatar
          playerId={player.id}
          firstName={player.first_name}
          lastName={player.last_name}
          abbreviation={team.abbreviation}
          size={48}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {player.first_name} {player.last_name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <JerseyChip number={player.jersey_number} />
            {player.position ? (
              <span className="text-[10px] text-foreground/50 font-mono uppercase">
                {player.position}
              </span>
            ) : null}
            <span className="text-[10px] text-foreground/45 font-mono ml-1">
              {avgMinutes.toFixed(0)} min avg
            </span>
          </div>
        </div>
        {hasPick ? (
          <span
            className="rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 size-2"
            title="Has a pending pick"
            aria-label="Has pending pick"
          />
        ) : null}
      </header>

      <div className="flex items-center justify-between gap-3">
        <Sparkline values={pointsValues.slice(0, 5).reverse()} />
        <div className="text-right text-[10px] space-y-0.5 shrink-0">
          <div>
            <span className="text-emerald-400 font-mono tabular-nums">
              {l10Mean.toFixed(1)}
            </span>
            <span className="text-foreground/45 ml-1">L10</span>
          </div>
          {lastGamePoints !== null ? (
            <div>
              <span className="text-amber-400 font-mono tabular-nums">
                {lastGamePoints}
              </span>
              <span className="text-foreground/45 ml-1">last</span>
            </div>
          ) : null}
        </div>
      </div>

      {anomaly ? (
        <div className="text-[10px] uppercase tracking-widest text-amber-300/85">
          ⚠ Anomaly last game
        </div>
      ) : null}
    </Link>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <div className="text-[10px] text-foreground/35">no data</div>;
  }
  const W = 96;
  const H = 28;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const stepX = values.length > 1 ? W / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = H - ((v - min) / range) * H;
      return `${x},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="rgb(52 211 153)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

void statValue; // kept for future combined-stat extensions on this page
