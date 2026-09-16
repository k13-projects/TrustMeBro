import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../../_auth";
import {
  isCompetition,
  liveCompetitions,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";
import { runSoccerNewsIngest } from "@/lib/signals/news/soccer";
import { runCronJob } from "@/lib/ingest/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Headroom over the parallelised ingest (~4s) so a slow feed/Gemini call can't
// trip the platform's default function timeout. Hobby caps at 60s.
export const maxDuration = 60;

const QuerySchema = z.object({ competition: z.string().optional() });

// Sweeps ESPN / BBC / Google News (EN+TR) / Turkish sports RSS into soccer_news
// for every LIVE competition (the /football/news feed), then fills commentary
// gaps for this week's matches with clearly-labelled engine takes.
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  let competitions: SoccerCompetition[];
  if (parsed.success && parsed.data.competition) {
    if (!isCompetition(parsed.data.competition)) {
      return NextResponse.json({ error: "unknown competition" }, { status: 400 });
    }
    competitions = [parsed.data.competition];
  } else {
    competitions = liveCompetitions();
  }

  const outcome = await runCronJob("soccer/scrape-news", async () => {
    const results: Record<string, unknown> = {};
    for (const competition of competitions) {
      results[competition] = await runSoccerNewsIngest({ competition, sinceHours: 24 });
    }
    return { competitions: results };
  });

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...outcome.summary });
}
