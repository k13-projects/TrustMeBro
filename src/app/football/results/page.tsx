import Link from "next/link";
import { z } from "zod";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { getSettledPicks, type SettledPickDetail } from "@/lib/sports/soccer/queries";
import {
  computeSettledRecords,
  groupStreaks,
  rowBadges,
  type SettledRecords,
  type StreakRun,
} from "@/lib/sports/soccer/results";
import { marketLabel, sideLabel } from "@/lib/sports/soccer/labels";
import { FilterBar } from "@/components/soccer/FilterBar";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { ResultsRow } from "@/components/soccer/ResultsRow";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const OUTCOMES: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "void", label: "Void" },
];

const MARKETS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "match_winner", label: marketLabel("match_winner") },
  { key: "total_goals", label: marketLabel("total_goals") },
];

const BANKOS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "banko", label: "Banko Only" },
];

const SORTS: Array<{ key: string; label: string }> = [
  { key: "recent", label: "Most Recent" },
  { key: "confidence", label: "Highest Confidence" },
  { key: "price", label: "Best Price" },
];

// Every param is forgiving — a hand-edited or stale URL falls back to the
// default view instead of a 500 (same house rule as the rest of /football).
const ParamsSchema = z.object({
  outcome: z.enum(["all", "won", "lost", "void"]).catch("all"),
  market: z.enum(["all", "match_winner", "total_goals"]).catch("all"),
  banko: z.enum(["all", "banko"]).catch("all"),
  sort: z.enum(["recent", "confidence", "price"]).catch("recent"),
  page: z.coerce.number().int().min(1).catch(1),
  highlight: z.string().trim().min(1).optional().catch(undefined),
});

type PageProps = {
  searchParams: Promise<{
    outcome?: string;
    market?: string;
    banko?: string;
    sort?: string;
    page?: string;
    highlight?: string;
  }>;
};

