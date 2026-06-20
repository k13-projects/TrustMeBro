import { NextResponse } from "next/server";
import { assertCronAuth } from "../../_auth";
import { runSoccerNewsIngest } from "@/lib/signals/news/soccer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Headroom over the parallelised ingest (~4s) so a slow feed/Gemini call can't
// trip the platform's default function timeout. Hobby caps at 60s.
export const maxDuration = 60;

// Sweeps ESPN / BBC / Google News (EN+TR) / Turkish sports RSS into soccer_news
// (the /football/news feed), then fills commentary gaps for this week's matches
// with clearly-labelled engine takes. The live sport — no NBA light-mode gate.
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  try {
    const result = await runSoccerNewsIngest({ sinceHours: 24 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
