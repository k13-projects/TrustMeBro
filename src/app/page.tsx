import Image from "next/image";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import type { Reasoning } from "@/lib/analysis/types";
import {
  initials,
  playerHeadshotUrl,
  teamColors,
  teamLogoUrl,
} from "@/lib/sports/nba/branding";

export const revalidate = 30;

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

type PredictionRow = {
  id: string;
  game_id: number;
  player_id: number;
  market: string;
  line: number;
  pick: "over" | "under";
  projection: number;
  confidence: number;
  is_bet_of_the_day: boolean;
  reasoning: Reasoning;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    team_id: number | null;
    position: string | null;
    jersey_number: string | null;
  };
};

type TeamLite = {
  id: number;
  abbreviation: string;
  full_name: string;
};

const MARKET_LABEL: Record<string, string> = {
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
  threes_made: "3PT Made",
  minutes: "Minutes",
  steals: "Steals",
  blocks: "Blocks",
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = isValidIsoDate(params.date) ? params.date : todayIsoDate();
  const prev = isoDateOffset(date, -1);
  const next = isoDateOffset(date, 1);

  const supabase = await createSupabaseServerClient();

  const { data: games } = await supabase
    .from("games")
    .select("id, home_team_id, visitor_team_id, status")
    .eq("date", date);
  const gameIds = (games ?? []).map((g) => g.id);

  let predictions: PredictionRow[] = [];
  if (gameIds.length > 0) {
    const { data } = await supabase
      .from("predictions")
      .select(
        "id, game_id, player_id, market, line, pick, projection, confidence, is_bet_of_the_day, reasoning, player:players!inner(id, first_name, last_name, team_id, position, jersey_number)",
      )
      .in("game_id", gameIds)
      .order("is_bet_of_the_day", { ascending: false })
      .order("confidence", { ascending: false });
    predictions = (data ?? []) as unknown as PredictionRow[];
  }

  const teamIds = Array.from(
    new Set(
      predictions
        .map((p) => p.player.team_id)
        .filter((id): id is number => id !== null),
    ),
  );
  const { data: teams } = teamIds.length
    ? await supabase
        .from("teams")
        .select("id, abbreviation, full_name")
        .in("id", teamIds)
    : { data: [] };
  const teamById = new Map(
    ((teams ?? []) as TeamLite[]).map((t) => [t.id, t] as const),
  );

  const botd = predictions.find((p) => p.is_bet_of_the_day) ?? null;
  const others = botd ? predictions.filter((p) => p.id !== botd.id) : predictions;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            NBA · Today
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
            Today&apos;s Picks
          </h1>
          <p className="text-sm text-foreground/55 mt-1">
            {predictions.length > 0
              ? `${predictions.length} picks for ${date}`
              : `No picks for ${date} yet`}
          </p>
        </div>
        <nav className="glass rounded-full flex items-center gap-1 p-1 text-sm">
          <DatePill href={`/?date=${prev}`} label={`← ${prev}`} />
          <DatePill href="/" label="Today" emphasis />
          <DatePill href={`/?date=${next}`} label={`${next} →`} />
        </nav>
      </header>

      {predictions.length === 0 ? (
        <EmptyState date={date} hasGames={gameIds.length > 0} />
      ) : (
        <>
          {botd ? (
            <BetOfTheDayCard
              prediction={botd}
              team={teamById.get(botd.player.team_id ?? -1) ?? null}
            />
          ) : null}

          <section className="space-y-3">
            <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
              All Picks
            </h2>
            <div className="grid gap-3">
              {others.map((p) => (
                <PickRow
                  key={p.id}
                  prediction={p}
                  team={teamById.get(p.player.team_id ?? -1) ?? null}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function DatePill({
  href,
  label,
  emphasis,
}: {
  href: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 transition-colors ${
        emphasis
          ? "bg-white/10 text-foreground"
          : "text-foreground/65 hover:text-foreground hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
}

function PlayerAvatar({
  playerId,
  firstName,
  lastName,
  abbreviation,
  size = 80,
}: {
  playerId: number;
  firstName: string;
  lastName: string;
  abbreviation: string;
  size?: number;
}) {
  const url = playerHeadshotUrl(playerId);
  const colors = teamColors(abbreviation);
  const ring = `0 0 0 2px ${colors.primary}`;
  return (
    <div
      className="relative rounded-full overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 30%, ${colors.primary}, ${colors.secondary} 75%)`,
        boxShadow: ring,
      }}
    >
      {url ? (
        // ESPN headshots are 1040x760 with the player off-center; this crop
        // centers the face. Falls back to initials if image 404s.
        <Image
          src={url}
          alt={`${firstName} ${lastName}`}
          width={size * 2}
          height={size * 2}
          className="absolute inset-0 size-full object-cover object-top scale-110"
          unoptimized
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center font-semibold text-white/95"
              style={{ fontSize: size * 0.35 }}>
          {initials(firstName, lastName)}
        </span>
      )}
    </div>
  );
}

function TeamBadge({
  team,
  size = 24,
}: {
  team: TeamLite | null;
  size?: number;
}) {
  if (!team) return null;
  const url = teamLogoUrl(team.abbreviation);
  if (!url) return null;
  return (
    <Image
      src={url}
      alt={team.abbreviation}
      width={size * 2}
      height={size * 2}
      className="shrink-0"
      style={{ width: size, height: size }}
      unoptimized
    />
  );
}

function JerseyChip({ number }: { number: string | null }) {
  if (!number) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/10 px-2 py-0.5 text-[11px] font-mono tabular-nums text-foreground/80">
      #{number}
    </span>
  );
}

function ConfidenceRing({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const color =
    s >= 90
      ? "rgb(52 211 153)"
      : s >= 75
        ? "rgb(251 191 36)"
        : "rgb(148 163 184)";
  return (
    <div className="relative shrink-0" style={{ width: 84, height: 84 }}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2.5"
        />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${s}, 100`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <div className="text-xl font-semibold tabular-nums">{Math.round(s)}</div>
          <div className="text-[9px] uppercase tracking-widest text-foreground/50 mt-1">
            Confidence
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfidencePill({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const tone =
    s >= 90
      ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/30"
      : s >= 75
        ? "bg-amber-400/15 text-amber-300 border-amber-400/30"
        : "bg-white/5 text-foreground/60 border-white/10";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono tabular-nums ${tone}`}
    >
      {Math.round(s)}
    </span>
  );
}

function PickSideTag({ side }: { side: "over" | "under" }) {
  const isOver = side === "over";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        isOver
          ? "bg-emerald-400/15 text-emerald-300"
          : "bg-rose-400/15 text-rose-300"
      }`}
    >
      <span aria-hidden>{isOver ? "▲" : "▼"}</span>
      {side}
    </span>
  );
}

function BetOfTheDayCard({
  prediction,
  team,
}: {
  prediction: PredictionRow;
  team: TeamLite | null;
}) {
  const colors = teamColors(team?.abbreviation);
  const market = MARKET_LABEL[prediction.market] ?? prediction.market;
  const name = `${prediction.player.first_name} ${prediction.player.last_name}`;

  return (
    <section className="relative overflow-hidden rounded-3xl glass-strong glass-sheen grain">
      {/* Team-colored aura behind the card */}
      <div
        aria-hidden
        className="absolute -inset-px opacity-50 pointer-events-none"
        style={{
          background: `radial-gradient(40rem 22rem at 12% 30%, ${colors.primary}66, transparent 60%), radial-gradient(30rem 18rem at 90% 80%, ${colors.secondary}55, transparent 60%)`,
        }}
      />
      <div className="relative p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2 text-amber-300">
          <span aria-hidden className="text-base">★</span>
          <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase">
            Bet of the Day
          </h2>
        </div>

        <div className="flex items-start gap-6 flex-wrap">
          <PlayerAvatar
            playerId={prediction.player.id}
            firstName={prediction.player.first_name}
            lastName={prediction.player.last_name}
            abbreviation={team?.abbreviation ?? ""}
            size={120}
          />
          <div className="flex-1 min-w-[200px] space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <TeamBadge team={team} size={28} />
                <span className="text-xs text-foreground/65">
                  {team?.full_name ?? ""}
                </span>
                <JerseyChip number={prediction.player.jersey_number} />
                {prediction.player.position ? (
                  <span className="text-[11px] text-foreground/50 font-mono uppercase">
                    {prediction.player.position}
                  </span>
                ) : null}
              </div>
              <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                {name}
              </h3>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <PickSideTag side={prediction.pick} />
              <span className="text-2xl font-semibold tabular-nums">
                {prediction.line}
              </span>
              <span className="text-foreground/65">{market}</span>
            </div>
            <p className="text-xs text-foreground/55">
              Engine projection:{" "}
              <span className="font-mono tabular-nums text-foreground/90">
                {prediction.projection.toFixed(1)}
              </span>
            </p>
          </div>
          <ConfidenceRing score={prediction.confidence} />
        </div>

        <ReasoningPanel reasoning={prediction.reasoning} />
      </div>
    </section>
  );
}

function PickRow({
  prediction,
  team,
}: {
  prediction: PredictionRow;
  team: TeamLite | null;
}) {
  const market = MARKET_LABEL[prediction.market] ?? prediction.market;
  const colors = teamColors(team?.abbreviation);
  const name = `${prediction.player.first_name} ${prediction.player.last_name}`;

  return (
    <details className="group glass glass-sheen rounded-2xl overflow-hidden">
      <summary className="cursor-pointer list-none p-3 sm:p-4 flex items-center gap-4">
        {/* Team-color side stripe */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
          style={{
            background: `linear-gradient(180deg, ${colors.primary}, ${colors.secondary})`,
          }}
        />
        <PlayerAvatar
          playerId={prediction.player.id}
          firstName={prediction.player.first_name}
          lastName={prediction.player.last_name}
          abbreviation={team?.abbreviation ?? ""}
          size={48}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{name}</span>
            <JerseyChip number={prediction.player.jersey_number} />
            <TeamBadge team={team} size={18} />
            {prediction.player.position ? (
              <span className="text-[10px] text-foreground/45 font-mono uppercase">
                {prediction.player.position}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-baseline gap-2 text-sm">
            <PickSideTag side={prediction.pick} />
            <span className="font-mono tabular-nums">{prediction.line}</span>
            <span className="text-foreground/60">{market}</span>
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <div className="text-[10px] uppercase tracking-widest text-foreground/45">
            Projection
          </div>
          <div className="font-mono tabular-nums text-foreground/80">
            {prediction.projection.toFixed(1)}
          </div>
        </div>
        <ConfidencePill score={prediction.confidence} />
        <span
          aria-hidden
          className="text-foreground/40 transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <ReasoningPanel reasoning={prediction.reasoning} />
      </div>
    </details>
  );
}

function ReasoningPanel({ reasoning }: { reasoning: Reasoning }) {
  if (!reasoning?.checks?.length) return null;
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 divide-y divide-white/5 text-xs overflow-hidden">
      {reasoning.checks.map((c, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 px-3 py-2"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              className={
                c.passed ? "text-emerald-400" : "text-foreground/30"
              }
              aria-hidden
            >
              {c.passed ? "✓" : "·"}
            </span>
            <span
              className={`truncate ${c.passed ? "text-foreground/85" : "text-foreground/50"}`}
            >
              {c.label}
            </span>
          </span>
          <span className="font-mono tabular-nums text-foreground/60 shrink-0">
            {c.value.toFixed(1)} vs {c.target}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  date,
  hasGames,
}: {
  date: string;
  hasGames: boolean;
}) {
  return (
    <div className="glass glass-sheen rounded-2xl p-8 text-center space-y-2">
      <p className="text-foreground/70">
        {hasGames
          ? `Games are scheduled for ${date} but no predictions have been generated yet.`
          : `No NBA games (and no picks) for ${date}.`}
      </p>
      {hasGames ? (
        <p className="text-xs text-foreground/50 font-mono">
          Run: <code>/api/cron/generate-predictions?date={date}</code> (with
          the cron Bearer token)
        </p>
      ) : null}
    </div>
  );
}
