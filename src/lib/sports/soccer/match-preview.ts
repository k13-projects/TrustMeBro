import type { MatchRow, StandingRow } from "./queries";
import type { RecentResult } from "./provider";
import type { MarketRates } from "./rates";

// A written preview of a match that has not been played, assembled from facts
// we already hold: each side's recent results, where they sit in the table,
// and what the market makes of it. Deterministic on purpose — every sentence
// can be traced to a number on the page, so nothing here can invent a story.

export type FormSummary = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  scoredIn: number;
  /** Newest first, as "W" | "D" | "L". */
  sequence: Array<"W" | "D" | "L">;
  unbeatenRun: number;
  winRun: number;
  winlessRun: number;
};

export function summariseForm(results: RecentResult[], limit = 5): FormSummary {
  const recent = results.slice(0, limit);
  const s: FormSummary = {
    played: recent.length,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    cleanSheets: 0,
    scoredIn: 0,
    sequence: [],
    unbeatenRun: 0,
    winRun: 0,
    winlessRun: 0,
  };
  for (const r of recent) {
    s.sequence.push(r.result);
    if (r.result === "W") s.won += 1;
    else if (r.result === "D") s.drawn += 1;
    else s.lost += 1;
    s.goalsFor += r.goals_for;
    s.goalsAgainst += r.goals_against;
    if (r.goals_against === 0) s.cleanSheets += 1;
    if (r.goals_for > 0) s.scoredIn += 1;
  }
  for (const r of s.sequence) {
    if (r !== "L") s.unbeatenRun += 1;
    else break;
  }
  for (const r of s.sequence) {
    if (r === "W") s.winRun += 1;
    else break;
  }
  for (const r of s.sequence) {
    if (r !== "W") s.winlessRun += 1;
    else break;
  }
  return s;
}

function formSentence(name: string, f: FormSummary): string | null {
  if (f.played === 0) return null;
  const record =
    f.won === f.played
      ? `have won all ${f.played} of their last ${f.played}`
      : f.lost === f.played
        ? `have lost all ${f.played} of their last ${f.played}`
        : `are ${f.won}-${f.drawn}-${f.lost} in their last ${f.played}`;
  const bits: string[] = [];
  if (f.winRun >= 3 && f.won !== f.played) bits.push(`${f.winRun} straight wins`);
  else if (f.unbeatenRun >= 4 && f.won !== f.played) bits.push(`unbeaten in ${f.unbeatenRun}`);
  else if (f.winlessRun >= 4) bits.push(`without a win in ${f.winlessRun}`);
  if (f.cleanSheets >= 3) bits.push(`${f.cleanSheets} clean sheets`);
  else if (f.scoredIn === f.played && f.played >= 4) bits.push("scoring in every one");
  else if (f.goalsFor === 0) bits.push("still without a goal");
  const tail = bits.length > 0 ? `, with ${bits.join(" and ")}` : "";
  return `${name} ${record}${tail}, scoring ${f.goalsFor} and conceding ${f.goalsAgainst}.`;
}

function tableSentence(
  homeName: string,
  awayName: string,
  home: StandingRow | null,
  away: StandingRow | null,
  phaseLabel: string,
): string | null {
  if (!home && !away) return null;
  const part = (name: string, row: StandingRow | null) =>
    row ? `${name} sit ${ordinal(row.rank)} on ${row.points} ${row.points === 1 ? "point" : "points"}` : null;
  const bits = [part(homeName, home), part(awayName, away)].filter(Boolean);
  if (bits.length === 0) return null;
  return `In the ${phaseLabel.toLowerCase()}, ${bits.join(" and ")}.`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function marketSentence(
  homeName: string,
  awayName: string,
  markets: MarketRates[],
): string | null {
  const result = markets.find((m) => m.market === "match_winner");
  if (!result) return null;
  const best = [...result.outcomes].sort((a, b) => b.prob - a.prob)[0];
  if (!best) return null;
  const pct = Math.round(best.prob * 100);
  const who =
    best.side === "home" ? homeName : best.side === "away" ? awayName : "a draw";
  const totals = markets.find((m) => m.market === "total_goals");
  let tail = "";
  if (totals && totals.line !== null) {
    const over = totals.outcomes.find((o) => o.side === "over");
    if (over) {
      const lean = over.prob >= 0.5 ? "over" : "under";
      tail = ` The books lean ${lean} ${totals.line} goals.`;
    }
  }
  if (best.side === "draw") {
    return `The market can't separate them: a draw is the single most likely result at ${pct}%.${tail}`;
  }
  const strength = pct >= 65 ? "clear favourites" : pct >= 50 ? "favourites" : "narrow favourites";
  return `Across ${result.bookCount} bookmakers ${who} are ${strength} at ${pct}%.${tail}`;
}

export type MatchPreview = {
  paragraphs: string[];
  homeForm: FormSummary;
  awayForm: FormSummary;
};

export function buildMatchPreview(opts: {
  match: MatchRow;
  homeResults: RecentResult[];
  awayResults: RecentResult[];
  homeStanding: StandingRow | null;
  awayStanding: StandingRow | null;
  markets: MarketRates[];
  headToHead: MatchRow[];
  phaseLabel: string;
}): MatchPreview {
  const { match } = opts;
  const homeForm = summariseForm(opts.homeResults);
  const awayForm = summariseForm(opts.awayResults);

  const paragraphs: string[] = [];
  const form = [
    formSentence(match.home.name, homeForm),
    formSentence(match.away.name, awayForm),
  ].filter(Boolean) as string[];
  if (form.length > 0) paragraphs.push(form.join(" "));

  const context = [
    tableSentence(
      match.home.name,
      match.away.name,
      opts.homeStanding,
      opts.awayStanding,
      opts.phaseLabel,
    ),
    h2hSentence(match, opts.headToHead),
  ].filter(Boolean) as string[];
  if (context.length > 0) paragraphs.push(context.join(" "));

  const market = marketSentence(match.home.name, match.away.name, opts.markets);
  if (market) paragraphs.push(market);

  return { paragraphs, homeForm, awayForm };
}

function h2hSentence(match: MatchRow, h2h: MatchRow[]): string | null {
  const played = h2h.filter((m) => m.finished);
  if (played.length === 0) return null;
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  for (const m of played) {
    const homeIsHome = m.home.id === match.home.id;
    const hs = homeIsHome ? m.home_score : m.away_score;
    const as = homeIsHome ? m.away_score : m.home_score;
    if (hs > as) homeWins += 1;
    else if (as > hs) awayWins += 1;
    else draws += 1;
  }
  const last = played[0];
  const lastLine = `${last.home.name} ${last.home_score}–${last.away_score} ${last.away.name}`;
  if (played.length === 1) return `They met once before: ${lastLine}.`;
  return `Of ${played.length} previous meetings on our record, ${match.home.name} have won ${homeWins}, ${match.away.name} ${awayWins}, with ${draws} drawn. Last time: ${lastLine}.`;
}
