import { NextResponse } from "next/server";
import { assertCronAuth } from "../../cron/_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isoDateInProjectTz } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Why this exists: historical rows in `games` were written with `date` taken
// from balldontlie's UTC-anchored field. A 10pm ET tip-off is the *next* day
// in UTC, so games that LA users consider "yesterday's slate" got bucketed
// under today's LA day. ESPN ingestion already does LA anchoring on write,
// but the bad rows persist. This route re-derives every game's date from
// its UTC datetime in LA tz — idempotent, safe to re-run.
//
// Equivalent raw SQL (if you'd rather run it in the Supabase SQL editor):
//   UPDATE games
//   SET date = (datetime AT TIME ZONE 'America/Los_Angeles')::date
//   WHERE datetime IS NOT NULL
//     AND date <> (datetime AT TIME ZONE 'America/Los_Angeles')::date;
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";

  const supabase = supabaseAdmin();

  const PAGE = 1000;
  let scanned = 0;
  let mismatched = 0;
  let updated = 0;
  const sample: Array<{ id: number; old_date: string; new_date: string }> = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("games")
      .select("id, date, datetime")
      .not("datetime", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, scanned, updated },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) break;

    const fixes: Array<{ id: number; date: string }> = [];
    for (const row of data as Array<{ id: number; date: string; datetime: string }>) {
      scanned++;
      const correct = isoDateInProjectTz(row.datetime);
      if (correct !== row.date) {
        mismatched++;
        if (sample.length < 20) {
          sample.push({ id: row.id, old_date: row.date, new_date: correct });
        }
        fixes.push({ id: row.id, date: correct });
      }
    }

    if (!dryRun && fixes.length > 0) {
      // Supabase JS doesn't have a clean bulk-update-by-id; loop per row.
      // The volume is small (a few games per day, only mismatches), so this
      // is fine for a one-off repair.
      for (const f of fixes) {
        const { error: updErr } = await supabase
          .from("games")
          .update({ date: f.date })
          .eq("id", f.id);
        if (updErr) {
          return NextResponse.json(
            { ok: false, error: updErr.message, scanned, updated },
            { status: 500 },
          );
        }
        updated++;
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    scanned,
    mismatched,
    updated,
    sample,
  });
}
