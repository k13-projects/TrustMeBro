import type { BetStatus } from "@/lib/analysis/types";

export type BroProfile = {
  user_id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
};

export type BroDirectoryEntry = {
  profile: BroProfile;
  last_seen_at: string | null;
  is_online: boolean;
  wins: number;
  losses: number;
  is_following: boolean;
  is_self: boolean;
};

export type BroStatRow = {
  user_id: string;
  settled: number;
  wins: number;
  losses: number;
  voids: number;
  pending: number;
  net_units: number | string;
  last_win_at: string | null;
  last_shared_at: string | null;
};

export type SharedCouponPickPlayer = {
  id: number;
  first_name: string;
  last_name: string;
  team_id: number | null;
};

export type SharedCouponPick = {
  pick_order: number;
  prediction: {
    id: string;
    game_id: number;
    market: string;
    line: number;
    pick: "over" | "under";
    player: SharedCouponPickPlayer | null;
  } | null;
};

export type SharedCoupon = {
  id: string;
  user_id: string;
  mode: "power" | "flex";
  pick_count: number;
  stake: number | string;
  payout_multiplier: number | string;
  potential_payout: number | string;
  status: BetStatus;
  result_payout: number | string | null;
  shared_at: string | null;
  settled_at: string | null;
  created_at: string;
  owner: BroProfile;
  picks: SharedCouponPick[];
};
