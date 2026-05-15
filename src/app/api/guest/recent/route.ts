import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET() {
  // Public discovery — RLS policy on guest_profiles allows select to all.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("guest_profiles")
    .select("display_name, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ profiles: data ?? [] });
}
