import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HandleSchema } from "@/lib/bros/handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("handle") ?? "";
  const parsed = HandleSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({
      available: false,
      reason: parsed.error.issues[0]?.message ?? "invalid",
    });
  }
  const handle = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("handle")
    .eq("handle", handle)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    available: !data,
    handle,
  });
}
