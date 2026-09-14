import Image from "next/image";
import Link from "next/link";
import type { Tie } from "@/lib/sports/soccer/bracket";
import type { SoccerCompetition } from "@/lib/sports/soccer/competitions";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";

// Knockout bracket: one column per stage, one card per tie. Reads left to
// right from the earliest round to the final. Two-legged ties show both legs
// under the aggregate; single-leg rounds show the one score. The side that
// went through is lit in the competition accent; the eliminated side dims.
export function Bracket({
  columns,
  competition,
}: {
  columns: Array<{ stage: string; label: string; ties: Tie[] }>;
  competition: SoccerCompetition;
}) {
  const flags = COMPETITIONS[competition].kind === "national";
  return (
    // Phones stack the rounds top to bottom (a side-scrolling row would be as
    // tall as its tallest round, leaving dead space under the short ones);
    // from sm the rounds sit side by side and scroll horizontally.
    <div className="-mx-4 px-4 pb-4 sm:overflow-x-auto sm:[scrollbar-width:thin]">
      <div className="flex flex-col gap-8 sm:w-max sm:flex-row sm:items-start sm:gap-6">
        {columns.map((col) => (
          <section key={col.stage} className="w-full shrink-0 space-y-3 sm:w-[17rem]">
            <header className="flex items-baseline justify-between border-b border-border/60 pb-2">
              <h2 className="font-display text-base uppercase tracking-[0.08em]">{col.label}</h2>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
                {col.ties.length} {col.ties.length === 1 ? "tie" : "ties"}
              </span>
            </header>
            <div className="space-y-3">
              {col.ties.map((tie) => (
                <TieCard key={tie.key} tie={tie} flags={flags} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TieCard({ tie, flags }: { tie: Tie; flags: boolean }) {
  const rows: Array<{ side: "A" | "B"; team: Tie["teamA"]; agg: number }> = [
    { side: "A", team: tie.teamA, agg: tie.aggA },
    { side: "B", team: tie.teamB, agg: tie.aggB },
  ];
  const single = tie.legs.length === 1;
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
      <ul className="divide-y divide-border/40">
        {rows.map((r) => {
          const won = tie.decided && tie.winner === r.side;
          const lost = tie.decided && tie.winner !== null && tie.winner !== r.side;
          return (
            <li
              key={r.side}
              className={`flex items-center gap-2.5 px-3 py-2 ${
                won ? "bg-primary/10" : ""
              } ${lost ? "opacity-50" : ""}`}
            >
              <span className={`relative grid size-6 shrink-0 place-items-center ${flags ? "" : ""}`}>
                {r.team.crest ? (
                  <Image
                    src={r.team.crest}
                    alt=""
                    width={24}
                    height={24}
                    className={`size-6 object-contain ${flags ? "rounded-sm object-cover" : ""}`}
                    unoptimized
                  />
                ) : (
                  <span className="text-[9px] font-bold text-foreground/60">
                    {r.team.abbreviation.slice(0, 3)}
                  </span>
                )}
              </span>
              <Link
                href={`/football/club/${r.team.id}`}
                className={`min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary ${
                  won ? "text-primary" : ""
                }`}
              >
                {r.team.name}
              </Link>
              <span
                className={`w-6 text-right font-display text-base tabular-nums ${
                  won ? "text-primary" : "text-foreground/80"
                }`}
              >
                {tie.legs.some((l) => l.finished) ? r.agg : "–"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 bg-black/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
        {tie.legs.map((leg, i) => (
          <Link
            key={leg.id}
            href={`/football/match/${leg.id}`}
            className="inline-flex items-center gap-1 hover:text-foreground"
            title={`${leg.home.name} v ${leg.away.name}`}
          >
            <span>{single ? "Match" : `Leg ${i + 1}`}</span>
            <span className="tabular-nums text-foreground/70">
              {leg.finished
                ? `${leg.home_score}–${leg.away_score}`
                : new Date(`${leg.date}T12:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
            </span>
          </Link>
        ))}
        {tie.decided && tie.winner === null ? (
          <span className="text-foreground/40">level · decided on penalties</span>
        ) : null}
        {!single && tie.legs.length === 1 && !tie.decided ? (
          <span className="text-foreground/40">2nd leg to come</span>
        ) : null}
      </div>
    </div>
  );
}
