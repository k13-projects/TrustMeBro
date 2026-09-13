import Link from "next/link";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { getMatchesBetween, type MatchRow } from "@/lib/sports/soccer/queries";
import { getSoccerRates } from "@/lib/sports/soccer/rates";
import { sideLabel } from "@/lib/sports/soccer/labels";
import type { SoccerMarket } from "@/lib/sports/types";
import { MatchBanner } from "@/components/soccer/MatchBanner";
import { FootballHeader } from "@/components/soccer/FootballHeader";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ market?: string }> };

type ValueRow = {
  match: MatchRow;
  market: SoccerMarket;
  label: string;
  prob: number;
  bestOdds: number;
  implied: number;
  edge: number;
  ev: number;
};

const FILTERS: Array<{ key: string; label: string; market: SoccerMarket | null }> = [
  { key: "all", label: "All", market: null },
  { key: "match_winner", label: "Match Result", market: "match_winner" },
  { key: "total_goals", label: "Total Goals", market: "total_goals" },
];

export default async function ValuePage({ searchParams }: PageProps) {
  const [{ market }, competition] = await Promise.all([
    searchParams,
    activeCompetition(),
  ]);
  const active = FILTERS.find((f) => f.key === market) ?? FILTERS[0];

  const today = todayIsoDate();
  const matches = await getMatchesBetween(competition, today, isoDateOffset(today, 8));
  const rates = await getSoccerRates(matches.map((m) => m.id));
  const byId = new Map(matches.map((m) => [m.id, m]));

  const rows: ValueRow[] = [];
  // A 4% long shot at an exchange's 60.00 is "value" on paper and noise in
  // practice, so outcomes we rate below 15% don't make the board. Only
  // matches still to kick off count — a live or finished price isn't a bet.
  const MIN_PROB = 0.15;
  for (const [matchId, markets] of rates) {
    const match = byId.get(matchId);
    if (!match || match.state !== "pre") continue;
    for (const mk of markets) {
      for (const o of mk.outcomes) {
        if (!o.bestOdds || o.prob < MIN_PROB) continue;
        const implied = 1 / o.bestOdds;
        rows.push({
          match,
          market: mk.market,
          label: sideLabel(mk.market, o.side, mk.line, match.home.name, match.away.name),
          prob: o.prob,
          bestOdds: o.bestOdds,
          implied,
          edge: o.prob - implied,
          ev: o.prob * o.bestOdds - 1,
        });
      }
    }
  }

  const filtered = active.market ? rows.filter((r) => r.market === active.market) : rows;
  const ranked = [...filtered].sort((a, b) => b.edge - a.edge).slice(0, 20);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <FootballHeader title="Best Value" competition={competition} />
        <p className="mt-2 text-sm text-foreground/55">
          &quot;Value&quot; is when our de-vigged probability beats what the best
          price implies — the market may be underpricing that outcome. It does{" "}
          <span className="text-foreground/80">not</span> mean the pick is
          likely to win, only that it looks under-priced at the price on offer.
          Outcomes we rate under 15% are left off so a freak exchange price on a
          long shot can&apos;t top the board.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const href = f.key === "all" ? "/football/value" : `/football/value?market=${f.key}`;
          const isActive = active.key === f.key;
          return (
            <Link
              key={f.key}
              href={href}
              className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ring-1 transition-colors ${
                isActive
                  ? "bg-primary text-black ring-primary"
                  : "bg-foreground/5 text-foreground/85 ring-border hover:bg-foreground/10"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {ranked.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
          Prices load in the days before a matchday.
        </p>
      ) : (
        <div className="space-y-3">
          {ranked.map((r, i) => (
            <ValueRowCard key={`${r.match.id}:${r.market}:${r.label}:${i}`} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ValueRowCard({ row }: { row: ValueRow }) {
  const edgePts = Math.round(row.edge * 1000) / 10;
  const strong = edgePts >= 2;
  const evPositive = row.ev >= 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <MatchBanner
        size="sm"
        competition={row.match.competition}
        home={row.match.home}
        away={row.match.away}
        state={row.match.state}
        clock={row.match.clock}
        datetime={row.match.datetime}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold">{row.label}</div>
          <div className="mt-0.5 text-[11px] text-foreground/45">
            {Math.round(row.prob * 100)}% our odds · {row.bestOdds.toFixed(2)} price ·{" "}
            {Math.round(row.implied * 100)}% implied
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div
              className={`text-lg font-black tabular-nums ${strong ? "text-emerald-400" : "text-foreground"}`}
            >
              {edgePts > 0 ? "+" : ""}
              {edgePts.toFixed(1)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-foreground/40">Edge</div>
          </div>
          <div className="text-right">
            <div
              className={`text-sm font-bold tabular-nums ${evPositive ? "text-emerald-400" : "text-rose-400"}`}
            >
              {evPositive ? "+" : ""}
              {Math.round(row.ev * 100)}%
            </div>
            <div className="text-[10px] uppercase tracking-wide text-foreground/40">EV</div>
          </div>
        </div>
      </div>
    </div>
  );
}
