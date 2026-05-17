import Link from "next/link";
import { TeamBadge } from "@/components/TeamBadge";
import { teamColors } from "@/lib/sports/nba/branding";
import type { PredictionRow, TeamLite } from "@/components/types";

export type SlateGame = {
  id: number;
  date: string;
  datetime: string | null;
  status: string;
  home_team_id: number;
  visitor_team_id: number;
};

export function TodaysSlate({
  games,
  predictions,
  teamById,
  date,
}: {
  games: SlateGame[];
  predictions: PredictionRow[];
  teamById: Map<number, TeamLite>;
  date: string;
}) {
  if (games.length === 0) {
    return (
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-4 pb-2">
        <SectionHead title="Tonight's Slate" subtitle={`No NBA games on ${date}.`} />
      </section>
    );
  }

  const picksByGame = new Map<number, PredictionRow[]>();
  for (const p of predictions) {
    const list = picksByGame.get(p.game_id) ?? [];
    list.push(p);
    picksByGame.set(p.game_id, list);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-4 pb-6 space-y-4">
      <SectionHead
        title="Tonight's Slate"
        subtitle={`${games.length} game${games.length === 1 ? "" : "s"} · top picks per matchup`}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g) => {
          const home = teamById.get(g.home_team_id) ?? null;
          const visitor = teamById.get(g.visitor_team_id) ?? null;
          const picks = (picksByGame.get(g.id) ?? [])
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 2);
          return (
            <GameCard
              key={g.id}
              gameId={g.id}
              datetime={g.datetime}
              status={g.status}
              home={home}
              visitor={visitor}
              picks={picks}
            />
          );
        })}
      </div>
    </section>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 flex-wrap">
      <h2 className="font-display uppercase text-[clamp(1.6rem,3.4vw,2.4rem)] leading-none tracking-tight">
        {title}
      </h2>
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
        {subtitle}
      </p>
    </div>
  );
}

function GameCard({
  gameId,
  datetime,
  status,
  home,
  visitor,
  picks,
}: {
  gameId: number;
  datetime: string | null;
  status: string;
  home: TeamLite | null;
  visitor: TeamLite | null;
  picks: PredictionRow[];
}) {
  const homeColors = teamColors(home?.abbreviation);
  const visitorColors = teamColors(visitor?.abbreviation);
  const tipoff = datetime
    ? new Date(datetime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;
  const final = status?.toLowerCase().includes("final");
  const live = status?.toLowerCase().includes("live") || /q[1-4]/i.test(status ?? "");

  return (
    <article className="card-tmb group flex flex-col overflow-hidden hover:-translate-y-0.5 transition-transform">
      <div
        className="relative px-4 pt-4 pb-3"
        style={{
          background: `linear-gradient(90deg, ${visitorColors.primary}28, transparent 50%, ${homeColors.primary}28)`,
        }}
      >
        <div className="flex items-center justify-between">
          <TeamSide team={visitor} side="away" />
          <span className="font-display text-foreground/55 text-sm">@</span>
          <TeamSide team={home} side="home" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-foreground/55">
          <Link
            href={`/games/${gameId}`}
            className="hover:text-foreground/85 transition-colors"
          >
            {tipoff ?? "TBD"} · matchup details →
          </Link>
          {live ? (
            <span className="inline-flex items-center gap-1 text-positive">
              <span className="size-1.5 rounded-full bg-positive soft-pulse" />
              live
            </span>
          ) : final ? (
            <span className="text-foreground/45">final</span>
          ) : (
            <span className="text-foreground/45">pre-game</span>
          )}
        </div>
      </div>
      <div className="border-t border-border/60 px-4 py-3 space-y-1.5 min-h-[3.5rem]">
        {picks.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No qualifying picks for this game.
          </p>
        ) : (
          picks.map((p) => (
            <Link
              key={p.id}
              href={`/players/${p.player_id}`}
              className="flex items-center justify-between gap-2 text-xs hover:bg-white/5 -mx-1 px-1 py-0.5 rounded transition-colors"
            >
              <span className="truncate text-foreground/85">
                {p.player.first_name.charAt(0)}.{" "}
                <span className="font-medium">{p.player.last_name}</span>{" "}
                <span className="text-foreground/55 uppercase tracking-wide">
                  {p.pick} {p.line} {marketShort(p.market)}
                </span>
              </span>
              <span className="font-mono tabular-nums text-primary font-semibold">
                {Math.round(p.confidence)}%
              </span>
            </Link>
          ))
        )}
      </div>
    </article>
  );
}

function TeamSide({
  team,
  side,
}: {
  team: TeamLite | null;
  side: "home" | "away";
}) {
  if (!team) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-foreground/55 text-xs uppercase tracking-widest">
          {side === "home" ? "Home" : "Away"}
        </span>
      </div>
    );
  }
  return (
    <Link
      href={`/teams/${team.id}`}
      className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
    >
      <TeamBadge team={team} size={36} />
      <div className="flex flex-col min-w-0">
        <span className="font-display text-sm uppercase truncate">
          {team.abbreviation}
        </span>
        <span className="text-[10px] text-foreground/55 truncate">
          {team.full_name}
        </span>
      </div>
    </Link>
  );
}

function marketShort(market: string): string {
  return (
    { points: "PTS", rebounds: "REB", assists: "AST", threes_made: "3PM", pra: "PRA", minutes: "MIN", steals: "STL", blocks: "BLK" }[market] ?? market.toUpperCase()
  );
}
