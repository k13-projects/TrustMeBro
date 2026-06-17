import type { StandingRow } from "@/lib/sports/soccer/queries";
import { CountryFlag } from "./CountryFlag";

export function StandingsTable({
  group,
  rows,
}: {
  group: string;
  rows: StandingRow[];
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 font-bold uppercase tracking-wide text-sm">
        {group}
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-foreground/45">
            <th className="px-4 py-2 text-left font-medium">Team</th>
            <th className="px-2 py-2 text-center font-medium">P</th>
            <th className="px-2 py-2 text-center font-medium">W</th>
            <th className="px-2 py-2 text-center font-medium">D</th>
            <th className="px-2 py-2 text-center font-medium">L</th>
            <th className="px-2 py-2 text-center font-medium">GD</th>
            <th className="px-3 py-2 text-center font-semibold text-foreground/70">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // Top two of a group advance — give them a subtle gold edge.
            const advancing = r.rank <= 2;
            return (
              <tr
                key={r.team.abbreviation + r.rank}
                className="border-t border-border/40"
              >
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={`w-4 text-xs tabular-nums ${advancing ? "text-primary font-bold" : "text-foreground/40"}`}
                    >
                      {r.rank}
                    </span>
                    <CountryFlag crest={r.team.crest} abbr={r.team.abbreviation} name={r.team.name} size={18} />
                    <span className="font-semibold">{r.team.name}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{r.played}</td>
                <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{r.won}</td>
                <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{r.draw}</td>
                <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{r.lost}</td>
                <td className="px-2 py-2 text-center tabular-nums text-foreground/70">
                  {r.goal_diff > 0 ? `+${r.goal_diff}` : r.goal_diff}
                </td>
                <td className="px-3 py-2 text-center tabular-nums font-bold">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
