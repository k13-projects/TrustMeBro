import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../../_auth";
import {
  isoDateInProjectTz,
  isoDateOffset,
  isValidIsoDate,
  todayIsoDate,
} from "@/lib/date";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchSoccerOdds } from "@/lib/signals/odds/soccer";
import {
  COMPETITIONS,
  isCompetition,
  liveCompetitions,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";
import {
  getLastOddsPullAt,
  insertOddsHistory,
  insertSoccerOdds,
  pruneSoccerOdds,
  recordOddsPull,
  type OddsHistoryRow,
  type SoccerOddsRow,
} from "@/lib/sports/soccer/repo";
import { shouldPullOdds } from "@/lib/sports/soccer/odds-cadence";
import { resolveMatch } from "@/lib/sports/soccer/team-match";
import { consensus, modalLine, SIDES, type EngineQuote } from "@/lib/analysis/soccer/engine";
import type { SoccerMarket } from "@/lib/sports/types";
import { runCronJob } from "@/lib/ingest/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  competition: z.string().optional(),
  date: z.string().optional(),
  ahead: z.coerce.number().int().min(0).max(14).optional(),
});

// Consensus per market for one match's quotes — the compact row the movement
// chart plots. Same de-vig as the engine so the two never disagree.
function historyRows(matchId: number, quotes: EngineQuote[]): OddsHistoryRow[] {
  const out: OddsHistoryRow[] = [];
  for (const market of Object.keys(SIDES) as SoccerMarket[]) {
    const sides = SIDES[market];
    let mq = quotes.filter((q) => q.market === market);
    let line: number | null = null;
    if (market === "total_goals") {
      line = modalLine(mq);
      if (line === null) continue;
      mq = mq.filter((q) => q.line === line);
    }
    if (mq.length === 0) continue;
    const { prob, bestOdds, bookCount } = consensus(mq, sides);
    if (bookCount === 0) continue;
    for (const side of sides) {
      out.push({
        match_id: matchId,
        market,
        side,
        line,
        prob: Math.round((prob.get(side) ?? 0) * 10000) / 10000,
        best_odds: bestOdds.get(side)?.odds ?? null,
        book_count: bookCount,
      });
    }
  }
  return out;
}

type CompetitionOddsResult = {
  events_returned: number;
  quotes_collected: number;
  snapshots_inserted: number;
  history_rows: number;
  unmatched: string[];
  credits: unknown;
  skipped?: string;
};

