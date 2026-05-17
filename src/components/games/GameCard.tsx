import Image from "next/image";
import Link from "next/link";
import { teamColors, teamLogoUrl } from "@/lib/sports/nba/branding";
import type { Game, Team } from "@/lib/sports/types";

export function isFinalStatus(status: string | null | undefined): boolean {
  return !!status?.toLowerCase().includes("final");
}

export function GameCard({ game }: { game: Game }) {
  const isFinal = isFinalStatus(game.status);
  const homeWins = isFinal && game.home_team_score > game.visitor_team_score;
  const visitorWins =
    isFinal && game.visitor_team_score > game.home_team_score;
  const home = teamColors(game.home_team.abbreviation);
  const away = teamColors(game.visitor_team.abbreviation);

  const matchupLabel = `${game.visitor_team.full_name} at ${game.home_team.full_name} — open matchup`;

  return (
    <Link
      href={`/games/${game.id}`}
      aria-label={matchupLabel}
      className="group relative block overflow-hidden rounded-2xl glass glass-sheen grain transition hover:-translate-y-0.5 hover:ring-1 hover:ring-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
    >
      <article>
        <div
          aria-hidden
          className="absolute inset-0 opacity-50 pointer-events-none transition group-hover:opacity-70"
          style={{
            background: `linear-gradient(90deg, ${away.primary}44 0%, transparent 45%, transparent 55%, ${home.primary}44 100%)`,
          }}
        />
        <div className="relative p-5 space-y-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-foreground/55">
            <span>{game.status || "Scheduled"}</span>
            <span className="flex items-center gap-2">
              {game.postseason ? (
                <span className="rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5 border border-amber-400/30 text-[10px]">
                  Playoffs
                </span>
              ) : null}
              <span
                aria-hidden
                className="text-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-foreground/75"
              >
                →
              </span>
            </span>
          </div>
          <TeamRow
            team={game.visitor_team}
            score={game.visitor_team_score}
            winning={visitorWins}
            finalized={isFinal}
          />
          <div className="border-t border-white/8" />
          <TeamRow
            team={game.home_team}
            score={game.home_team_score}
            winning={homeWins}
            finalized={isFinal}
            home
          />
        </div>
      </article>
    </Link>
  );
}

function TeamRow({
  team,
  score,
  winning,
  finalized,
  home,
}: {
  team: Team;
  score: number;
  winning: boolean;
  finalized: boolean;
  home?: boolean;
}) {
  const logo = teamLogoUrl(team.abbreviation);
  const colors = teamColors(team.abbreviation);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="size-12 rounded-xl grid place-items-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${colors.primary}40, ${colors.secondary}25)`,
            boxShadow: `inset 0 0 0 1px ${colors.primary}55`,
          }}
        >
          {logo ? (
            <Image
              src={logo}
              alt={team.abbreviation}
              width={56}
              height={56}
              className="size-9 object-contain"
              unoptimized
            />
          ) : (
            <span className="text-xs font-semibold">{team.abbreviation}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-medium truncate ${
                finalized && !winning ? "text-foreground/55" : ""
              }`}
            >
              {team.full_name}
            </span>
            {home ? (
              <span className="text-[9px] uppercase tracking-widest text-foreground/40">
                Home
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-foreground/50 font-mono">
            {team.abbreviation}
          </div>
        </div>
      </div>
      <div
        className={`text-3xl font-semibold tabular-nums ${
          finalized && winning
            ? "text-foreground"
            : finalized
              ? "text-foreground/45"
              : "text-foreground/80"
        }`}
      >
        {score}
      </div>
    </div>
  );
}
