import Link from "next/link";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamBadge } from "@/components/TeamBadge";
import { marketLabel } from "@/components/MarketLabel";
import { teamColors } from "@/lib/sports/nba/branding";
import type { FeaturedPlayer } from "@/lib/analysis/featured-players";

const STATUS_COPY: Record<
  "pending" | "won" | "lost" | "void",
  { label: string; tone: string }
> = {
  pending: { label: "tonight", tone: "text-primary" },
  won: { label: "won", tone: "text-positive" },
  lost: { label: "lost", tone: "text-negative" },
  void: { label: "void", tone: "text-foreground/55" },
};

export function TrendingPlayers({
  players,
}: {
  players: FeaturedPlayer[];
}) {
  if (players.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 space-y-5">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Players · today
          </p>
          <h2 className="font-display uppercase text-[clamp(1.9rem,4vw,2.8rem)] leading-tight tracking-tight mt-1">
            <span className="text-foreground">Who we&apos;re </span>
            <span
              style={{
                background:
                  "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Watching
            </span>
          </h2>
        </div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Click any face for the full breakdown
        </p>
      </header>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {players.map((p) => (
          <PlayerStickerCard key={p.player_id} player={p} />
        ))}
      </div>
    </section>
  );
}

function PlayerStickerCard({ player }: { player: FeaturedPlayer }) {
  const colors = teamColors(player.team_abbreviation);
  const teamLite =
    player.team_id != null && player.team_abbreviation
      ? {
          id: player.team_id,
          abbreviation: player.team_abbreviation,
          full_name: player.team_full_name ?? player.team_abbreviation,
        }
      : null;
  const pick = player.latest_pick;
  const statusCopy = pick ? STATUS_COPY[pick.status] : null;

  return (
    <Link
      href={`/players/${player.player_id}`}
      className="group relative card-tmb p-4 pt-6 flex flex-col items-center text-center gap-3 hover:-translate-y-0.5 transition-transform overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${colors.primary}1F 0%, transparent 60%)`,
      }}
    >
      {pick?.is_bet_of_the_day ? (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary/20 border border-primary/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-primary">
          <span aria-hidden>★</span>BotD
        </span>
      ) : null}

      <PlayerAvatar
        playerId={player.player_id}
        firstName={player.first_name}
        lastName={player.last_name}
        abbreviation={player.team_abbreviation ?? ""}
        size={96}
        variant="sticker"
      />

      <div className="space-y-0.5 min-w-0 w-full">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
          {player.first_name}
        </p>
        <p className="font-display uppercase text-base leading-none truncate">
          {player.last_name}
        </p>
        <div className="flex items-center justify-center gap-1.5 pt-1.5">
          <TeamBadge team={teamLite} size={14} />
          <span className="text-[10px] text-muted-foreground font-mono uppercase">
            {player.team_abbreviation ?? "—"}
            {player.position ? ` · ${player.position}` : ""}
          </span>
        </div>
      </div>

      <div className="w-full pt-2 border-t border-border/60 min-h-[2.2rem] flex items-center justify-center">
        {pick && statusCopy ? (
          <div className="space-y-0.5">
            <p className="text-[11px] font-mono tabular-nums uppercase text-foreground/85">
              {pick.pick} {pick.line} {marketLabel(pick.market).toUpperCase()}
            </p>
            <p className={`text-[10px] uppercase tracking-[0.18em] ${statusCopy.tone}`}>
              {pick.confidence.toFixed(0)}% · {statusCopy.label}
            </p>
          </div>
        ) : (
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            No active pick
          </p>
        )}
      </div>
    </Link>
  );
}
