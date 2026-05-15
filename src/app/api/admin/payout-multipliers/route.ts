import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCronAuth } from "../../cron/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RowSchema = z.object({
  pick_count: z.number().int().min(2).max(6),
  power_payout: z.number().positive().nullable().optional(),
  flex_payout: z.number().positive().nullable().optional(),
  source: z.string().max(40).optional(),
  notes: z.string().max(280).optional(),
});

const BodySchema = z.union([
  RowSchema,
  z.object({ rows: z.array(RowSchema).min(1) }),
]);

export async function PATCH(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const rows = "rows" in parsed.data ? parsed.data.rows : [parsed.data];
  const verified_at = new Date().toISOString();

  const supabase = supabaseAdmin();
  const upsertRows = rows.map((r) => ({
    pick_count: r.pick_count,
    power_payout: r.power_payout ?? null,
    flex_payout: r.flex_payout ?? null,
    source: r.source ?? "prizepicks",
    notes: r.notes ?? null,
    verified_at,
  }));
  const { error } = await supabase
    .from("payout_multipliers")
    .upsert(upsertRows, { onConflict: "pick_count" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: rows.length, verified_at });
}

// GET is intentionally not exported here.
// Use `/api/payout-multipliers` instead — same data, anon client + RLS-public
// read policy, revalidate=300. This file is for admin writes only.
