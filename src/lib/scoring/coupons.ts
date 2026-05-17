import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

// Leg-aware score for one coupon, matching the bro_stats matview math
// (migration 0014). Exported so the engine ledger UI can compute the same
// number off the raw rows without round-tripping the matview.
//
//   any lost leg → -legs_lost (penalty by number of misses)
//   else  hits=0 → 0          (everything voided / pushed)
//   else         → +legs_won  (Power-style "all hit" bonus)
export function couponScore(legsWon: number, legsLost: number): number {
  if (legsLost > 0) return -legsLost;
  if (legsWon === 0) return 0;
  return legsWon;
}

export type CouponLegCountBreakdown = {
  pick_count: number;
  total: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  voids: number;
  score: number;
};

export type CouponLedger = {
  total: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  voids: number;
  score: number;
  per_pick_count: CouponLegCountBreakdown[];
  recent: CouponLedgerRow[];
};

export type CouponLedgerRow = {
  coupon_id: string;
  pick_count: number;
  mode: "power" | "flex";
  status: "pending" | "won" | "lost" | "void";
  legs_won: number;
  legs_lost: number;
  score: number;
  settled_at: string | null;
  shared_at: string | null;
  user: {
    user_id: string;
    handle: string | null;
    display_name: string | null;
  } | null;
};

type RawCoupon = {
  id: string;
  user_id: string | null;
  pick_count: number;
  mode: "power" | "flex";
  status: "pending" | "won" | "lost" | "void";
  is_public: boolean;
  shared_at: string | null;
  settled_at: string | null;
  picks: Array<{
    prediction: { status: "pending" | "won" | "lost" | "void" } | null;
  }>;
};

/**
 * Aggregate public-coupon performance across every bro, broken down by
 * pick_count. Used on /score to show 2x/3x/4x/5x/6x columns side-by-side
 * with the engine ledger.
 *
 * Uses service-role because the page is public and we want to avoid
 * RLS overhead on the join — every coupon involved here has is_public
 * set so the data is already public anyway.
 */
export async function getCouponLedger(opts?: {
  recentLimit?: number;
}): Promise<CouponLedger> {
  const supabase = supabaseAdmin();
  const recentLimit = opts?.recentLimit ?? 15;

  const { data, error } = await supabase
    .from("user_coupons")
    .select(
      `id, user_id, pick_count, mode, status, is_public, shared_at, settled_at,
       picks:user_coupon_picks(prediction:predictions(status))`,
    )
    .eq("is_public", true)
    .not("user_id", "is", null)
    .order("shared_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(`getCouponLedger: ${error.message}`);

  const rows = (data ?? []) as unknown as RawCoupon[];

  // Owner profiles for the recent feed.
  const ownerIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  );
  const profileById = new Map<
    string,
    { user_id: string; handle: string; display_name: string }
  >();
  if (ownerIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, handle, display_name")
      .in("user_id", ownerIds);
    for (const p of (profs ?? []) as Array<{
      user_id: string;
      handle: string;
      display_name: string;
    }>) {
      profileById.set(p.user_id, p);
    }
  }

  // Per-pick-count buckets (2..6).
  const buckets = new Map<number, CouponLegCountBreakdown>();
  function bucket(pc: number): CouponLegCountBreakdown {
    let b = buckets.get(pc);
    if (!b) {
      b = {
        pick_count: pc,
        total: 0,
        settled: 0,
        pending: 0,
        wins: 0,
        losses: 0,
        voids: 0,
        score: 0,
      };
      buckets.set(pc, b);
    }
    return b;
  }

  const totals: CouponLedger = {
    total: 0,
    settled: 0,
    pending: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    score: 0,
    per_pick_count: [],
    recent: [],
  };

  const recentRows: CouponLedgerRow[] = [];

  for (const c of rows) {
    const b = bucket(c.pick_count);
    b.total += 1;
    totals.total += 1;

    if (c.status === "pending") {
      b.pending += 1;
      totals.pending += 1;
      continue;
    }
    b.settled += 1;
    totals.settled += 1;

    const picks = c.picks ?? [];
    let legsWon = 0;
    let legsLost = 0;
    for (const p of picks) {
      const pred = Array.isArray(p.prediction) ? p.prediction[0] : p.prediction;
      const status = pred?.status;
      if (status === "won") legsWon += 1;
      else if (status === "lost") legsLost += 1;
    }
    const score = couponScore(legsWon, legsLost);
    b.score += score;
    totals.score += score;

    if (c.status === "won") {
      b.wins += 1;
      totals.wins += 1;
    } else if (c.status === "lost") {
      b.losses += 1;
      totals.losses += 1;
    } else if (c.status === "void") {
      b.voids += 1;
      totals.voids += 1;
    }

    if (recentRows.length < recentLimit) {
      recentRows.push({
        coupon_id: c.id,
        pick_count: c.pick_count,
        mode: c.mode,
        status: c.status,
        legs_won: legsWon,
        legs_lost: legsLost,
        score,
        settled_at: c.settled_at,
        shared_at: c.shared_at,
        user: c.user_id
          ? {
              user_id: c.user_id,
              handle: profileById.get(c.user_id)?.handle ?? null,
              display_name: profileById.get(c.user_id)?.display_name ?? null,
            }
          : null,
      });
    }
  }

  totals.per_pick_count = Array.from(buckets.values()).sort(
    (a, b) => a.pick_count - b.pick_count,
  );
  totals.recent = recentRows;
  return totals;
}
