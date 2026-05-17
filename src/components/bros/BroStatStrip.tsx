import type { BroStatRow } from "@/lib/bros/types";

// Top-of-profile stat card. Pulls from bro_stats matview; renders even when
// stats is null (new bro, no shared coupons yet).
export function BroStatStrip({ stats }: { stats: BroStatRow | null }) {
  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const voids = stats?.voids ?? 0;
  const pending = stats?.pending ?? 0;
  const settled = stats?.settled ?? 0;
  const net = Number(stats?.net_units ?? 0);
  const score = Number(stats?.score ?? 0);
  const winRate = settled > 0 ? Math.round((wins / settled) * 100) : null;

  const netTone =
    net > 0
      ? "text-emerald-300"
      : net < 0
        ? "text-rose-300"
        : "text-foreground/65";

  const scoreTone =
    score > 0
      ? "text-emerald-300"
      : score < 0
        ? "text-rose-300"
        : "text-foreground/65";
  const scoreSign = score > 0 ? "+" : score < 0 ? "" : "";

  return (
    <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Stat
        label="Score"
        value={
          <span className={`font-mono tabular-nums ${scoreTone}`}>
            {scoreSign}
            {score.toFixed(0)}
          </span>
        }
        sub="hits − misses across legs"
        emphasised
      />
      <Stat
        label="Record"
        value={`${wins}–${losses}${voids > 0 ? `–${voids}` : ""}`}
        sub={pending > 0 ? `${pending} pending` : "settled coupons"}
      />
      <Stat
        label="Net units"
        value={
          <span className={`font-mono tabular-nums ${netTone}`}>
            {net > 0 ? "+" : ""}
            {net.toFixed(2)}
          </span>
        }
        sub="profit / loss"
      />
      <Stat
        label="Win rate"
        value={
          winRate === null ? (
            <span className="text-foreground/45">—</span>
          ) : (
            <span
              className={
                winRate >= 50 ? "text-emerald-300" : "text-foreground/85"
              }
            >
              {winRate}%
            </span>
          )
        }
        sub={settled === 0 ? "no settled coupons" : `${settled} settled`}
      />
      <Stat
        label="Last win"
        value={
          stats?.last_win_at ? (
            <span className="text-sm font-mono tabular-nums">
              {relativeShort(stats.last_win_at)}
            </span>
          ) : (
            <span className="text-foreground/45">—</span>
          )
        }
        sub="most recent W"
      />
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  emphasised,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  emphasised?: boolean;
}) {
  return (
    <div
      className={
        emphasised
          ? "glass rounded-2xl px-4 py-3 space-y-0.5 ring-1 ring-primary/25 col-span-2 sm:col-span-1"
          : "glass rounded-2xl px-4 py-3 space-y-0.5"
      }
    >
      <div className="text-[10px] uppercase tracking-widest text-foreground/45">
        {label}
      </div>
      <div className="text-2xl font-semibold font-mono tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-foreground/50">{sub}</div>
    </div>
  );
}

function relativeShort(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
