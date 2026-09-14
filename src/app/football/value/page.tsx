import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { getMatchesBetween, type MatchRow } from "@/lib/sports/soccer/queries";
import { getSoccerRates } from "@/lib/sports/soccer/rates";
import { sideLabel } from "@/lib/sports/soccer/labels";
import type { SoccerMarket } from "@/lib/sports/types";
import { MatchBanner } from "@/components/soccer/MatchBanner";
import { FilterBar } from "@/components/soccer/FilterBar";
import { Term } from "@/components/soccer/Term";
import { FootballHeader } from "@/components/soccer/FootballHeader";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ market?: string; sort?: string; edge?: string }>;
};

const SORTS = [
  { key: "edge", label: "Edge" },
  { key: "ev", label: "EV" },
  { key: "kickoff", label: "Kickoff" },
];

const EDGE_FLOORS = [
  { key: "all", label: "Any", min: -Infinity },
  { key: "1", label: "+1 pt", min: 0.01 },
  { key: "2", label: "+2 pts", min: 0.02 },
  { key: "3", label: "+3 pts", min: 0.03 },
];

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
  const [{ market, sort, edge }, competition] = await Promise.all([
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

  const sortKey = SORTS.find((s) => s.key === sort)?.key ?? "edge";
  const floor = EDGE_FLOORS.find((f) => f.key === edge) ?? EDGE_FLOORS[0];

  const filtered = rows
    .filter((r) => (active.market ? r.market === active.market : true))
    .filter((r) => r.edge >= floor.min);
  const ranked = [...filtered]
    .sort((a, b) => {
      if (sortKey === "ev") return b.ev - a.ev;
      if (sortKey === "kickoff") {
        return (a.match.datetime ?? "").localeCompare(b.match.datetime ?? "");
      }
      return b.edge - a.edge;
    })
    .slice(0, 20);

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
          long shot can&apos;t top the board.{" "}
          <a href="/football/glossary" className="font-semibold text-primary">
            How to read this
          </a>
          .
        </p>
      </div>

      <FilterBar
        base="/football/value"
        params={{ market: active.key, sort: sortKey, edge: floor.key }}
        groups={[
          {
            param: "market",
            label: "Market",
            active: active.key,
            options: FILTERS.map((f) => ({ key: f.key, label: f.label })),
          },
          { param: "sort", label: "Sort by", active: sortKey, options: SORTS },
          {
            param: "edge",
            label: "Min edge",
            active: floor.key,
            options: EDGE_FLOORS.map((f) => ({ key: f.key, label: f.label })),
          },
        ]}
        summary={`${ranked.length} of ${rows.length} priced outcomes${
          active.market ? ` · ${active.label.toLowerCase()}` : ""
        }${floor.min > 0 ? ` · edge ${floor.label} or better` : ""} · sorted by ${
          SORTS.find((s) => s.key === sortKey)?.label.toLowerCase() ?? "edge"
        }`}
      />

      {ranked.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
          {rows.length === 0
            ? "Prices load in the days before a matchday."
            : "No outcome clears those filters. Loosen the minimum edge or pick another market."}
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
            <div className="text-[10px] uppercase tracking-wide text-foreground/40">
              <Term k="edge">Edge</Term>
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-sm font-bold tabular-nums ${evPositive ? "text-emerald-400" : "text-rose-400"}`}
            >
              {evPositive ? "+" : ""}
              {Math.round(row.ev * 100)}%
            </div>
            <div className="text-[10px] uppercase tracking-wide text-foreground/40">
              <Term k="ev">EV</Term>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
