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
  insertSoccerOdds,
  pruneSoccerOdds,
  type SoccerOddsRow,
} from "@/lib/sports/soccer/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
  ahead: z.coerce.number().int().min(0).max(7).optional(),
});

// ESPN and The Odds API name some countries differently. Map both spellings to
// a single canonical token so the team-name join matches. Keyed by the
// already-normalized form.
const COUNTRY_ALIASES: Record<string, string> = {
  "dr congo": "congo dr",
  "democratic republic of the congo": "congo dr",
  "congo democratic republic": "congo dr",
  "south korea": "korea republic",
  "north korea": "korea dr",
  "ivory coast": "cote divoire",
  "cape verde": "cabo verde",
  "ir iran": "iran",
  turkiye: "turkey",
  "united states": "usa",
  "united states of america": "usa",
  "republic of ireland": "ireland",
  "czechia": "czech republic",
};

function normalize(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return COUNTRY_ALIASES[base] ?? base;
}

// Pulls World Cup match odds (1X2 + totals) from The Odds API and stores a
// snapshot per (match, market, side, bookmaker). Resolves Odds-API events to
// our matches by normalized team name + LA-day. No ODDS_API_KEY ⇒ no-op.
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
    const ahead = parsed.data.ahead ?? 1;
    dates = [today];
    for (let i = 1; i <= ahead; i++) dates.push(isoDateOffset(today, i));
  }

  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "ODDS_API_KEY not configured",
      dates,
    });
  }

  const supabase = supabaseAdmin();
  const { data: matches, error } = await supabase
    .from("soccer_matches")
    .select("id, date, home_team_id, away_team_id")
    .in("date", dates);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `load matches: ${error.message}` },
      { status: 500 },
    );
  }
  if (!matches || matches.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no matches", dates });
  }

  const teamIds = new Set<number>();
  for (const m of matches) {
    teamIds.add(m.home_team_id);
    teamIds.add(m.away_team_id);
  }
  const { data: teams } = await supabase
    .from("soccer_teams")
    .select("id, name")
    .in("id", [...teamIds]);
  const idByName = new Map<string, number>();
  for (const t of teams ?? []) idByName.set(normalize(t.name), t.id);

  const { data: events, credits } = await fetchSoccerOdds();

  const rows: SoccerOddsRow[] = [];
  const unmatched: string[] = [];
  for (const ev of events) {
    if (!dates.includes(isoDateInProjectTz(ev.commence_time))) continue;
    const homeId = idByName.get(normalize(ev.home_team));
    const awayId = idByName.get(normalize(ev.away_team));
    if (homeId == null || awayId == null) {
      unmatched.push(`${ev.away_team} @ ${ev.home_team}`);
      continue;
    }
    const match = matches.find(
      (m) => m.home_team_id === homeId && m.away_team_id === awayId,
    );
    if (!match) {
      unmatched.push(`${ev.away_team} @ ${ev.home_team} (no DB match)`);
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
  }

  const { inserted } = await insertSoccerOdds(rows);
  const { deleted } = await pruneSoccerOdds();

  return NextResponse.json({
    ok: true,
    dates,
    events_returned: events.length,
    quotes_collected: rows.length,
    snapshots_inserted: inserted,
    snapshots_pruned: deleted,
    unmatched,
    credits,
  });
}
