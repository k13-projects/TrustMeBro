import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  return NextResponse.json({
    ok: true,
    message: "scrape-news not implemented yet",
    todo: [
      "Fetch from configured sources (ESPN, Bleacher, NBA.com, etc.)",
      "Run named-entity recognition to tag player/team",
      "Score sentiment",
      "Upsert into signals with unique (source, source_id)",
    ],
  });
}
