import { NextResponse } from "next/server";

/**
 * Cron endpoints must be invoked either by Vercel Cron (which sends a
 * `Authorization: Bearer <CRON_SECRET>` header) or by a logged-in admin.
 * Until auth lands, the shared secret is the only gate.
 */
export function assertCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
