"use client";

import { createBrowserClient } from "@supabase/ssr";

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }
  // detectSessionInUrl: false — by default the client auto-exchanges any
  // ?code=... it sees on construction (PKCE auto-detection in
  // @supabase/auth-js _initialize). That collided with our explicit
  // exchangeCodeForSession() in /auth/callback: the auto-call consumed the
  // PKCE verifier first, then our call failed with "PKCE code verifier not
  // found in storage". Disabling the auto-detect leaves the verifier intact
  // for the explicit call and gives us a single, debuggable code path.
  _client = createBrowserClient(url, anonKey, {
    auth: {
      detectSessionInUrl: false,
    },
  });
  return _client;
}
