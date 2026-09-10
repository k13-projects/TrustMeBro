import type { StandingRow } from "@/lib/sports/soccer/queries";
import type { SoccerCompetition } from "@/lib/sports/soccer/competitions";
import { accentColor } from "./MatchBanner";
import { CountryFlag } from "./CountryFlag";
import { TeamCrest } from "./TeamCrest";

// League-phase zones (36-team format): 1–8 straight to the Round of 16,
// 9–24 into the knockout play-offs, 25–36 out. World Cup groups: top two go
// through. `format` picks which rule paints the rows.
export type StandingsFormat = "league-phase" | "group";

function zoneFor(rank: number, format: StandingsFormat) {
  if (format === "group") {
    return rank <= 2
      ? { key: "adv", rankClass: "text-primary font-bold", bar: "bg-primary" }
      : { key: "out", rankClass: "text-foreground/40", bar: "bg-transparent" };
  }
  if (rank <= 8) return { key: "r16", rankClass: "text-primary font-bold", bar: "bg-primary" };
  if (rank <= 24) return { key: "po", rankClass: "text-foreground/80", bar: "bg-[var(--ucl-silver,#c9d3e6)]/70" };
  return { key: "out", rankClass: "text-foreground/35", bar: "bg-transparent" };
}

export function StandingsTable({
  group,
  rows,
  format = "group",
  competition,
}: {
  group: string;
  rows: StandingRow[];
  format?: StandingsFormat;
  competition: SoccerCompetition;
}) {
  const clubs = competition !== "fifa.world";
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <span className="font-display text-sm uppercase tracking-[0.08em]">{group}</span>
        {format === "league-phase" ? (
          <span className="hidden items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/50 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-1 rounded-full bg-primary" /> Round of 16
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-1 rounded-full bg-[var(--ucl-silver,#c9d3e6)]/70" /> Play-offs
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-1 rounded-full border border-white/15" /> Out
            </span>
          </span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-foreground/45">
              <th className="px-4 py-2 text-left font-medium">Team</th>
              <th className="px-2 py-2 text-center font-medium">P</th>
              <th className="px-2 py-2 text-center font-medium">W</th>
              <th className="px-2 py-2 text-center font-medium">D</th>
              <th className="px-2 py-2 text-center font-medium">L</th>
              <th className="hidden px-2 py-2 text-center font-medium sm:table-cell">GF</th>
              <th className="hidden px-2 py-2 text-center font-medium sm:table-cell">GA</th>
              <th className="px-2 py-2 text-center font-medium">GD</th>
              <th className="px-3 py-2 text-center font-semibold text-foreground/70">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const zone = zoneFor(r.rank, format);
              const cut =
                format === "league-phase" && (r.rank === 8 || r.rank === 24);
              const accent = clubs ? accentColor(r.team.color) : null;
              return (
                <tr
                  key={r.team.id || r.team.abbreviation + r.rank}
                  className={`border-t border-border/40 ${cut ? "[&>td]:border-b [&>td]:border-b-primary/35" : ""}`}
                >
                  <td className="relative px-4 py-2">
                    <span
                      aria-hidden
                      className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r ${zone.bar}`}
                    />
                    <span className="flex items-center gap-2.5">
                      <span className={`w-5 text-xs tabular-nums ${zone.rankClass}`}>
                        {r.rank}
                      </span>
                      {clubs ? (
                        <TeamCrest crest={r.team.crest} name={r.team.name} size={22} />
                      ) : (
                        <CountryFlag
                          crest={r.team.crest}
                          abbr={r.team.abbreviation}
                          name={r.team.name}
                          size={18}
                        />
                      )}
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <span className="truncate">{r.team.name}</span>
                        {accent ? (
                          <span
                            aria-hidden
                            className="hidden size-1.5 shrink-0 rounded-full sm:inline-block"
                            style={{ background: accent }}
                          />
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{r.played}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{r.won}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{r.draw}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{r.lost}</td>
                  <td className="hidden px-2 py-2 text-center tabular-nums text-foreground/70 sm:table-cell">{r.goals_for}</td>
                  <td className="hidden px-2 py-2 text-center tabular-nums text-foreground/70 sm:table-cell">{r.goals_against}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-foreground/70">
                    {r.goal_diff > 0 ? `+${r.goal_diff}` : r.goal_diff}
                  </td>
                  <td className="px-3 py-2 text-center font-bold tabular-nums">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
