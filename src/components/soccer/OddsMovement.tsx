import type { OddsPoint } from "@/lib/sports/soccer/queries";
import type { MatchSide } from "@/lib/sports/types";

// Inline-SVG line chart of de-vigged consensus probability over time, per
// outcome of the match-result market, plus a small total-goals row when a
// line is priced. No chart library — a handful of points, drawn by hand.
const W = 640;
const H = 168;
const PAD_X = 4;
const PAD_Y = 20;
const MINI_H = 56;
const MINI_PAD_Y = 10;

function xFor(i: number, n: number, width: number, padX: number): number {
  if (n <= 1) return padX;
  return padX + (i / (n - 1)) * (width - padX * 2);
}

function yFor(prob: number, height: number, padY: number): number {
  const clamped = Math.min(1, Math.max(0, prob));
  return height - padY - clamped * (height - padY * 2);
}

// One SVG path per contiguous run of known values (a snapshot can be missing
// a side, e.g. a book pulled a market — the line breaks rather than lying).
function pathFor(vals: Array<number | null>, height: number, padY: number, width: number, padX: number): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  vals.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) paths.push(current.join(" "));
      current = [];
      return;
    }
    const cmd = current.length === 0 ? "M" : "L";
    current.push(`${cmd} ${xFor(i, vals.length, width, padX).toFixed(1)} ${yFor(v, height, padY).toFixed(1)}`);
  });
  if (current.length > 1) paths.push(current.join(" "));
  return paths;
}

function lastValue(vals: Array<number | null>): number | null {
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i] !== null) return vals[i];
  }
  return null;
}

const RESULT_LINES: Array<{ side: MatchSide; nameKind: "home" | "draw" | "away"; stroke: string; dot: string }> = [
  { side: "home", nameKind: "home", stroke: "stroke-primary", dot: "fill-primary" },
  { side: "draw", nameKind: "draw", stroke: "stroke-muted-foreground", dot: "fill-muted-foreground" },
  { side: "away", nameKind: "away", stroke: "stroke-white/70", dot: "fill-white/70" },
];

export function OddsMovement({
  points,
  homeName,
  awayName,
}: {
  points: OddsPoint[];
  homeName: string;
  awayName: string;
}) {
  const winner = points.filter((p) => p.market === "match_winner");
  const timestamps = [...new Set(winner.map((p) => p.capturedAt))].sort();

  if (timestamps.length < 2) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-4 py-6 text-center text-sm text-foreground/45">
        Movement appears after the second daily odds pull.
      </p>
    );
  }

  const seriesFor = (side: MatchSide) =>
    timestamps.map((t) => winner.find((p) => p.side === side && p.capturedAt === t)?.prob ?? null);

  const series = RESULT_LINES.map((line) => ({
    ...line,
    label: line.nameKind === "home" ? homeName : line.nameKind === "away" ? awayName : "Draw",
    vals: seriesFor(line.side),
  }));

  // Optional second row: the total-goals line, if the market has been priced.
  const totalGoals = points.filter((p) => p.market === "total_goals");
  const goalsLine = totalGoals[0]?.line ?? null;
  const goalsTimestamps = [...new Set(totalGoals.map((p) => p.capturedAt))].sort();
  const overVals =
    goalsLine !== null && goalsTimestamps.length >= 2
      ? goalsTimestamps.map((t) => totalGoals.find((p) => p.side === "over" && p.capturedAt === t)?.prob ?? null)
      : null;

  return (
    <div className="space-y-4">
      <div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Match result odds movement for ${homeName} vs ${awayName}`}
        >
          {/* Midline at 50% for a quick favourite/dog read. */}
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={yFor(0.5, H, PAD_Y)}
            y2={yFor(0.5, H, PAD_Y)}
            className="stroke-border"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          {series.map((s) => (
            <g key={s.side}>
              {pathFor(s.vals, H, PAD_Y, W, PAD_X).map((d, i) => (
                <path key={i} d={d} fill="none" className={s.stroke} strokeWidth={2} />
              ))}
              {s.vals.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={i}
                    cx={xFor(i, s.vals.length, W, PAD_X)}
                    cy={yFor(v, H, PAD_Y)}
                    r={2.5}
                    className={s.dot}
                  >
                    <title>
                      {s.label}: {Math.round(v * 100)}% ·{" "}
                      {new Date(timestamps[i]).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "America/Los_Angeles",
                      })}
                    </title>
                  </circle>
                ),
              )}
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs">
        {series.map((s) => {
          const last = lastValue(s.vals);
          return (
            <span key={s.side} className="flex items-center gap-1.5 font-semibold">
              <span aria-hidden className={`size-2 rounded-full ${s.dot}`} />
              <span className="truncate text-foreground/70">{s.label}</span>
              <span className="tabular-nums text-foreground">
                {last === null ? "—" : `${Math.round(last * 100)}%`}
              </span>
            </span>
          );
        })}
      </div>

      {overVals ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
            <span>Over {goalsLine} goals</span>
            <span className="tabular-nums text-foreground/70">
              {(() => {
                const last = lastValue(overVals);
                return last === null ? "—" : `${Math.round(last * 100)}%`;
              })()}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${W} ${MINI_H}`}
            className="w-full"
            role="img"
            aria-label={`Over ${goalsLine} goals odds movement`}
          >
            {pathFor(overVals, MINI_H, MINI_PAD_Y, W, PAD_X).map((d, i) => (
              <path key={i} d={d} fill="none" className="stroke-primary" strokeWidth={2} />
            ))}
            {overVals.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={xFor(i, overVals.length, W, PAD_X)} cy={yFor(v, MINI_H, MINI_PAD_Y)} r={2} className="fill-primary">
                  <title>
                    Over {goalsLine}: {Math.round(v * 100)}% ·{" "}
                    {new Date(goalsTimestamps[i]).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "America/Los_Angeles",
                    })}
                  </title>
                </circle>
              ),
            )}
          </svg>
        </div>
      ) : null}
    </div>
  );
}
