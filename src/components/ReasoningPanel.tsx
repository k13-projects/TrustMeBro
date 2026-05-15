import type { Reasoning } from "@/lib/analysis/types";
import { cx } from "@/lib/design/tokens";

export function ReasoningPanel({ reasoning }: { reasoning: Reasoning }) {
  const checks = reasoning?.checks ?? [];
  const signals = reasoning?.signals ?? [];

  if (checks.length === 0 && signals.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-black/20 p-3 text-xs text-foreground/55">
        No reasoning data captured for this pick yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {checks.length > 0 ? (
        <div className="rounded-xl border border-white/8 bg-black/20 divide-y divide-white/5 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-foreground/45 bg-white/3">
            Checks
          </div>
          {checks.map((c, i) => (
            <div
              key={`check-${i}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs"
            >
              <span
                className={cx(
                  c.passed ? "text-emerald-400" : "text-foreground/30",
                )}
                aria-hidden
              >
                {c.passed ? "✓" : "·"}
              </span>
              <span className="min-w-0">
                <div
                  className={cx(
                    "truncate",
                    c.passed ? "text-foreground/85" : "text-foreground/50",
                  )}
                >
                  {c.label}
                </div>
                <WeightBar weight={c.weight} passed={c.passed} />
              </span>
              <span className="font-mono tabular-nums text-foreground/60 shrink-0 text-right">
                {c.value.toFixed(1)}
                <span className="text-foreground/35"> vs </span>
                {c.target}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {signals.length > 0 ? (
        <div className="rounded-xl border border-white/8 bg-black/20 divide-y divide-white/5 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-foreground/45 bg-white/3">
            Off-court signals
          </div>
          {signals.map((s, i) => (
            <div
              key={`signal-${i}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs"
            >
              <SignalImpactDot impact={s.impact} />
              <span className="min-w-0">
                <div className="text-foreground/85 truncate">{s.note}</div>
                <div className="text-[10px] uppercase tracking-widest text-foreground/40 mt-0.5">
                  {s.source}
                </div>
              </span>
              <span className="font-mono tabular-nums text-foreground/60 shrink-0 text-right">
                {s.impact > 0 ? "+" : ""}
                {s.impact.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WeightBar({ weight, passed }: { weight: number; passed: boolean }) {
  const w = Math.max(0, Math.min(1, weight));
  const pct = Math.round(w * 100);
  return (
    <div
      className="mt-1 h-1 w-full rounded-full bg-white/5 overflow-hidden"
      role="progressbar"
      aria-label="Check weight"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx(
          "h-full rounded-full",
          passed ? "bg-emerald-400/60" : "bg-white/15",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SignalImpactDot({ impact }: { impact: number }) {
  const tone =
    impact > 0.15
      ? "bg-emerald-400"
      : impact < -0.15
        ? "bg-rose-400"
        : "bg-white/30";
  return <span aria-hidden className={cx("size-2 rounded-full", tone)} />;
}

// Public helper: returns the highest-weight passed check, or null if none.
// Useful for inline single-line summaries (e.g. PickRow collapsed state).
export function topReasoningCheck(reasoning: Reasoning) {
  const passed = (reasoning?.checks ?? []).filter((c) => c.passed);
  if (passed.length === 0) return null;
  return passed.reduce((best, c) => (c.weight > best.weight ? c : best));
}
