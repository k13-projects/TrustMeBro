import Image from "next/image";
import Link from "next/link";
import { nbaProvider } from "@/lib/sports/nba";
import { teamColors, teamLogoUrl } from "@/lib/sports/nba/branding";
import type { Team } from "@/lib/sports/types";

export const revalidate = 86400;

export default async function TeamsPage() {
  let teams: Team[] = [];
  let error: string | null = null;
  try {
    teams = await nbaProvider().listTeams();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const byConf = teams.reduce<Record<string, Team[]>>((acc, t) => {
    const conf = t.conference || "Other";
    (acc[conf] ??= []).push(t);
    return acc;
  }, {});

  const order = ["East", "West", "Other"];
  const ordered = order
    .filter((k) => byConf[k])
    .map((k) => [k, byConf[k]] as const);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          NBA · League
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          Teams
        </h1>
      </header>

      {error ? (
        <div className="glass glass-sheen rounded-2xl p-6 border-amber-400/30">
          <p className="text-sm text-foreground/80">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ordered.map(([conf, list]) => (
            <section
              key={conf}
              className="glass glass-sheen rounded-2xl p-5 space-y-4"
            >
              <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/50">
                {conf}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {list
                  .slice()
                  .sort((a, b) => a.full_name.localeCompare(b.full_name))
                  .map((t) => (
                    <TeamPill key={t.id} team={t} />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamPill({ team }: { team: Team }) {
  const logo = teamLogoUrl(team.abbreviation);
  const colors = teamColors(team.abbreviation);
  return (
    <li>
      <Link
        href={`/teams/${team.id}`}
        className="relative flex items-center gap-3 rounded-xl px-3 py-2 bg-white/[0.03] border border-white/8 hover:border-white/15 transition-colors overflow-hidden"
      >
        <span
          aria-hidden
          className="absolute -left-6 -top-6 size-20 rounded-full blur-2xl opacity-50 pointer-events-none"
          style={{ background: colors.primary }}
        />
        <div
          className="size-10 rounded-lg grid place-items-center relative"
          style={{
            background: `linear-gradient(135deg, ${colors.primary}30, ${colors.secondary}20)`,
            boxShadow: `inset 0 0 0 1px ${colors.primary}55`,
          }}
        >
          {logo ? (
            <Image
              src={logo}
              alt={team.abbreviation}
              width={48}
              height={48}
              className="size-8 object-contain"
              unoptimized
            />
          ) : (
            <span className="text-xs font-semibold">{team.abbreviation}</span>
          )}
        </div>
        <div className="min-w-0 relative">
          <div className="font-medium text-sm truncate">{team.full_name}</div>
          <div className="text-[10px] text-foreground/50 uppercase tracking-widest">
            {team.division}
          </div>
        </div>
      </Link>
    </li>
  );
}
