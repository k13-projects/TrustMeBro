import { STAT_COLORS } from "./StatColor";
import { marketLabel } from "./MarketLabel";
import type { PlayerFeatures, PropMarket } from "@/lib/analysis/types";

type Props = {
  features: PlayerFeatures;
  market: PropMarket;
  last5Values: number[];
  prevValue: number | null;
  prev2Value: number | null;
  anomaly: { z: number; mean: number; value: number } | null;
};

export function StatComparisonCard({
  features,
  market,
  last5Values,
  prevValue,
  prev2Value,
  anomaly,
}: Props) {
  const max = computeDomainMax({
    season: features.season.mean,
    l10: features.last10.mean,
    prev: prevValue,
    prev2: prev2Value,
    last5: last5Values,
  });

  return (
    <article className="relative glass glass-sheen rounded-2xl p-4 sm:p-5 space-y-4 overflow-hidden">
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-semibold tracking-tight text-base">
          {marketLabel(market)}
        </h3>
        {anomaly ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            title={`Last game (${anomaly.value.toFixed(1)}) is ${anomaly.z.toFixed(1)}σ from L10 mean (${anomaly.mean.toFixed(1)})`}
          >
            <span aria-hidden>⚠</span>
            Anomaly
          </span>
        ) : null}
      </header>

      <div className="space-y-2">
        <Bar
          color="season"
          value={features.season.mean}
          max={max}
          show={features.season.count > 0}
        />
        <Bar
          color="prev2"
          value={prev2Value}
          max={max}
          show={prev2Value !== null}
        />
        <Bar
          color="prev"
          value={prevValue}
          max={max}
          show={prevValue !== null}
        />
        <Bar
          color="l10"
          value={features.last10.mean}
          max={max}
          show={features.last10.count > 0}
        />
      </div>

      <div className="pt-2 border-t border-white/8">
        <div className="text-[10px] uppercase tracking-widest text-foreground/45 mb-2">
          Last 5
        </div>
        <Last5Chips values={last5Values} />
      </div>
    </article>
  );
}

function Bar({
  color,
  value,
  max,
  show,
}: {
  color: keyof typeof STAT_COLORS;
  value: number | null;
  max: number;
  show: boolean;
}) {
  const token = STAT_COLORS[color];
  if (!show || value === null) {
    return (
      <div className="flex items-center gap-3 text-[11px]">
        <span className={`w-28 shrink-0 ${token.fg}`}>{token.label}</span>
        <span className="flex-1 h-1.5 rounded-full bg-white/4" />
        <span className="w-10 text-right font-mono tabular-nums text-foreground/35">
          —
        </span>
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className={`w-28 shrink-0 ${token.fg}`}>{token.label}</span>
      <span className="relative flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${token.bar}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span
        className={`w-10 text-right font-mono tabular-nums ${token.fg}`}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function Last5Chips({ values }: { values: number[] }) {
  if (values.length === 0) {
    return (
      <div className="text-xs text-foreground/40 font-mono">No data</div>
    );
  }
  // values are ordered most-recent-first. Render oldest → newest left to right.
  const ordered = [...values].reverse();
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {ordered.map((v, i) => {
        const prev = i > 0 ? ordered[i - 1] : null;
        const delta = prev !== null ? v - prev : 0;
        const arrow =
          prev === null
            ? null
            : delta > 0
              ? { glyph: "▲", cls: "text-emerald-400" }
              : delta < 0
                ? { glyph: "▼", cls: "text-rose-400" }
                : { glyph: "·", cls: "text-foreground/35" };
        return (
          <div key={i} className="flex items-center gap-1.5">
            {arrow ? (
              <span className={`text-[10px] ${arrow.cls}`} aria-hidden>
                {arrow.glyph}
              </span>
            ) : null}
            <span className="rounded-lg bg-white/6 border border-white/10 w-11 h-9 grid place-items-center font-mono tabular-nums text-sm">
              {v.toFixed(0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function computeDomainMax({
  season,
  l10,
  prev,
  prev2,
  last5,
}: {
  season: number;
  l10: number;
  prev: number | null;
  prev2: number | null;
  last5: number[];
}): number {
  const candidates = [season, l10, ...last5];
  if (prev !== null) candidates.push(prev);
  if (prev2 !== null) candidates.push(prev2);
  const max = Math.max(...candidates, 1);
  return max * 1.1;
}
