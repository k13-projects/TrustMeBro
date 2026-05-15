export function ConfidenceRing({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const color =
    s >= 90
      ? "rgb(52 211 153)"
      : s >= 75
        ? "rgb(251 191 36)"
        : "rgb(148 163 184)";
  return (
    <div className="relative shrink-0" style={{ width: 84, height: 84 }}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2.5"
        />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${s}, 100`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <div className="text-xl font-semibold tabular-nums">{Math.round(s)}</div>
          <div className="text-[9px] uppercase tracking-widest text-foreground/50 mt-1">
            Confidence
          </div>
        </div>
      </div>
    </div>
  );
}
