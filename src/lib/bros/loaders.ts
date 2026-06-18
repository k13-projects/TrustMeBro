import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TeamLite } from "@/components/types";
import type { MatchSide, SoccerMarket, Sport } from "@/lib/sports/types";
import type {
  BroDirectoryEntry,
  BroProfile,
  BroStatRow,
  SharedCoupon,
  SharedCouponSoccerPick,
} from "./types";
import { isOnline } from "./presence";

type CouponRow = {
  id: string;
  user_id: string;
  mode: "power" | "flex";
  pick_count: number;
  stake: number | string;
  payout_multiplier: number | string;
  potential_payout: number | string;
  status: "pending" | "won" | "lost" | "void";
  result_payout: number | string | null;
  shared_at: string | null;
  settled_at: string | null;
  created_at: string;
  picks: Array<{
    pick_order: number;
    prediction:
      | {
          id: string;
          game_id: number;
          market: string;
          line: number;
          pick: "over" | "under";
          status: "pending" | "won" | "lost" | "void";
          result_value: number | null;
          player:
            | {
                id: number;
                first_name: string;
                last_name: string;
                team_id: number | null;
              }
            | Array<{
                id: number;
                first_name: string;
                last_name: string;
                team_id: number | null;
              }>
            | null;
        }
      | Array<{
          id: string;
          game_id: number;
          market: string;
          line: number;
          pick: "over" | "under";
          status: "pending" | "won" | "lost" | "void";
          result_value: number | null;
          player: unknown;
        }>
      | null;
  }>;
};

type SoccerTeamLite = { name: string; abbreviation: string };

type RawSoccerPred = {
  id: string;
  market: SoccerMarket;
  side: MatchSide;
  line: number | string | null;
  status: "pending" | "won" | "lost" | "void";
  soccer_matches:
    | {
        home: SoccerTeamLite | SoccerTeamLite[] | null;
        away: SoccerTeamLite | SoccerTeamLite[] | null;
      }
    | {
        home: SoccerTeamLite | SoccerTeamLite[] | null;
        away: SoccerTeamLite | SoccerTeamLite[] | null;
      }[]
    | null;
};

type SoccerCouponRow = {
  id: string;
  user_id: string;
  mode: "power" | "flex";
  pick_count: number;
  stake: number | string;
  payout_multiplier: number | string;
  potential_payout: number | string;
  status: "pending" | "won" | "lost" | "void";
  result_payout: number | string | null;
  shared_at: string | null;
  settled_at: string | null;
  created_at: string;
  legs: Array<{
    pick_order: number;
    prediction: RawSoccerPred | RawSoccerPred[] | null;
  }>;
};

const NBA_COUPON_SELECT = `id, user_id, mode, pick_count, stake, payout_multiplier, potential_payout,
   status, result_payout, shared_at, settled_at, created_at,
   picks:user_coupon_picks(pick_order,
     prediction:predictions(id, game_id, market, line, pick, status, result_value,
       player:players(id, first_name, last_name, team_id)))`;

const SOCCER_COUPON_SELECT = `id, user_id, mode, pick_count, stake, payout_multiplier, potential_payout,
   status, result_payout, shared_at, settled_at, created_at,
   legs:soccer_coupon_legs(pick_order,
     prediction:soccer_predictions(id, market, side, line, status,
       soccer_matches(
         home:soccer_teams!soccer_matches_home_team_id_fkey(name, abbreviation),
         away:soccer_teams!soccer_matches_away_team_id_fkey(name, abbreviation))))`;

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function normalizeCoupon(row: CouponRow, owner: BroProfile): SharedCoupon {
  const picks = row.picks
    .map((p) => {
      const pred = Array.isArray(p.prediction)
        ? (p.prediction[0] ?? null)
        : p.prediction;
      if (!pred) {
        return { pick_order: p.pick_order, prediction: null };
      }
      const playerRaw = (pred as { player: unknown }).player;
      const player = Array.isArray(playerRaw)
        ? (playerRaw[0] ?? null)
        : (playerRaw ?? null);
      return {
        pick_order: p.pick_order,
        prediction: {
          id: pred.id,
          game_id: pred.game_id,
          market: pred.market,
          line: pred.line,
          pick: pred.pick,
          status: pred.status,
          result_value: pred.result_value,
          player: player as {
            id: number;
            first_name: string;
            last_name: string;
            team_id: number | null;
          } | null,
        },
      };
    })
    .sort((a, b) => a.pick_order - b.pick_order);

  return {
    sport: "nba",
    id: row.id,
    user_id: row.user_id,
    mode: row.mode,
    pick_count: row.pick_count,
    stake: row.stake,
    payout_multiplier: row.payout_multiplier,
    potential_payout: row.potential_payout,
    status: row.status,
    result_payout: row.result_payout,
    shared_at: row.shared_at,
    settled_at: row.settled_at,
    created_at: row.created_at,
    owner,
    picks,
  };
}

