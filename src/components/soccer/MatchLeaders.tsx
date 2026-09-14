import type { TeamLeaders } from "@/lib/sports/soccer/provider";
import type { MatchRow } from "@/lib/sports/soccer/queries";
import { TeamCrest } from "./TeamCrest";
import { CountryFlag } from "./CountryFlag";

// Who has actually produced for each side in this competition so far. ESPN
// only counts matches inside the competition, so early in a season these are
// short lists — which is honest, and better than padding them out.
const CATEGORY_ORDER = ["goalsLeaders", "assistsLeaders", "totalShots", "saves"];

export function MatchLeaders({
  match,
  leaders,
  national,
  competitionLabel,
}: {
  match: MatchRow;
  leaders: TeamLeaders[];
  national: boolean;
  competitionLabel: string;
}) {
  const forTeam = (id: number) => leaders.find((l) => l.teamId === id) ?? null;
  const home = forTeam(match.home.id);
  const away = forTeam(match.away.id);
  if (!home && !away) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl uppercase tracking-tight">Names to watch</h2>
        <span className="text-[11px] text-foreground/40">
          {competitionLabel} only, this season
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TeamColumn team={match.home} block={home} national={national} />
        <TeamColumn team={match.away} block={away} national={national} />
      </div>
    </section>
  );
}

function TeamColumn({
  team,
  block,
  national,
}: {
  team: MatchRow["home"];
  block: TeamLeaders | null;
  national: boolean;
}) {
  const categories = (block?.categories ?? [])
    .slice()
    .sort(
      (a, b) =>
        (CATEGORY_ORDER.indexOf(a.key) + 1 || 99) - (CATEGORY_ORDER.indexOf(b.key) + 1 || 99),
    )
    .filter((c) => CATEGORY_ORDER.includes(c.key));

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
        {national ? (
          <CountryFlag crest={team.crest} abbr={team.abbreviation} name={team.name} size={20} />
        ) : (
          <TeamCrest crest={team.crest} name={team.name} size={22} />
        )}
        <span className="min-w-0 truncate font-display text-sm uppercase tracking-wide">
          {team.name}
        </span>
      </div>
      {categories.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-foreground/40">
          Nobody has registered a goal, assist or save here yet.
        </p>
      ) : (
        <ul className="divide-y divide-border/30">
          {categories.map((c) => (
            <li key={c.key} className="px-4 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/35">
                {c.label}
              </div>
              <div className="mt-1 space-y-1">
                {c.entries.slice(0, 2).map((e) => (
                  <div key={e.player} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {e.player}
                      {e.position ? (
                        <span className="ml-1.5 text-[10px] font-normal text-foreground/35">
                          {e.position}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-primary">
                      {e.value}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
