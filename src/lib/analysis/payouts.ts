import "server-only";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const payoutRowSchema = z.object({
  pick_count: z.number().int(),
  power_payout: z.number().nullable(),
  flex_payout: z.number().nullable(),
  source: z.string(),
  verified_at: z.string(),
});

export type PayoutRow = z.infer<typeof payoutRowSchema>;

export type PayoutMap = {
  rows: PayoutRow[];
  byCount: Record<number, PayoutRow>;
  latestVerifiedAt: string | null;
};

// Mirrors src/db/migrations/0007_user_coupons.sql seed values. Used only if
// the DB read fails or the table hasn't been migrated yet, so a brand-new
// dev machine still renders combos correctly.
const FALLBACK_POWER: Record<number, number> = {
  2: 3,
  3: 5,
  4: 10,
  5: 20,
  6: 37.5,
};
const FALLBACK_FLEX: Record<number, number | null> = {
  2: null,
  3: 2.25,
  4: 5,
  5: 10,
  6: 25,
};

export function fallbackPayoutMap(): PayoutMap {
  const rows: PayoutRow[] = [2, 3, 4, 5, 6].map((n) => ({
    pick_count: n,
    power_payout: FALLBACK_POWER[n] ?? null,
    flex_payout: FALLBACK_FLEX[n] ?? null,
    source: "fallback",
    verified_at: new Date(0).toISOString(),
  }));
  return toMap(rows, null);
}

function toMap(rows: PayoutRow[], verified: string | null): PayoutMap {
  return {
    rows,
    byCount: Object.fromEntries(rows.map((r) => [r.pick_count, r])),
    latestVerifiedAt: verified,
  };
}

export async function loadPayoutMap(): Promise<PayoutMap> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payout_multipliers")
    .select("pick_count, power_payout, flex_payout, source, verified_at")
    .order("pick_count");
  if (error || !data || data.length === 0) return fallbackPayoutMap();
  const parsed = z.array(payoutRowSchema).safeParse(data);
  if (!parsed.success) return fallbackPayoutMap();
  const rows = parsed.data;
  const latest = rows.reduce<string | null>(
    (acc, r) => (acc && acc > r.verified_at ? acc : r.verified_at),
    null,
  );
  return toMap(rows, latest);
}

export function powerPayoutFrom(map: PayoutMap, pickCount: number): number | null {
  return map.byCount[pickCount]?.power_payout ?? null;
}

export function flexPayoutFrom(map: PayoutMap, pickCount: number): number | null {
  return map.byCount[pickCount]?.flex_payout ?? null;
}
