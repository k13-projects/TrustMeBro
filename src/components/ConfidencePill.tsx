export function ConfidencePill({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const tone =
    s >= 90
      ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/30"
      : s >= 75
        ? "bg-amber-400/15 text-amber-300 border-amber-400/30"
        : "bg-white/5 text-foreground/60 border-white/10";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono tabular-nums ${tone}`}
    >
      {Math.round(s)}
    </span>
  );
}