export default async function ResultsPage({ searchParams }: PageProps) {
  const [rawParams, competition] = await Promise.all([searchParams, activeCompetition()]);
  const parsed = ParamsSchema.parse(rawParams);
  const meta = COMPETITIONS[competition];

  const all = await getSettledPicks(competition);
  const byId = new Map(all.map((p) => [p.id, p]));
  const records = computeSettledRecords(all);

  let outcome = parsed.outcome;
  let market = parsed.market;
  let banko = parsed.banko;
  let sort = parsed.sort;
  let page = parsed.page;

  // A records-strip or streak link always lands on the unfiltered view so the
  // linked row is guaranteed to be on the page it jumps to.
  const highlight = parsed.highlight && byId.has(parsed.highlight) ? parsed.highlight : null;
  if (highlight) {
    outcome = "all";
    market = "all";
    banko = "all";
    sort = "recent";
  }

  const filtered = all.filter(
    (p) =>
      (outcome === "all" || p.status === outcome) &&
      (market === "all" || p.market === market) &&
      (banko === "all" || p.is_banko),
  );

  const sorted =
    sort === "confidence"
      ? [...filtered].sort((a, b) => b.confidence - a.confidence)
      : sort === "price"
        ? [...filtered].sort((a, b) => b.best_odds - a.best_odds)
        : filtered; // getSettledPicks already orders settled_at desc; filter() preserves it

  const isDefaultView =
    outcome === "all" && market === "all" && banko === "all" && sort === "recent";

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (highlight) {
    const idx = sorted.findIndex((p) => p.id === highlight);
    page = idx >= 0 ? Math.floor(idx / PAGE_SIZE) + 1 : 1;
  }
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const pageItems = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  // Streak dividers only mean anything against the true settled_at order, so
  // they only ever appear on the plain, unfiltered, most-recent-first view —
  // any other sort or filter would make "3 consecutive" a lie.
  const runs: StreakRun[] = isDefaultView ? groupStreaks(all) : [];
  const dividerBefore = new Map<string, StreakRun>();
  for (let i = 1; i < runs.length; i++) {
    const r = runs[i];
    if (r.length >= 3 && r.status !== "void") dividerBefore.set(r.ids[0], r);
  }
  const openStreak =
    isDefaultView && clampedPage === 1 && runs[0] && runs[0].length >= 3 && runs[0].status !== "void"
      ? runs[0]
      : null;

  const baseParams = { outcome, market, banko, sort };
  const summary =
    `${sorted.length} of ${all.length} settled picks` +
    (outcome !== "all" ? ` · ${outcome}` : "") +
    (market !== "all" ? ` · ${marketLabel(market as "match_winner" | "total_goals")}` : "") +
    (banko !== "all" ? " · banko only" : "") +
    ` · sorted by ${SORTS.find((s) => s.key === sort)?.label.toLowerCase()}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <FootballHeader title="Results" competition={competition} />
        <p className="mt-2 text-sm text-foreground/55">
          {meta.status === "archived"
            ? `Every graded pick from the ${meta.fullName}, exactly as it settled.`
            : `Every ${meta.label} pick the engine has graded — what it called, at what price, and why.`}
        </p>
      </div>

      {all.length === 0 ? (
        <EmptyState competitionLabel={meta.label} noOddsSource={meta.oddsKey === null} />
      ) : (
        <>
          <RecordsStrip records={records} byId={byId} />

          <FilterBar
            base="/football/results"
            params={baseParams}
            groups={[
              { param: "outcome", label: "Outcome", active: outcome, options: OUTCOMES },
              { param: "market", label: "Market", active: market, options: MARKETS },
              { param: "banko", label: "Banko", active: banko, options: BANKOS },
              { param: "sort", label: "Sort by", active: sort, options: SORTS },
            ]}
            summary={summary}
          />

          {sorted.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
              No settled picks match these filters.
            </p>
          ) : (
            <>
              {openStreak ? (
                <StreakDivider status={openStreak.status as "won" | "lost"} length={openStreak.length} current />
              ) : null}
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                {pageItems.map((pick) => {
                  const divider = dividerBefore.get(pick.id);
                  return (
                    <div key={pick.id}>
                      {divider ? (
                        <StreakDivider status={divider.status as "won" | "lost"} length={divider.length} />
                      ) : null}
                      <ResultsRow
                        pick={pick}
                        badges={rowBadges(pick, records)}
                        highlighted={pick.id === highlight}
                      />
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 ? (
                <Pagination base="/football/results" params={baseParams} page={clampedPage} totalPages={totalPages} />
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

function RecordsStrip({
  records,
  byId,
}: {
  records: SettledRecords;
  byId: Map<string, SettledPickDetail>;
}) {
  const chips: Array<{ key: string; icon: string; label: string; value: string; href: string }> = [];

  if (records.bestPriceWonId) {
    const p = byId.get(records.bestPriceWonId)!;
    chips.push({
      key: "best-price",
      icon: "🎯",
      label: "Best price won",
      value: `${sideLabel(p.market, p.side, p.line, p.home, p.away)} @ ${p.best_odds.toFixed(2)}`,
      href: `/football/results?highlight=${p.id}`,
    });
  }
  if (records.biggestUpsetWonId) {
    const p = byId.get(records.biggestUpsetWonId)!;
    chips.push({
      key: "upset",
      icon: "⚡",
      label: "Biggest upset",
      value: `${sideLabel(p.market, p.side, p.line, p.home, p.away)} at ${Math.round(p.probability * 100)}%`,
      href: `/football/results?highlight=${p.id}`,
    });
  }
  if (records.bestStreak) {
    const p = byId.get(records.bestStreak.lastId)!;
    chips.push({
      key: "streak",
      icon: "🔥",
      label: "Best streak",
      value: `${records.bestStreak.length} wins in a row`,
      href: `/football/results?highlight=${p.id}`,
    });
  }
  if (records.bankoRecord) {
    const { won, lost } = records.bankoRecord;
    const decisive = won + lost;
    const pct = decisive > 0 ? Math.round((won / decisive) * 100) : null;
    chips.push({
      key: "banko",
      icon: "★",
      label: "Banko record",
      value: `${won}–${lost}${pct !== null ? ` (${pct}%)` : ""}`,
      // Not one row — the whole banko ledger — so this links to the filtered
      // list rather than a single ?highlight row.
      href: "/football/results?banko=banko",
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          scroll={false}
          className="rounded-2xl border border-border/60 bg-card/40 px-3 py-3 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
            <span aria-hidden>{c.icon}</span> {c.label}
          </div>
          <div className="mt-1 truncate text-sm font-bold">{c.value}</div>
        </Link>
      ))}
    </div>
  );
}

function StreakDivider({
  status,
  length,
  current = false,
}: {
  status: "won" | "lost";
  length: number;
  current?: boolean;
}) {
  const won = status === "won";
  return (
    <div
      role="separator"
      className="flex items-center gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em]"
    >
      <span className="h-px flex-1 bg-border/40" aria-hidden />
      <span className={won ? "text-primary" : "text-rose-400/70"}>
        {won ? "🔥 " : ""}
        {current ? "On a " : ""}
        {length}-{won ? "Win" : "Loss"} Streak
      </span>
      <span className="h-px flex-1 bg-border/40" aria-hidden />
    </div>
  );
}

function EmptyState({
  competitionLabel,
  noOddsSource,
}: {
  competitionLabel: string;
  noOddsSource: boolean;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border/60 bg-card/20 px-6 py-14 text-center">
      <p className="text-sm font-semibold text-foreground/70">
        No settled picks yet for {competitionLabel}.
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-foreground/45">
        {noOddsSource
          ? "No bookmaker odds for this competition yet — the engine needs a priced market to make a pick."
          : "The engine grades a pick right after its match finishes — check back after the first matchday, or see what it's calling right now."}
      </p>
      <Link
        href="/football/picks"
        className="mt-5 inline-block rounded-full bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground hover:bg-primary-hover"
      >
        See pending picks →
      </Link>
    </div>
  );
}

function Pagination({
  base,
  params,
  page,
  totalPages,
}: {
  base: string;
  params: Record<string, string>;
  page: number;
  totalPages: number;
}) {
  const href = (p: number) => {
    const next: Record<string, string> = { ...params, page: String(p) };
    const qs = Object.entries(next)
      .filter(([k, v]) => v && v !== "all" && !(k === "page" && p === 1))
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return qs ? `${base}?${qs}` : base;
  };
  return (
    <div className="flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} scroll={false} className="font-semibold text-primary hover:text-primary-hover">
          ← Prev
        </Link>
      ) : (
        <span aria-hidden />
      )}
      <span className="text-foreground/45">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} scroll={false} className="font-semibold text-primary hover:text-primary-hover">
          Next →
        </Link>
      ) : (
        <span aria-hidden />
      )}
    </div>
  );
}
