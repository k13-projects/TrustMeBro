import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  isoDateInProjectTz,
  isoDateOffset,
  isValidIsoDate,
  todayIsoDate,
} from "@/lib/date";
import { oddsProvider, MARKET_KEY_TO_PROP } from "@/lib/signals/odds";
import { insertOddsSnapshots, pruneOddsSnapshots } from "@/lib/signals/odds/repo";
import type { OddsQuote, RequestCredits } from "@/lib/signals/odds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
  upcoming: z.coerce.number().int().min(0).max(7).optional(),
});

const DEFAULT_UPCOMING_DAYS = 1;

// Pulls player-prop odds (points / rebounds / assists / 3PM) from The Odds API
// for every NBA game on the target dates (LA-day). Snapshots are inserted into
// odds_snapshots; the prediction generator joins on these at run time and only
// emits picks where real odds exist. Default scope: today + next 1 day, so
// tomorrow's slate has odds in place before /generate-predictions runs.
// Override with ?date=YYYY-MM-DD (pin a single date) or ?upcoming=N (today +
// N future days). Game lines (spread/total/moneyline) are not ingested here —
// the prop_market enum doesn't include them.
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const today = todayIsoDate();
  let targetDates: string[];
  if (parsed.data.date && isValidIsoDate(parsed.data.date)) {
    targetDates = [parsed.data.date];
  } else {
    const ahead = parsed.data.upcoming ?? DEFAULT_UPCOMING_DAYS;
    targetDates = [today];
    for (let i = 1; i <= ahead; i++) {
      targetDates.push(isoDateOffset(today, i));
    }
  }

  const supabase = supabaseAdmin();

  const { data: gamesRows, error: gamesErr } = await supabase
    .from("games")
    .select("id, date, home_team_id, visitor_team_id, datetime")
    .in("date", targetDates);
  if (gamesErr) {
    return NextResponse.json(
      { ok: false, error: `load games: ${gamesErr.message}` },
      { status: 500 },
    );
  }
  if (!gamesRows || gamesRows.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no games on target dates",
      target_dates: targetDates,
    });
  }

  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "ODDS_API_KEY not configured",
      target_dates: targetDates,
    });
  }

  const gamesByDate = new Map<string, typeof gamesRows>();
  for (const g of gamesRows) {
    const list = gamesByDate.get(g.date) ?? [];
    list.push(g);
    gamesByDate.set(g.date, list);
  }

  const teamIds = new Set<number>();
  for (const g of gamesRows) {
    teamIds.add(g.home_team_id);
    teamIds.add(g.visitor_team_id);
  }
  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, full_name")
    .in("id", [...teamIds]);
  if (teamsErr) {
    return NextResponse.json(
      { ok: false, error: `load teams: ${teamsErr.message}` },
      { status: 500 },
    );
  }
  const teamIdByFullName = new Map<string, number>();
  for (const t of teams ?? []) teamIdByFullName.set(normalize(t.full_name), t.id);

  const { data: players, error: playersErr } = await supabase
    .from("players")
    .select("id, first_name, last_name, team_id")
    .in("team_id", [...teamIds]);
  if (playersErr) {
    return NextResponse.json(
      { ok: false, error: `load players: ${playersErr.message}` },
      { status: 500 },
    );
  }
  const playerIdByName = new Map<string, number>();
  for (const p of players ?? []) {
    const key = normalize(`${p.first_name} ${p.last_name}`);
    if (!playerIdByName.has(key)) playerIdByName.set(key, p.id);
  }

  const provider = oddsProvider();
  let lastCredits: RequestCredits = {
    requests_remaining: null,
    requests_used: null,
    requests_last: null,
  };
  let creditsBurned = 0;

  let events: Awaited<ReturnType<typeof provider.listEvents>>["data"];
  try {
    const r = await provider.listEvents();
    events = r.data;
    lastCredits = r.credits;
    creditsBurned += r.credits.requests_last ?? 0;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: errMsg(err), stage: "listEvents" },
      { status: 502 },
    );
  }

  // Match The Odds API events to our games per target date, using LA-anchored
  // commence_time → date and team-name normalization. listEvents returns the
  // whole upcoming slate in one call, so we don't pay per-day for discovery —
  // only the per-event props fetch costs credits.
  type GameMatch = {
    game_id: number;
    date: string;
    event_id: string;
    home_team_id: number;
    visitor_team_id: number;
    home_team_name: string;
    away_team_name: string;
  };
  const matches: GameMatch[] = [];
  const unmatchedEventsByDate = new Map<string, string[]>();

  for (const date of targetDates) {
    const dateGames = gamesByDate.get(date);
    if (!dateGames) continue;
    const unmatched: string[] = [];
    for (const ev of events) {
      if (isoDateInProjectTz(ev.commence_time) !== date) continue;
      const homeId = teamIdByFullName.get(normalize(ev.home_team));
      const awayId = teamIdByFullName.get(normalize(ev.away_team));
      if (homeId == null || awayId == null) {
        unmatched.push(`${ev.away_team} @ ${ev.home_team}`);
        continue;
      }
      const game = dateGames.find(
        (g) => g.home_team_id === homeId && g.visitor_team_id === awayId,
      );
      if (!game) {
        unmatched.push(`${ev.away_team} @ ${ev.home_team} (no DB game)`);
        continue;
      }
      matches.push({
        game_id: game.id,
        date,
        event_id: ev.id,
        home_team_id: homeId,
        visitor_team_id: awayId,
        home_team_name: ev.home_team,
        away_team_name: ev.away_team,
      });
    }
    if (unmatched.length > 0) unmatchedEventsByDate.set(date, unmatched);
  }

  const allQuotes: OddsQuote[] = [];
  const perGame: Array<{
    game_id: number;
    date: string;
    quotes: number;
    skipped_unknown_players: number;
    error?: string;
  }> = [];
  let totalUnknownPlayers = 0;
  const capturedAt = new Date().toISOString();

  for (const m of matches) {
    try {
      const r = await provider.listPlayerPropsForEvent(
        m.event_id,
        m.home_team_name,
        m.away_team_name,
      );
      lastCredits = r.credits;
      creditsBurned += r.credits.requests_last ?? 0;

      let quotesForGame = 0;
      let skippedPlayers = 0;
      for (const o of r.data) {
        const market = MARKET_KEY_TO_PROP[o.market_key];
        if (!market) continue;
        const playerId = playerIdByName.get(normalize(o.player_name));
        if (playerId == null) {
          skippedPlayers++;
          totalUnknownPlayers++;
          continue;
        }
        allQuotes.push({
          game_id: m.game_id,
          player_id: playerId,
          player_name: o.player_name,
          market,
          line: o.line,
          pick: o.side,
          bookmaker: o.bookmaker_key,
          price_decimal: o.price_decimal,
          captured_at: capturedAt,
        });
        quotesForGame++;
      }
      perGame.push({
        game_id: m.game_id,
        date: m.date,
        quotes: quotesForGame,
        skipped_unknown_players: skippedPlayers,
      });
    } catch (err) {
      perGame.push({
        game_id: m.game_id,
        date: m.date,
        quotes: 0,
        skipped_unknown_players: 0,
        error: errMsg(err),
      });
    }
  }

  let insertedResult: { inserted: number } = { inserted: 0 };
  try {
    insertedResult = await insertOddsSnapshots(allQuotes);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: errMsg(err),
        stage: "insertOddsSnapshots",
        attempted: allQuotes.length,
        credits: lastCredits,
        credits_burned: creditsBurned,
      },
      { status: 500 },
    );
  }

  const pruneResult = await pruneOddsSnapshots();

  const perDate = targetDates.map((date) => {
    const dateMatches = matches.filter((m) => m.date === date);
    const dateGames = gamesByDate.get(date) ?? [];
    const dateQuotes = perGame
      .filter((g) => g.date === date)
      .reduce((s, g) => s + g.quotes, 0);
    return {
      date,
      games: dateGames.length,
      matched: dateMatches.length,
      quotes: dateQuotes,
      unmatched_events: unmatchedEventsByDate.get(date) ?? [],
    };
  });

  return NextResponse.json({
    ok: true,
    target_dates: targetDates,
    games_total: gamesRows.length,
    events_returned: events.length,
    games_matched: matches.length,
    quotes_collected: allQuotes.length,
    snapshots_inserted: insertedResult.inserted,
    snapshots_pruned: pruneResult.deleted,
    unknown_players_skipped: totalUnknownPlayers,
    per_date: perDate,
    per_game: perGame,
    credits: lastCredits,
    credits_burned: creditsBurned,
  });
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
