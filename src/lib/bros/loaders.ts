import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TeamLite } from "@/components/types";
import type { BroProfile, BroStatRow, SharedCoupon } from "./types";

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
          player: unknown;
        }>
      | null;
  }>;
};

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
          player: player as SharedCoupon["picks"][number]["prediction"] extends
            | { player: infer P }
            | null
            ? P
            : never,
        },
      };
    })
    .sort((a, b) => a.pick_order - b.pick_order);

  return {
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

export async function loadFeedCoupons(opts: {
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

  let q = supabase
    .from("user_coupons")
    .select(
      `id, user_id, mode, pick_count, stake, payout_multiplier, potential_payout,
       status, result_payout, shared_at, settled_at, created_at,
       picks:user_coupon_picks(pick_order,
         prediction:predictions(id, game_id, market, line, pick,
           player:players(id, first_name, last_name, team_id)))`,
    )
    .eq("is_public", true)
    .order("shared_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (userIds) {
    q = q.in("user_id", userIds);
  }

  const { data: couponsRaw, error } = await q;
  if (error) throw new Error(`load feed coupons: ${error.message}`);
  const rows = (couponsRaw ?? []) as unknown as CouponRow[];
  if (rows.length === 0) return [];

  const ownerIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name, bio, avatar_url")
    .in("user_id", ownerIds);
  if (pErr) throw new Error(`load profiles: ${pErr.message}`);
  const profileById = new Map<string, BroProfile>();
  for (const p of (profiles ?? []) as BroProfile[]) {
    profileById.set(p.user_id, p);
  }

  return rows
    .map((row) => {
      const owner = profileById.get(row.user_id);
      if (!owner) return null;
      return normalizeCoupon(row, owner);
    })
    .filter((c): c is SharedCoupon => c !== null);
}

export async function collectTeams(
  coupons: SharedCoupon[],
): Promise<Map<number, TeamLite>> {
  const teamIds = Array.from(
    new Set(
      coupons.flatMap((c) =>
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
): Promise<BroStatRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bro_stats")
    .select(
      "user_id, settled, wins, losses, voids, pending, net_units, last_win_at, last_shared_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`load bro stats: ${error.message}`);
  return (data as BroStatRow | null) ?? null;
}

export async function loadProfileCoupons(
  userId: string,
): Promise<SharedCoupon[]> {
  const supabase = await createSupabaseServerClient();
  const { data: couponsRaw, error } = await supabase
    .from("user_coupons")
    .select(
      `id, user_id, mode, pick_count, stake, payout_multiplier, potential_payout,
       status, result_payout, shared_at, settled_at, created_at,
       picks:user_coupon_picks(pick_order,
         prediction:predictions(id, game_id, market, line, pick,
           player:players(id, first_name, last_name, team_id)))`,
    )
    .eq("is_public", true)
    .eq("user_id", userId)
    .order("shared_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) throw new Error(`load profile coupons: ${error.message}`);

  const profile = await loadProfileByUserId(userId);
  if (!profile) return [];
  const rows = (couponsRaw ?? []) as unknown as CouponRow[];
  return rows.map((row) => normalizeCoupon(row, profile));
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
