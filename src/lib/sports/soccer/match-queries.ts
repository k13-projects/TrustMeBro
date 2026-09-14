import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchSide } from "@/lib/sports/types";
import { liveWinProbability, minutesFromClock, type PreMatchRead } from "@/lib/analysis/soccer/live-prob";
import type { CommentaryLine, MatchDetail, MatchEvent, TeamStatLine } from "./provider";
import { getOddsHistory } from "./queries";
import { getSoccerRates } from "./rates";

// Small standalone reads for the match detail page. Kept out of queries.ts
// (owned concurrently by another change) even though they query the same
// table — one column each, cheap to keep separate.

// The ESPN league slug a match was ingested under. Qualifying ties live under
// a different slug than the main phase, and `soccerProvider(competition, slug)`
// needs it to fetch the right event from ESPN's match-summary endpoint.
export async function getMatchLeagueSlug(matchId: number): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select("league_slug")
    .eq("id", matchId)
    .maybeSingle();
  return (data?.league_slug as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Live tracker snapshot — shared by the SSR match page (initial paint) and the
// /api/soccer/matches/[id]/live poller, so the win-probability read and the
// stat/commentary trimming stay in exactly one place.
// ---------------------------------------------------------------------------

export type LiveProb = { home: number; draw: number; away: number };

export type LiveMatchState = {
  state: "pre" | "in" | "post";
  status: string;
  clock: string | null;
  period: number;
  home_score: number;
  away_score: number;
  finished: boolean;
};

export type LiveSnapshot = {
  match: LiveMatchState;
  events: MatchEvent[];
  commentary: CommentaryLine[];
  stats: { home: TeamStatLine[]; away: TeamStatLine[] };
  prob: LiveProb | null;
  preMatchProb: LiveProb | null;
  probSource: "rates" | "history" | "neutral";
};

// The four stats worth showing compact on the live tracker. Everything else
// (fouls, offsides, passes…) stays in the full Match stats section below.
const KEY_STAT_KEYS = new Set(["possessionPct", "totalShots", "shotsOnTarget", "wonCorners"]);

function normalizeProb(home: number, draw: number, away: number): LiveProb {
  const total = Math.max(0, home) + Math.max(0, draw) + Math.max(0, away);
  if (total <= 0) return { home: 0.42, draw: 0.26, away: 0.32 };
  return { home: Math.max(0, home) / total, draw: Math.max(0, draw) / total, away: Math.max(0, away) / total };
}

// Pre-match read hierarchy: consensus rates (getSoccerRates) > latest odds
// history point > neutral default. `source` is surfaced so the UI can say
// "no pre-match price — neutral model" instead of presenting a guess as fact.
async function loadPreMatchRead(
  matchId: number,
): Promise<{ read: PreMatchRead; source: LiveSnapshot["probSource"] }> {
  const markets = (await getSoccerRates([matchId])).get(matchId) ?? [];
  const winner = markets.find((m) => m.market === "match_winner");
  const totals = markets.find((m) => m.market === "total_goals");

  if (winner) {
    const prob = (side: MatchSide) => winner.outcomes.find((o) => o.side === side)?.prob ?? 0;
    return {
      source: "rates",
      read: {
        home: prob("home"),
        draw: prob("draw"),
        away: prob("away"),
        totalLine: totals?.line ?? null,
        overProb: totals?.outcomes.find((o) => o.side === "over")?.prob ?? null,
      },
    };
  }

  const history = await getOddsHistory(matchId);
  const winnerPoints = history.filter((p) => p.market === "match_winner");
  const lastAt = winnerPoints.at(-1)?.capturedAt ?? null;
  if (lastAt) {
    const latest = winnerPoints.filter((p) => p.capturedAt === lastAt);
    const prob = (side: MatchSide) => latest.find((p) => p.side === side)?.prob ?? 0;
    const totalPoints = history.filter((p) => p.market === "total_goals");
    const lastTotalAt = totalPoints.at(-1)?.capturedAt ?? null;
    const lastTotal = lastTotalAt ? totalPoints.filter((p) => p.capturedAt === lastTotalAt) : [];
    return {
      source: "history",
      read: {
        home: prob("home"),
        draw: prob("draw"),
        away: prob("away"),
        totalLine: lastTotal[0]?.line ?? null,
        overProb: lastTotal.find((p) => p.side === "over")?.prob ?? null,
      },
    };
  }

  return { source: "neutral", read: { home: 0.42, draw: 0.26, away: 0.32 } };
}

export async function buildLiveSnapshot(
  matchId: number,
  detail: MatchDetail,
  events: MatchEvent[],
): Promise<LiveSnapshot> {
  const m = detail.match;
  const { read, source } = await loadPreMatchRead(matchId);

  const prob = liveWinProbability(read, {
    homeGoals: m.home_score,
    awayGoals: m.away_score,
    minute: minutesFromClock(m.clock, m.period),
    finished: m.finished,
  });

  const filterKeyStats = (lines: TeamStatLine[]) => lines.filter((l) => KEY_STAT_KEYS.has(l.key));

  return {
    match: {
      state: m.state,
      status: m.status,
      clock: m.clock,
      period: m.period,
      home_score: m.home_score,
      away_score: m.away_score,
      finished: m.finished,
    },
    events,
    commentary: detail.commentary.slice(0, 15),
    stats: { home: filterKeyStats(detail.stats.home), away: filterKeyStats(detail.stats.away) },
    prob,
    preMatchProb: normalizeProb(read.home, read.draw, read.away),
    probSource: source,
  };
}
