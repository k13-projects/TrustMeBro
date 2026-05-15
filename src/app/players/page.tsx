import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JerseyChip } from "@/components/JerseyChip";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamBadge } from "@/components/TeamBadge";
import type { TeamLite } from "@/components/types";

export const revalidate = 60;

type PlayerLite = {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  jersey_number: string | null;
  team_id: number | null;
};

export default async function PlayersPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: playersRaw }, { data: teamsRaw }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, position, jersey_number, team_id")
      .not("team_id", "is", null)
      .order("last_name", { ascending: true }),
    supabase
      .from("teams")
      .select("id, abbreviation, full_name, conference")
      .order("full_name", { ascending: true }),
  ]);

  const players = (playersRaw ?? []) as PlayerLite[];
  const teams = (teamsRaw ?? []) as Array<TeamLite & { conference: string }>;

  const playersByTeam = new Map<number, PlayerLite[]>();
  for (const p of players) {
    if (p.team_id == null) continue;
    const list = playersByTeam.get(p.team_id) ?? [];
    list.push(p);
    playersByTeam.set(p.team_id, list);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          NBA · Roster
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          Players
        </h1>
        <p className="text-sm text-foreground/55 mt-1">
          {players.length} players across {teams.length} teams. Tap a card for
          the full color-coded comparison view.
        </p>
      </header>

      {players.length === 0 ? (
        <div className="glass glass-sheen rounded-2xl p-8 text-center space-y-2">
          <p className="text-foreground/70">
            No players have been synced yet.
          </p>
          <p className="text-xs text-foreground/45">
            Player rosters refresh from the upstream provider — they&apos;ll
            appear here once the next sync completes.
          </p>
        </div>
      ) : null}

      {teams.map((team) => {
        const roster = playersByTeam.get(team.id) ?? [];
        if (roster.length === 0) return null;
        return (
          <section key={team.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <TeamBadge team={team} size={24} />
              <Link
                href={`/teams/${team.id}`}
                className="font-semibold tracking-tight hover:underline"
              >
                {team.full_name}
              </Link>
              <span className="text-[10px] uppercase tracking-widest text-foreground/45">
                {roster.length} players
              </span>
            </div>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {roster.map((p) => (
                <Link
                  key={p.id}
                  href={`/players/${p.id}`}
                  className="glass glass-sheen rounded-2xl p-3 flex items-center gap-3 hover:bg-white/3 transition-colors"
                >
                  <PlayerAvatar
                    playerId={p.id}
                    firstName={p.first_name}
                    lastName={p.last_name}
                    abbreviation={team.abbreviation}
                    size={44}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {p.first_name} {p.last_name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <JerseyChip number={p.jersey_number} />
                      {p.position ? (
                        <span className="text-[10px] text-foreground/50 font-mono uppercase">
                          {p.position}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