// Pulls match odds (1X2 + totals) from The Odds API for every LIVE competition
// and stores a snapshot per (match, market, side, bookmaker). Bookmaker events
// are resolved to our ESPN-keyed matches by fuzzy team name on the same LA-day
// (see team-match.ts). No ODDS_API_KEY ⇒ no-op. 4 credits per competition.
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const today = todayIsoDate();
  let dates: string[];
  if (parsed.data.date && isValidIsoDate(parsed.data.date)) {
    dates = [parsed.data.date];
  } else {
    // 8 days out by default: books list a whole European matchday about a
    // week ahead, and a daily point per match is what makes the movement
    // chart. Same 4 credits per call regardless of window.
    const ahead = parsed.data.ahead ?? 8;
    dates = [today];
    for (let i = 1; i <= ahead; i++) dates.push(isoDateOffset(today, i));
  }

  let competitions: SoccerCompetition[];
  if (parsed.data.competition) {
    if (!isCompetition(parsed.data.competition)) {
      return NextResponse.json({ error: "unknown competition" }, { status: 400 });
    }
    competitions = [parsed.data.competition];
  } else {
    competitions = liveCompetitions();
  }

  const outcome = await runCronJob("soccer/track-odds", async () => {
    if (!process.env.ODDS_API_KEY) {
      return { skipped: true, reason: "ODDS_API_KEY not configured", dates };
    }

    const supabase = supabaseAdmin();
    const results: Record<string, CompetitionOddsResult> = {};

    for (const competition of competitions) {
      const oddsKey = COMPETITIONS[competition].oddsKey;
      if (oddsKey === null) {
        results[competition] = {
          events_returned: 0,
          quotes_collected: 0,
          snapshots_inserted: 0,
          history_rows: 0,
          unmatched: [],
          credits: null,
          skipped: "no odds source for this competition yet (oddsKey null)",
        };
        continue;
      }
      const { data: matches, error } = await supabase
        .from("soccer_matches")
        .select(
          "id, date, datetime, home:soccer_teams!soccer_matches_home_team_id_fkey(name), away:soccer_teams!soccer_matches_away_team_id_fkey(name)",
        )
        .eq("competition", competition)
        .in("date", dates)
        .eq("finished", false);
      if (error) {
        throw new Error(`load matches: ${error.message}`);
      }
      const candidates = ((matches ?? []) as unknown as Array<{
        id: number;
        date: string;
        datetime: string | null;
        home: { name: string } | { name: string }[] | null;
        away: { name: string } | { name: string }[] | null;
      }>).map((m) => ({
        match: { id: m.id, date: m.date, datetime: m.datetime },
        home: (Array.isArray(m.home) ? m.home[0] : m.home)?.name ?? "",
        away: (Array.isArray(m.away) ? m.away[0] : m.away)?.name ?? "",
      }));
      if (candidates.length === 0) {
        results[competition] = {
          events_returned: 0,
          quotes_collected: 0,
          snapshots_inserted: 0,
          history_rows: 0,
          unmatched: [],
          credits: null,
          skipped: "no unfinished matches in window — no credits spent",
        };
        continue;
      }

      const cadence = COMPETITIONS[competition].oddsCadence;
      if (cadence) {
        const lastPulledAt = await getLastOddsPullAt(competition);
        const earliestKickoff = candidates.reduce<Date | null>((min, c) => {
          if (!c.match.datetime) return min;
          const dt = new Date(c.match.datetime);
          return !min || dt < min ? dt : min;
        }, null);
        if (!shouldPullOdds(cadence, lastPulledAt, earliestKickoff, new Date())) {
          results[competition] = {
            events_returned: 0,
            quotes_collected: 0,
            snapshots_inserted: 0,
            history_rows: 0,
            unmatched: [],
            credits: null,
            skipped: `cadence: next pull not due yet (min ${cadence.minHours}h between pulls, last pulled ${lastPulledAt?.toISOString() ?? "never"})`,
          };
          continue;
        }
      }

      const { data: events, credits } = await fetchSoccerOdds(oddsKey);
      if (cadence) await recordOddsPull(competition);

      const rows: SoccerOddsRow[] = [];
      const history: OddsHistoryRow[] = [];
      const unmatched: string[] = [];
      for (const ev of events) {
        const day = isoDateInProjectTz(ev.commence_time);
        if (!dates.includes(day)) continue;
        const match = resolveMatch(
          ev,
          candidates.filter((c) => c.match.date === day),
        );
        if (!match) {
          unmatched.push(`${ev.home_team} v ${ev.away_team} (${day})`);
          continue;
        }
        for (const q of ev.quotes) {
          rows.push({
            match_id: match.id,
            market: q.market,
            side: q.side,
            line: q.line,
            bookmaker: q.bookmaker,
            odds: q.odds,
          });
        }
        history.push(...historyRows(match.id, ev.quotes));
      }

      const { inserted } = await insertSoccerOdds(rows);
      const historyInserted = await insertOddsHistory(history);
      results[competition] = {
        events_returned: events.length,
        quotes_collected: rows.length,
        snapshots_inserted: inserted,
        history_rows: historyInserted,
        unmatched,
        credits,
      };
    }

    const { deleted } = await pruneSoccerOdds();

    return { dates, competitions: results, snapshots_pruned: deleted };
  });

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, dates, error: outcome.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...outcome.summary });
}
