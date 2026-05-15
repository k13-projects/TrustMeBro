import type { Reasoning } from "@/lib/analysis/types";

export function ReasoningPanel({ reasoning }: { reasoning: Reasoning }) {
  if (!reasoning?.checks?.length) return null;
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 divide-y divide-white/5 text-xs overflow-hidden">
      {reasoning.checks.map((c, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 px-3 py-2"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              className={c.passed ? "text-emerald-400" : "text-foreground/30"}
              aria-hidden
            >
              {c.passed ? "✓" : "·"}
            </span>
            <span
              className={`truncate ${c.passed ? "text-foreground/85" : "text-foreground/50"}`}
            >
              {c.label}
            </span>
          </span>
          <span className="font-mono tabular-nums text-foreground/60 shrink-0">
            {c.value.toFixed(1)} vs {c.target}
          </span>
        </div>
      ))}
    </div>
  );
}
