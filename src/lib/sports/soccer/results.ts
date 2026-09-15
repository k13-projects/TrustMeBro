import type { SettledPickDetail } from "./queries";

// Pure helpers for /football/results — the badges and streak dividers Kazim
// asked for. Every rule here is documented against the exact field it reads
// (docs/handoffs/engine-history-design_2026-09-14.md §4) so a badge is never
// shown unless it is actually true. No DB, no fetch — inputs are injected.

export type SettledRecords = {
  /** Won pick with the single highest best_odds across the whole competition. */
  bestPriceWonId: string | null;
  /** Won pick with the single lowest probability — the biggest underdog that hit. */
  biggestUpsetWonId: string | null;
  /** Longest run of consecutive wins anywhere in the competition's history. */
  bestStreak: { length: number; lastId: string } | null;
  /** Only present once at least one banko pick has settled. */
  bankoRecord: { won: number; lost: number; void: number } | null;
};

// `all` is the full unfiltered, settled_at-desc history for the competition —
// records are always computed against everything ever graded, never just the
// current filtered/paginated view (design §4).
export function computeSettledRecords(all: SettledPickDetail[]): SettledRecords {
  let bestPriceWonId: string | null = null;
  let bestPriceOdds = -Infinity;
  let biggestUpsetWonId: string | null = null;
  let biggestUpsetProb = Infinity;
  let banko: { won: number; lost: number; void: number } | null = null;

  for (const p of all) {
    if (p.status === "won" && p.best_odds > bestPriceOdds) {
      bestPriceOdds = p.best_odds;
      bestPriceWonId = p.id;
    }
    if (p.status === "won" && p.probability < biggestUpsetProb) {
      biggestUpsetProb = p.probability;
      biggestUpsetWonId = p.id;
    }
    if (p.is_banko) {
      banko ??= { won: 0, lost: 0, void: 0 };
      if (p.status === "won") banko.won += 1;
      else if (p.status === "lost") banko.lost += 1;
      else banko.void += 1;
    }
  }

  // Longest run of consecutive wins, walked oldest-first so "consecutive"
  // means consecutive in time, not in however the array happened to sort.
  let bestStreak: { length: number; lastId: string } | null = null;
  let run = 0;
  let runLastId: string | null = null;
  for (let i = all.length - 1; i >= 0; i--) {
    const p = all[i];
    if (p.status === "won") {
      run += 1;
      runLastId = p.id;
    } else {
      run = 0;
      runLastId = null;
    }
    if (run >= 3 && (bestStreak === null || run > bestStreak.length) && runLastId) {
      bestStreak = { length: run, lastId: runLastId };
    }
  }

  return { bestPriceWonId, biggestUpsetWonId, bestStreak, bankoRecord: banko };
}

export type RowBadge = "banko" | "upset" | "best-price";

// Deliberately conservative thresholds (design §4) — a badge that fires on
// most rows stops meaning anything.
//
// The design proposal also specified a "Clean Sweep" badge (every entry in
// reasoning.checks[] passed). Measured against the World Cup's full 198-row
// history it fires on 63.6% of settled picks — the engine's two always-on
// checks (de-vigged probability ≥50%, ≥3 books agreeing) are close to
// tautological given a pick only exists once it clears roughly that bar, so
// "all checks passed" is closer to "the engine took this pick at all" than a
// meaningful signal. That directly contradicts the design's own stated goal
// ("won't fire on most rows... badges that show up constantly stop meaning
// anything" — design §4), so it's dropped rather than shipped dishonestly
// common. Recorded in docs/handoffs/engine-history-build_2026-09-14.md.
export function rowBadges(pick: SettledPickDetail, records: SettledRecords): RowBadge[] {
  const badges: RowBadge[] = [];
  if (pick.is_banko) badges.push("banko");
  if (pick.status === "won" && pick.probability < 0.35) badges.push("upset");
  if (records.bestPriceWonId === pick.id) badges.push("best-price");
  return badges;
}

export type StreakRun = {
  status: "won" | "lost" | "void";
  length: number;
  /** ids of every pick in the run, in the same order as the source array. */
  ids: string[];
};

// Groups an settled_at-desc list into consecutive same-status runs, newest
// run first. Used for the "N-WIN STREAK" dividers — only meaningful against
// the true chronological order, so callers only show these on the
// unfiltered, most-recent-first view (see results/page.tsx).
export function groupStreaks(picks: SettledPickDetail[]): StreakRun[] {
  const runs: StreakRun[] = [];
  for (const p of picks) {
    const last = runs[runs.length - 1];
    if (last && last.status === p.status) {
      last.length += 1;
      last.ids.push(p.id);
    } else {
      runs.push({ status: p.status, length: 1, ids: [p.id] });
    }
  }
  return runs;
}
