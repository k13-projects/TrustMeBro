import { cx } from "@/lib/design/tokens";

type Props = {
  score: number;
  // showRing pairs a small inline gauge with the number — matches ConfidenceRing's
  // visual language at list density. Default true so list rows feel cohesive with
  // the Bet of the Day hero.
  showRing?: boolean;
};

export function ConfidencePill({ score, showRing = true }: Props) {
  const s = Math.max(0, Math.min(100, score));
  const tone =
    s >= 90
      ? {
          chip: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
          stroke: "rgb(52 211 153)",
        }
      : s >= 75
        ? {
            chip: "bg-amber-400/15 text-amber-300 border-amber-400/30",
            stroke: "rgb(251 191 36)",
          }
        : {
            chip: "bg-white/5 text-foreground/65 border-white/10",
            stroke: "rgb(148 163 184)",
          };

  return (
    <span
      role="img"
      aria-label={`Confidence ${Math.round(s)} out of 100`}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-mono tabular-nums",
        tone.chip,
      )}
    >
      {showRing ? <MiniRing score={s} stroke={tone.stroke} /> : null}
      {Math.round(s)}
    </span>
  );
}

function MiniRing({ score, stroke }: { score: number; stroke: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 36 36"
      className="size-3.5 -rotate-90 shrink-0"
    >
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="5"
      />
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${score}, 100`}
      />
    </svg>
  );
}
