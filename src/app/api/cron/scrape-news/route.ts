import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redditFetcher } from "@/lib/signals/social/reddit";
import { runNewsIngest } from "@/lib/signals/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sweeps:
// 1. Reddit signals -> `signals` table (engine input).
// 2. RSS + NewsAPI + Gemini engine-take fallbacks -> `news_items` (user-facing /news feed).
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const since = new Date(Date.now() - 2 * 3600 * 1000);

  const redditResult = await (async () => {
    try {
      const signals = await redditFetcher.fetch(since);
      if (signals.length === 0) return { ok: true, inserted: 0 };
      const supabase = supabaseAdmin();
      const { error } = await supabase
        .from("signals")
        .upsert(signals, { onConflict: "source,source_id" });
      if (error) throw new Error(`signals upsert: ${error.message}`);
      return { ok: true, inserted: signals.length };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })();

  const newsResult = await (async () => {
    try {
      return { ok: true, ...(await runNewsIngest({ sinceHours: 24 })) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })();

  return NextResponse.json({
    ok: true,
    since: since.toISOString(),
    reddit: redditResult,
    news: newsResult,
  });
}
