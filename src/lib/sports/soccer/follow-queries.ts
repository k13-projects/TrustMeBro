import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRequester } from "@/lib/identity";
import type { SoccerCompetition } from "./competitions";
import type { MatchRow } from "./queries";

// Following a club is the difference between "here is every fixture in Europe"
// and "here is your week". Identity works the same way as coupons and score
// calls: signed-in users own their rows under RLS, guests are keyed by their
// guest-name cookie and written through the service role.

export type FollowedTeam = {
  id: number;
  name: string;
  abbreviation: string;
  crest: string | null;
  color: string | null;
  competition: SoccerCompetition | null;
};

export async function getFollowedTeamIds(): Promise<number[]> {
  const requester = await getRequester();
  if (!requester) return [];
  if (requester.kind === "auth") {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("soccer_team_follows")
      .select("team_id")
      .eq("user_id", requester.user_id);
    return (data ?? []).map((r) => r.team_id as number);
  }
  const { data } = await supabaseAdmin()
    .from("soccer_team_follows")
    .select("team_id")
    .eq("guest_name", requester.guest_name);
  return (data ?? []).map((r) => r.team_id as number);
}

export async function getFollowedTeams(): Promise<FollowedTeam[]> {
  const ids = await getFollowedTeamIds();
  if (ids.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const [{ data: teams }, { data: comps }] = await Promise.all([
    supabase
      .from("soccer_teams")
      .select("id, name, abbreviation, crest_url, color")
      .in("id", ids),
    supabase
      .from("soccer_matches")
      .select("competition, home_team_id, away_team_id")
      .or(`home_team_id.in.(${ids.join(",")}),away_team_id.in.(${ids.join(",")})`)
      .limit(600),
  ]);

  // A club's "home" competition is simply the one we have most of its
  // fixtures in — good enough to label a chip, and never guessed from a name.
  const tally = new Map<number, Map<string, number>>();
  for (const m of comps ?? []) {
    for (const id of [m.home_team_id, m.away_team_id]) {
      if (!ids.includes(id)) continue;
      const inner = tally.get(id) ?? new Map<string, number>();
      inner.set(m.competition, (inner.get(m.competition) ?? 0) + 1);
      tally.set(id, inner);
    }
  }
  const pick = (id: number): SoccerCompetition | null => {
    const inner = tally.get(id);
    if (!inner) return null;
    return ([...inner.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null) as SoccerCompetition | null;
  };

  return (teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    crest: t.crest_url,
    color: t.color,
    competition: pick(t.id),
  }));
}

export type FollowedFixture = { team: FollowedTeam; match: MatchRow | null };

/** Each followed club with its next match, or its last if nothing is scheduled. */
export async function getFollowedFixtures(): Promise<FollowedFixture[]> {
  const teams = await getFollowedTeams();
  if (teams.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const ids = teams.map((t) => t.id);
  const select =
    "id, competition, date, datetime, state, status, clock, stage, grp, venue, home_score, away_score, finished, winner_team_id, " +
    "home:soccer_teams!soccer_matches_home_team_id_fkey(id, name, abbreviation, crest_url, color), " +
    "away:soccer_teams!soccer_matches_away_team_id_fkey(id, name, abbreviation, crest_url, color)";

  const [{ data: upcoming }, { data: recent }] = await Promise.all([
    supabase
      .from("soccer_matches")
      .select(select)
      .or(`home_team_id.in.(${ids.join(",")}),away_team_id.in.(${ids.join(",")})`)
      .eq("finished", false)
      .order("datetime", { ascending: true })
      .limit(120),
    supabase
      .from("soccer_matches")
      .select(select)
      .or(`home_team_id.in.(${ids.join(",")}),away_team_id.in.(${ids.join(",")})`)
      .eq("finished", true)
      .order("datetime", { ascending: false })
      .limit(120),
  ]);

  type Raw = { home: { id: number } | { id: number }[]; away: { id: number } | { id: number }[] };
  const teamIdsOf = (m: unknown): number[] => {
    const r = m as Raw;
    const one = (v: Raw["home"]) => (Array.isArray(v) ? v[0] : v);
    return [one(r.home)?.id, one(r.away)?.id].filter((n): n is number => typeof n === "number");
  };

  return teams.map((team) => {
    const next = (upcoming ?? []).find((m) => teamIdsOf(m).includes(team.id));
    const last = (recent ?? []).find((m) => teamIdsOf(m).includes(team.id));
    return { team, match: ((next ?? last) ?? null) as unknown as MatchRow | null };
  });
}

export type ClubListing = FollowedTeam & {
  followers: number;
  followed: boolean;
  rank: number | null;
  points: number | null;
  played: number | null;
};

/** Every club that has played in a competition, with its table line if any. */
export async function getCompetitionClubs(
  competition: SoccerCompetition,
): Promise<ClubListing[]> {
  const supabase = await createSupabaseServerClient();
  const { data: matches } = await supabase
    .from("soccer_matches")
    .select("home_team_id, away_team_id")
    .eq("competition", competition)
    .limit(1000);
  const ids = [
    ...new Set((matches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id])),
  ];
  if (ids.length === 0) return [];

  const [{ data: teams }, { data: standings }, { data: counts }, followed] =
    await Promise.all([
      supabase
        .from("soccer_teams")
        .select("id, name, abbreviation, crest_url, color")
        .in("id", ids),
      supabase
        .from("soccer_standings")
        .select("team_id, rank, points, played, captured_at")
        .eq("competition", competition)
        .order("captured_at", { ascending: false })
        .limit(2000),
      supabase.from("soccer_team_follow_counts").select("team_id, followers"),
      getFollowedTeamIds(),
    ]);

  const line = new Map<number, { rank: number; points: number; played: number }>();
  for (const r of standings ?? []) {
    if (line.has(r.team_id)) continue; // newest snapshot wins
    line.set(r.team_id, { rank: r.rank, points: r.points, played: r.played });
  }
  const followers = new Map<number, number>();
  for (const c of counts ?? []) followers.set(c.team_id, c.followers);
  const followedSet = new Set(followed);

  return (teams ?? [])
    .map((t): ClubListing => {
      const l = line.get(t.id);
      return {
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        crest: t.crest_url,
        color: t.color,
        competition,
        followers: followers.get(t.id) ?? 0,
        followed: followedSet.has(t.id),
        rank: l?.rank ?? null,
        points: l?.points ?? null,
        played: l?.played ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function isFollowing(teamId: number): Promise<boolean> {
  return (await getFollowedTeamIds()).includes(teamId);
}