function normalizeSoccerCoupon(
  row: SoccerCouponRow,
  owner: BroProfile,
): SharedCoupon {
  const picks: SharedCouponSoccerPick[] = row.legs
    .map((l) => {
      const pred = one(l.prediction);
      if (!pred) return { pick_order: l.pick_order, prediction: null };
      const match = one(pred.soccer_matches);
      const home = one(match?.home ?? null);
      const away = one(match?.away ?? null);
      return {
        pick_order: l.pick_order,
        prediction: {
          id: pred.id,
          market: pred.market,
          side: pred.side,
          line: pred.line === null ? null : Number(pred.line),
          status: pred.status,
          home: home?.name ?? "Home",
          away: away?.name ?? "Away",
          home_abbr: home?.abbreviation ?? "",
          away_abbr: away?.abbreviation ?? "",
        },
      };
    })
    .sort((a, b) => a.pick_order - b.pick_order);

  return {
    sport: "soccer",
    id: row.id,
    user_id: row.user_id,
    mode: row.mode,
    pick_count: row.pick_count,
    stake: row.stake,
    payout_multiplier: row.payout_multiplier,
    potential_payout: row.potential_payout,
    status: row.status,
    result_payout: row.result_payout,
    shared_at: row.shared_at,
    settled_at: row.settled_at,
    created_at: row.created_at,
    owner,
    picks,
  };
}

async function attachOwners(
  rows: Array<{ user_id: string }>,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Map<string, BroProfile>> {
  const ownerIds = Array.from(new Set(rows.map((r) => r.user_id)));
  if (ownerIds.length === 0) return new Map();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name, bio, avatar_url")
    .in("user_id", ownerIds);
  if (error) throw new Error(`load profiles: ${error.message}`);
  const byId = new Map<string, BroProfile>();
  for (const p of (profiles ?? []) as BroProfile[]) byId.set(p.user_id, p);
  return byId;
}

export async function loadFeedCoupons(opts: {
  sport: Sport;
  followerId?: string | null;
  limit?: number;
}): Promise<SharedCoupon[]> {
  const limit = opts.limit ?? 30;
  const supabase = await createSupabaseServerClient();

  let userIds: string[] | null = null;
  if (opts.followerId) {
    const { data: follows } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", opts.followerId);
    userIds = (follows ?? []).map((f) => f.followee_id);
    if (userIds.length === 0) return [];
  }

  const select =
    opts.sport === "soccer" ? SOCCER_COUPON_SELECT : NBA_COUPON_SELECT;
  let q = supabase
    .from("user_coupons")
    .select(select)
    .eq("is_public", true)
    .eq("sport", opts.sport)
    .order("shared_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (userIds) q = q.in("user_id", userIds);

  const { data: couponsRaw, error } = await q;
  if (error) throw new Error(`load feed coupons: ${error.message}`);
  const rows = (couponsRaw ?? []) as unknown as Array<{ user_id: string }>;
  if (rows.length === 0) return [];

  const profileById = await attachOwners(rows, supabase);

  return rows
    .map((row) => {
      const owner = profileById.get(row.user_id);
      if (!owner) return null;
      return opts.sport === "soccer"
        ? normalizeSoccerCoupon(row as unknown as SoccerCouponRow, owner)
        : normalizeCoupon(row as unknown as CouponRow, owner);
    })
    .filter((c): c is SharedCoupon => c !== null);
}

export async function collectTeams(
  coupons: SharedCoupon[],
): Promise<Map<number, TeamLite>> {
  // Only NBA legs carry NBA team ids; soccer legs render their own abbreviations.
  const teamIds = Array.from(
    new Set(
      coupons
        .filter(
          (c): c is Extract<SharedCoupon, { sport: "nba" }> =>
            c.sport === "nba",
        )
        .flatMap((c) =>
          c.picks
            .map((p) => p.prediction?.player?.team_id ?? null)
            .filter((id): id is number => id !== null),
        ),
    ),
  );
  if (teamIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, abbreviation, full_name")
    .in("id", teamIds);
  return new Map<number, TeamLite>(
    ((teams ?? []) as TeamLite[]).map((t) => [t.id, t]),
  );
}

export async function loadProfileByHandle(
  handle: string,
): Promise<BroProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name, bio, avatar_url")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`load profile: ${error.message}`);
  return (data as BroProfile | null) ?? null;
}

export async function loadProfileByUserId(
  userId: string,
): Promise<BroProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name, bio, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`load profile by user_id: ${error.message}`);
  return (data as BroProfile | null) ?? null;
}

