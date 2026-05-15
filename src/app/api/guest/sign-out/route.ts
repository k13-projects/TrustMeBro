import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GUEST_COOKIE } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
  // Mirror the signout route: redirect home so this works as a plain <form>.
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
