import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Service-role Supabase client — bypasses RLS.
 * USE ONLY in trusted server contexts: cron routes, admin tools, server
 * actions that intentionally write engine-owned tables (predictions,
 * player_game_stats, signals, etc.).
 *
 * Never import this from a Server Component that renders for end users
 * unless you've already gated the request.
 */
export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
