import type {
  BreakdownCell,
  EngineBreakdown as EngineBreakdownData,
} from "@/lib/sports/soccer/queries";

// "Where the engine wins" — five compact groups (market, favourite/underdog,
// home/away, price band, confidence band) below the scoreboard's headline
// stats. Every cell only exists if at least one pick landed in it (see
// getEngineBreakdown), so a group only needs hiding when nothing in it has
// settled decisively yet (all voids, e.g. a rained-off run of matches).

function hitRate(cell: BreakdownCell): number | null {
  const decisive = cell.won + cell.lost;
  return decisive > 0 ? Math.round((cell.won / decisive) * 100) : null;
}

function Row({ cell }: { cell: BreakdownCell }) {
  const hit = hitRate(cell);
  const unitsTone =
    cell.units > 0 ? "text-emerald-400" : cell.units < 0 ? "text-rose-400" : "text-foreground/55";
  const roiTone =
    cell.roi === null
      ? "text-foreground/35"
      : cell.roi > 0
        ? "text-emerald-400"
        : cell.roi < 0
          ? "text-rose-400"
          : "text-foreground/55";
  const record = `${cell.won}-${cell.lost}${cell.voided > 0 ? `-${cell.voided}` : ""}`;

  return (
    <div className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-tight text-foreground/85">
          {cell.label}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
          {hit !== null ? (
            <div
              className={`h-full rounded-full ${cell.units >= 0 ? "bg-emerald-400/70" : "bg-rose-400/70"}`}
              style={{ width: `${hit}%` }}
            />
          ) : null}
        </div>
      </div>
      <div className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground/45">
        {record}
      </div>
      <div className="w-9 shrink-0 text-right text-sm font-bold tabular-nums">
        {hit !== null ? `${hit}%` : "—"}
      </div>
      <div className={`w-11 shrink-0 text-right text-sm font-bold tabular-nums ${unitsTone}`}>
        {cell.units > 0 ? "+" : ""}
        {cell.units.toFixed(1)}
      </div>
      <div className={`w-12 shrink-0 text-right text-[11px] tabular-nums ${roiTone}`}>
        {cell.roi === null ? "—" : `${cell.roi > 0 ? "+" : ""}${Math.round(cell.roi * 100)}%`}
      </div>
    </div>
  );
}

const GROUP_TITLES: Record<keyof Omit<EngineBreakdownData, "settled">, string> = {
  byMarket: "By market",
  bySide: "Favourites vs underdogs",
  byVenue: "Home vs away",
  byPrice: "By price",
  byConfidence: "By confidence",
};

export function EngineBreakdown({ breakdown }: { breakdown: EngineBreakdownData }) {
  if (breakdown.settled === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
        The breakdown appears once picks from this competition have been graded.
      </div>
    );
  }

  const groups = (
    Object.keys(GROUP_TITLES) as Array<keyof typeof GROUP_TITLES>
  )
    .map((key) => ({ key, title: GROUP_TITLES[key], cells: breakdown[key] }))
    .filter((g) => g.cells.some((c) => c.won + c.lost > 0));

  if (groups.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
        The breakdown appears once picks from this competition have been graded.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl uppercase tracking-wide">
          Where the engine wins
        </h2>
        <p className="mt-1 text-xs text-foreground/45">
          Flat one-unit stakes at the best available price at pick time.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div
            key={g.key}
            className="rounded-2xl border border-border/60 bg-card/40 px-4 py-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/45">
              {g.title}
            </div>
            <div className="mt-1 divide-y divide-white/5">
              {g.cells
                .filter((c) => c.won + c.lost + c.voided > 0)
                .map((c) => (
                  <Row key={c.key} cell={c} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
