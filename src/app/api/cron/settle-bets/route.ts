import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";
import { settlePending } from "@/lib/scoring/settle";
import { settleCoupons } from "@/lib/scoring/settle-coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  try {
    const predictions = await settlePending();
    const coupons = await settleCoupons();
    return NextResponse.json({ ok: true, predictions, coupons });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
