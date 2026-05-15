import type { PlayerGameStatLine } from "@/lib/analysis/types";

type Props = {
  history: PlayerGameStatLine[];
  variant?: "compact" | "full";
};

type Averages = {
  pts: number;
  reb: number;
  ast: number;
  pra: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number | null;
  fg2m: number;
  fg2a: number;
  fg2Pct: number | null;
  games: number;
};

function mean(values: Array<number | null>): number {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return 0;
  return present.reduce((s, v) => s + v, 0) / present.length;
}

function pct(num: number, den: number): number | null {
  if (den === 0) return null;
  return num / den;
}

export function computeAverages(history: PlayerGameStatLine[]): Averages {
  const played = history.filter((h) => (h.minutes ?? 0) > 0);
  const pts = mean(played.map((h) => h.points));
  const reb = mean(played.map((h) => h.rebounds));
  const ast = mean(played.map((h) => h.assists));
  const pra = pts + reb + ast;
  const fg3m = mean(played.map((h) => h.fg3m));
  const fg3a = mean(played.map((h) => h.fg3a));
  const fgm = mean(played.map((h) => h.fgm));
  const fga = mean(played.map((h) => h.fga));
  const fg2m = Math.max(0, fgm - fg3m);
  const fg2a = Math.max(0, fga - fg3a);
  return {
    pts,
    reb,
    ast,
    pra,
    fg3m,
    fg3a,
    fg3Pct: pct(fg3m, fg3a),
    fg2m,
    fg2a,
    fg2Pct: pct(fg2m, fg2a),
    games: played.length,
  };
}

export function SeasonStatsBlock({ history, variant = "full" }: Props) {
  const avg = computeAverages(history);
  if (avg.games === 0) {
    return (
      <div className="text-[10px] uppercase tracking-widest text-foreground/35">
        No box scores yet
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="space-y-1 text-[11px]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono tabular-nums">
          <StatInline label="PTS" value={avg.pts.toFixed(1)} />
          <StatInline label="REB" value={avg.reb.toFixed(1)} />
          <StatInline label="AST" value={avg.ast.toFixed(1)} />
          <StatInline
            label="PRA"
            value={avg.pra.toFixed(1)}
            highlight
          />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono tabular-nums text-foreground/55">
          <span>
            3PT {avg.fg3m.toFixed(1)}/{avg.fg3a.toFixed(1)}
            {avg.fg3Pct !== null ? (
              <span className="text-foreground/40">
                {" "}
                ({(avg.fg3Pct * 100).toFixed(0)}%)
              </span>
            ) : null}
          </span>
          <span>
            2PT {avg.fg2m.toFixed(1)}/{avg.fg2a.toFixed(1)}
            {avg.fg2Pct !== null ? (
              <span className="text-foreground/40">
                {" "}
                ({(avg.fg2Pct * 100).toFixed(0)}%)
              </span>
            ) : null}
          </span>
        </div>
      </div>
    );
  }

  return (
    <section className="glass rounded-2xl p-4 sm:p-5 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.22em] text-foreground/55">
          Season averages
        </h3>
        <span className="text-[10px] text-foreground/45 font-mono">
          {avg.games} games
        </span>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <BigStat label="PTS" value={avg.pts.toFixed(1)} />
        <BigStat label="REB" value={avg.reb.toFixed(1)} />
        <BigStat label="AST" value={avg.ast.toFixed(1)} />
        <BigStat label="PRA" value={avg.pra.toFixed(1)} highlight />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <ShootingRow
          label="3-Point"
          made={avg.fg3m}
          attempted={avg.fg3a}
          pct={avg.fg3Pct}
        />
        <ShootingRow
          label="2-Point"
          made={avg.fg2m}
          attempted={avg.fg2a}
          pct={avg.fg2Pct}
        />
      </div>
    </section>
  );
}

function StatInline({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span className={highlight ? "text-emerald-300" : "text-foreground/85"}>
      <span className="text-foreground/45">{label} </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function BigStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        highlight
          ? "border-emerald-400/30 bg-emerald-400/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-foreground/55">
        {label}
      </div>
      <div
        className={`font-mono tabular-nums text-2xl font-semibold ${
          highlight ? "text-emerald-300" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ShootingRow({
  label,
  made,
  attempted,
  pct,
}: {
  label: string;
  made: number;
  attempted: number;
  pct: number | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <span className="text-[11px] uppercase tracking-widest text-foreground/55">
        {label}
      </span>
      <span className="font-mono tabular-nums">
        <span className="text-foreground/85">
          {made.toFixed(1)} / {attempted.toFixed(1)}
        </span>
        {pct !== null ? (
          <span className="ml-2 text-foreground/45">
            {(pct * 100).toFixed(0)}%
          </span>
        ) : null}
      </span>
    </div>
  );
}
