import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { TableMove } from "@/lib/sports/soccer/home-queries";
import { TeamCrest } from "./TeamCrest";

// How the table changed over the last round. When there is no "before" to
// compare against (the opening round of a league phase) we say so plainly
// and show the first table instead of pretending to have movement.
export function HomeMovers({
  moves,
  firstTable,
  roundLabel,
}: {
  moves: TableMove[];
  firstTable: boolean;
  roundLabel: string;
}) {
  if (moves.length === 0) return null;
  const top = moves.filter((m) => m.row.rank <= 8);
  const bubble = moves.filter((m) => m.row.rank >= 9 && m.row.rank <= 12);

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/55">
        {firstTable
          ? `The first table of the league phase, after ${roundLabel}. The top eight go straight to the Round of 16; ninth to twenty-fourth play off.`
          : `Position changes over ${roundLabel}. The top eight go straight to the Round of 16; ninth to twenty-fourth play off.`}
      </p>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <Group title="Round of 16 places" rows={top} firstTable={firstTable} />
        {bubble.length > 0 ? (
          <Group title="On the bubble" rows={bubble} firstTable={firstTable} muted />
        ) : null}
      </div>
      <Link
        href="/football/standings"
        className="inline-block py-1 -my-1 text-sm font-semibold text-primary hover:text-primary-hover"
      >
        Full table →
      </Link>
    </div>
  );
}

function Group({
  title,
  rows,
  firstTable,
  muted = false,
}: {
  title: string;
  rows: TableMove[];
  firstTable: boolean;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "border-t border-border/60" : ""}>
      <div className="border-b border-border/40 bg-black/20 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
        {title}
      </div>
      <ul className="divide-y divide-border/30">
        {rows.map((m) => (
          <li key={m.row.team.id} className="flex items-center gap-3 px-4 py-2">
            <span
              className={`w-5 text-xs tabular-nums ${
                muted ? "text-foreground/45" : "font-bold text-primary"
              }`}
            >
              {m.row.rank}
            </span>
            <TeamCrest crest={m.row.team.crest} name={m.row.team.name} size={20} />
            <Link
              href={`/football/club/${m.row.team.id}`}
              className="min-w-0 flex-1 truncate py-1 -my-1 text-sm font-semibold hover:text-primary"
            >
              {m.row.team.name}
            </Link>
            {m.pointsGained > 0 ? (
              <span className="hidden text-[11px] text-emerald-400/80 sm:inline">
                +{m.pointsGained}
              </span>
            ) : null}
            {!firstTable ? <Movement delta={m.delta} /> : null}
            <span className="w-8 text-right text-sm font-bold tabular-nums">
              {m.row.points}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Movement({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="w-10 text-right text-[11px] text-foreground/35">new</span>;
  }
  if (delta === 0) {
    return (
      <span className="flex w-10 items-center justify-end gap-0.5 text-[11px] text-foreground/35">
        <Minus size={11} aria-hidden /> 0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`flex w-10 items-center justify-end gap-0.5 text-[11px] font-semibold ${
        up ? "text-emerald-400" : "text-rose-400"
      }`}
      title={up ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
    >
      {up ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />}
      {Math.abs(delta)}
    </span>
  );
}