export async function loadBroStats(
  userId: string,
  sport: Sport,
): Promise<BroStatRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bro_stats")
    .select(
      "user_id, settled, wins, losses, voids, pending, net_units, score, last_win_at, last_shared_at",
    )
    .eq("user_id", userId)
    .eq("sport", sport)
    .maybeSingle();
  if (error) throw new Error(`load bro stats: ${error.message}`);
  return (data as BroStatRow | null) ?? null;
}

export async function loadProfileCoupons(
  userId: string,
  sport: Sport,
): Promise<SharedCoupon[]> {
  const supabase = await createSupabaseServerClient();
  const select = sport === "soccer" ? SOCCER_COUPON_SELECT : NBA_COUPON_SELECT;
  const { data: couponsRaw, error } = await supabase
    .from("user_coupons")
    .select(select)
    .eq("is_public", true)
    .eq("sport", sport)
    .eq("user_id", userId)
    .order("shared_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) throw new Error(`load profile coupons: ${error.message}`);

  const profile = await loadProfileByUserId(userId);
  if (!profile) return [];
  const rows = (couponsRaw ?? []) as unknown as Array<{ user_id: string }>;
  return rows.map((row) =>
    sport === "soccer"
      ? normalizeSoccerCoupon(row as unknown as SoccerCouponRow, profile)
      : normalizeCoupon(row as unknown as CouponRow, profile),
  );
}

export async function loadFollowState(
  followerId: string,
  followeeId: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId)
    .maybeSingle();
  return !!data;
}

export async function listBros(opts: {
  sport: Sport;
  viewerUserId?: string | null;
  limit?: number;
}): Promise<BroDirectoryEntry[]> {
  const limit = opts.limit ?? 60;
  const supabase = await createSupabaseServerClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name, bio, avatar_url, last_seen_at")
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`list bros: ${error.message}`);

  type ProfileRow = BroProfile & { last_seen_at: string | null };
  const rows = (profiles ?? []) as ProfileRow[];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);

  const [statsRes, followsRes] = await Promise.all([
    supabase
      .from("bro_stats")
      .select("user_id, wins, losses, score")
      .eq("sport", opts.sport)
      .in("user_id", userIds),
    opts.viewerUserId
      ? supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", opts.viewerUserId)
          .in("followee_id", userIds)
      : Promise.resolve({ data: [] as { followee_id: string }[] }),
  ]);

  const statsByUser = new Map<
    string,
    { wins: number; losses: number; score: number }
  >();
  for (const s of (statsRes.data ?? []) as Array<{
    user_id: string;
    wins: number | string;
    losses: number | string;
    score: number | string;
  }>) {
    statsByUser.set(s.user_id, {
      wins: Number(s.wins ?? 0),
      losses: Number(s.losses ?? 0),
      score: Number(s.score ?? 0),
    });
  }
  const followingIds = new Set<string>(
    ((followsRes.data ?? []) as Array<{ followee_id: string }>).map(
      (f) => f.followee_id,
    ),
  );

  return rows.map((row) => {
    const stat = statsByUser.get(row.user_id) ?? {
      wins: 0,
      losses: 0,
      score: 0,
    };
    return {
      profile: {
        user_id: row.user_id,
        handle: row.handle,
        display_name: row.display_name,
        bio: row.bio,
        avatar_url: row.avatar_url,
      },
      last_seen_at: row.last_seen_at,
      is_online: isOnline(row.last_seen_at),
      wins: stat.wins,
      losses: stat.losses,
      score: stat.score,
      is_following: followingIds.has(row.user_id),
      is_self: opts.viewerUserId === row.user_id,
    };
  });
}

export async function loadFollowCounts(
  userId: string,
): Promise<{ followers: number; following: number }> {
  const supabase = await createSupabaseServerClient();
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("followee_id", userId),
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", userId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}
