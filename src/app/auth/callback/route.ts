import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

// Notes on why we build the supabase client inline here instead of using
// the shared createSupabaseServerClient():
//
// The shared helper writes cookies via `cookies()` from next/headers. That
// store auto-attaches to "the" response in most route-handler contexts, but
// when we return our own NextResponse.redirect(...) on Vercel the session
// cookies sometimes fail to ride the redirect — and the user lands back on
// the home page unsigned, looping the OAuth flow.
//
// The fix is the pattern Supabase recommends for the callback specifically:
// build the redirect response first, attach cookies directly to *that*
// response object, then return it. No implicit propagation, no surprises.
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL(next, url));
  }

  const response = NextResponse.redirect(new URL(next, url));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(
      new URL("/login?error=supabase_env_missing", url),
    );
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
    );
  }

  return response;
}
