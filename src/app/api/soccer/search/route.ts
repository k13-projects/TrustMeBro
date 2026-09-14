import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { getFollowedTeamIds } from "@/lib/sports/soccer/follow-queries";
import { todayIsoDate } from "@/lib/date";
import { canonicalTeamName } from "@/lib/sports/soccer/team-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eighty-one clubs have played in this season's Champions League alone, and
// the only way to reach one was scrolling a table. Database-only: no upstream
// calls, so the palette stays instant.

type TeamHit = {
  kind: "team";
  id: number;
  name: string;
  abbreviation: string;
  crest: string | null;
  competition: string | null;
  competitionLabel: string | null;
  followed: boolean;
};

type MatchHit = {
  kind: "match";
  id: number;
  competition: string;
  competitionLabel: string;
  date: string;
  datetime: string | null;
  finished: boolean;
  home: { name: string; crest: string | null };
  away: { name: string; crest: string | null };
  score: string | null;
};

const MATCH_SELECT =
  "id, competition, date, datetime, finished, home_score, away_score, " +
  "home:soccer_teams!soccer_matches_home_team_id_fkey(id, name, crest_url), " +
  "away:soccer_teams!soccer_matches_away_team_id_fkey(id, name, crest_url)";

type RawTeam = { id: number; name: string; crest_url: string | null };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function label(competition: string): string {
  return competition in COMPETITIONS
    ? COMPETITIONS[competition as keyof typeof COMPETITIONS].label
    : competition;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const [competition, followed] = await Promise.all([
    activeCompetition(),
    getFollowedTeamIds(),
  ]);
  const followedSet = new Set(followed);

  // Which competition each team mostly plays in, so a hit can be labelled.
  const competitionOf = async (ids: number[]) => {
    const out = new Map<number, string>();
    if (ids.length === 0) return out;
    const { data } = await supabase
      .from("soccer_matches")
      .select("competition, home_team_id, away_team_id")
      .or(`home_team_id.in.(${ids.join(",")}),away_team_id.in.(${ids.join(",")})`)
      .limit(800);
    const tally = new Map<number, Map<string, number>>();
    for (const m of data ?? []) {
      for (const id of [m.home_team_id, m.away_team_id]) {
        if (!ids.includes(id)) continue;
        const inner = tally.get(id) ?? new Map<string, number>();
        inner.set(m.competition, (inner.get(m.competition) ?? 0) + 1);
        tally.set(id, inner);
      }
    }
    for (const [id, inner] of tally) {
      const best = [...inner.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) out.set(id, best[0]);
    }
    return out;
  };

  // No query yet: show what the viewer already cares about, plus what's next.
  if (q.length === 0) {
    const teamsQuery =
      followed.length > 0
        ? supabase
            .from("soccer_teams")
            .select("id, name, abbreviation, crest_url")
            .in("id", followed)
        : supabase.from("soccer_teams").select("id, name, abbreviation, crest_url").limit(0);
    const [{ data: teams }, { data: matches }] = await Promise.all([
      teamsQuery,
      supabase
        .from("soccer_matches")
        .select(MATCH_SELECT)
        .eq("competition", competition)
        .gte("date", todayIsoDate())
        .order("datetime", { ascending: true })
        .limit(6),
    ]);
    const comps = await competitionOf((teams ?? []).map((t) => t.id));
    return NextResponse.json({
      ok: true,
      query: "",
      teams: (teams ?? []).map((t): TeamHit => ({
        kind: "team",
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        crest: t.crest_url,
        competition: comps.get(t.id) ?? null,
        competitionLabel: comps.get(t.id) ? label(comps.get(t.id)!) : null,
        followed: true,
      })),
      matches: toMatchHits(matches ?? []),
    });
  }

  // Fold the query the way the stored column was folded, and run it through
  // the same alias table the odds matcher uses, so "atletico" finds "Atlético
  // Madrid" and "man utd" finds "Manchester United". Every token must appear,
  // so "real madrid" doesn't drag in every club with "real" in its name.
  const canonical = canonicalTeamName(q);
  const tokens = canonical.split(/[\s-]+/).filter((t) => t.length >= 2).slice(0, 3);
  let teamQuery = supabase
    .from("soccer_teams")
    .select("id, name, abbreviation, crest_url");
  for (const token of tokens.length > 0 ? tokens : [canonical]) {
    teamQuery = teamQuery.ilike("name_search", `%${token}%`);
  }
  const { data: teams } = await teamQuery.limit(24);

  const teamIds = (teams ?? []).map((t) => t.id);
  const comps = await competitionOf(teamIds);

  // Rank: the active competition first, then followed clubs, then name order.
  const ranked = (teams ?? [])
    .map((t): TeamHit => {
      const comp = comps.get(t.id) ?? null;
      return {
        kind: "team",
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        crest: t.crest_url,
        competition: comp,
        competitionLabel: comp ? label(comp) : null,
        followed: followedSet.has(t.id),
      };
    })
    .sort((a, b) => {
      const score = (h: TeamHit) =>
        (h.competition === competition ? -4 : 0) +
        (h.followed ? -2 : 0) +
        (h.name.toLowerCase().startsWith(q.toLowerCase()) ? -1 : 0);
      return score(a) - score(b) || a.name.localeCompare(b.name);
    })
    .slice(0, 8);

  let matches: unknown[] = [];
  if (teamIds.length > 0) {
    const { data } = await supabase
      .from("soccer_matches")
      .select(MATCH_SELECT)
      .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
      .order("datetime", { ascending: false })
      .limit(60);
    // Prefer what is coming, then the most recent.
    const rows = (data ?? []) as unknown as Array<{
      finished: boolean;
      datetime: string | null;
    }>;
    const upcoming = rows.filter((r) => !r.finished).reverse();
    const played = rows.filter((r) => r.finished);
    matches = [...upcoming, ...played].slice(0, 8);
  }

  return NextResponse.json({
    ok: true,
    query: q,
    teams: ranked,
    matches: toMatchHits(matches),
  });
}

function toMatchHits(rows: unknown[]): MatchHit[] {
  return (rows as Array<Record<string, unknown>>).map((m): MatchHit => {
    const home = one(m.home as RawTeam | RawTeam[] | null);
    const away = one(m.away as RawTeam | RawTeam[] | null);
    const competition = String(m.competition);
    return {
      kind: "match",
      id: Number(m.id),
      competition,
      competitionLabel: label(competition),
      date: String(m.date),
      datetime: (m.datetime as string | null) ?? null,
      finished: Boolean(m.finished),
      home: { name: home?.name ?? "Home", crest: home?.crest_url ?? null },
      away: { name: away?.name ?? "Away", crest: away?.crest_url ?? null },
      score: m.finished ? `${m.home_score}–${m.away_score}` : null,
    };
  });
}
