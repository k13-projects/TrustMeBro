"use client";

import { useMemo, useRef, useState } from "react";
import { cx } from "@/lib/design/tokens";

export type ScorePoint = {
  scoreAfter: number;
  delta: number;
  outcome: "won" | "lost" | "void";
  recordedAt: string;
};

const W = 720;
const H = 220;
const P = 16;

export function ScoreChart({ points: data }: { points: ScorePoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const layout = useMemo(() => {
    const values = data.map((d) => d.scoreAfter);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const range = max - min || 1;
    const stepX = (W - P * 2) / Math.max(1, values.length - 1);
    const yFor = (v: number) => H - P - ((v - min) / range) * (H - P * 2);
    const xy = values.map((v, i) => ({ x: P + i * stepX, y: yFor(v) }));
    return { min, max, range, stepX, yFor, xy };
  }, [data]);

  if (data.length < 2) return null;

  const linePath = layout.xy
    .map(({ x, y }, i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");
  const last = layout.xy[layout.xy.length - 1];
  const areaPath = `${linePath} L ${last.x} ${H - P} L ${P} ${H - P} Z`;
  const zeroY = layout.yFor(0);
  const finalTone = data[data.length - 1].scoreAfter >= 0 ? "emerald" : "rose";

  function handleMove(evt: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Translate client x to SVG user-space x (viewBox is 0..W).
    const ratio = W / rect.width;
    const xInSvg = (evt.clientX - rect.left) * ratio;
    let nearest = 0;
    let bestD = Infinity;
    for (let i = 0; i < layout.xy.length; i++) {
      const d = Math.abs(layout.xy[i].x - xInSvg);
      if (d < bestD) {
        bestD = d;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  }

  const hover = hoverIndex !== null ? data[hoverIndex] : null;
  const hoverPos = hoverIndex !== null ? layout.xy[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`Score history over ${data.length} settlements`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="score-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(52 211 153)" />
            <stop
              offset={`${((layout.max - 0) / layout.range) * 100}%`}
              stopColor="rgb(52 211 153)"
            />
            <stop
              offset={`${((layout.max - 0) / layout.range) * 100}%`}
              stopColor="rgb(244 63 94)"
            />
            <stop offset="100%" stopColor="rgb(244 63 94)" />
          </linearGradient>
          <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={P}
          y1={zeroY}
          x2={W - P}
          y2={zeroY}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="3 5"
          strokeWidth="1"
        />
        <path d={areaPath} fill="url(#score-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#score-stroke)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hoverPos ? (
          <>
            <line
              x1={hoverPos.x}
              y1={P}
              x2={hoverPos.x}
              y2={H - P}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
            />
            <circle
              cx={hoverPos.x}
              cy={hoverPos.y}
              r="5"
              fill={hover && hover.scoreAfter >= 0 ? "rgb(52 211 153)" : "rgb(244 63 94)"}
              stroke="rgba(5,5,8,0.9)"
              strokeWidth="2"
            />
          </>
        ) : (
          <circle
            cx={last.x}
            cy={last.y}
            r="4"
            fill={finalTone === "emerald" ? "rgb(52 211 153)" : "rgb(244 63 94)"}
          />
        )}
        <text
          x={W - P}
          y={P + 4}
          textAnchor="end"
          className="text-[10px]"
          fill="rgba(255,255,255,0.55)"
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {layout.max.toFixed(1)}
        </text>
        <text
          x={W - P}
          y={H - P + 12}
          textAnchor="end"
          className="text-[10px]"
          fill="rgba(255,255,255,0.55)"
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {layout.min.toFixed(1)}
        </text>
      </svg>

      {hover && hoverPos ? (
        <HoverCard point={hover} relativeX={hoverPos.x / W} />
      ) : null}
    </div>
  );
}

function HoverCard({
  point,
  relativeX,
}: {
  point: ScorePoint;
  relativeX: number;
}) {
  // Pin to left when cursor is in the right half, and vice versa, so the card
  // doesn't drift off-screen.
  const anchorRight = relativeX > 0.6;
  const tone =
    point.outcome === "won"
      ? "text-emerald-300"
      : point.outcome === "lost"
        ? "text-rose-300"
        : "text-foreground/60";
  return (
    <div
      className={cx(
        "pointer-events-none absolute top-2 glass-strong rounded-xl px-3 py-2 text-xs space-y-1 min-w-[160px]",
        anchorRight ? "right-2" : "left-2",
      )}
      aria-hidden
    >
      <div className="font-mono tabular-nums text-foreground/55">
        {new Date(point.recordedAt).toLocaleString()}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className={cx("uppercase tracking-wider text-[10px]", tone)}>
          {point.outcome}
        </span>
        <span className="font-mono tabular-nums">
          {point.delta > 0 ? `+${point.delta.toFixed(1)}` : point.delta.toFixed(1)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/8">
        <span className="text-foreground/55">Score</span>
        <span
          className={cx(
            "font-mono tabular-nums text-sm font-semibold",
            point.scoreAfter >= 0 ? "text-emerald-200" : "text-rose-200",
          )}
        >
          {point.scoreAfter.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
