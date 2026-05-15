import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redditFetcher } from "@/lib/signals/social/reddit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const since = new Date(Date.now() - 2 * 3600 * 1000);

  try {
    const signals = await redditFetcher.fetch(since);
    if (signals.length === 0) {
      return NextResponse.json({ ok: true, source: "reddit", inserted: 0 });
    }

    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("signals")
      .upsert(signals, { onConflict: "source,source_id" });
    if (error) throw new Error(`upsert signals: ${error.message}`);

    return NextResponse.json({
      ok: true,
      source: "reddit",
      inserted: signals.length,
      since: since.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
