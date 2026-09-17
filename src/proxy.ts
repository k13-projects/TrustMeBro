import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// High-volume indexing / AI-scraping crawlers. These were ~95% of our traffic
// (Baiduspider, Googlebot, OpenAI) and drained the Vercel free tier. We hard
// 403 them at the edge so they cost ~0 bytes instead of a full page render,
// and don't wait for robots.txt to be re-read. Social link-unfurl bots
// (facebookexternalhit, Twitterbot, Slackbot, Discordbot, …) are deliberately
// NOT here so shared Bro Board links still get rich previews.
const BLOCKED_BOTS =
  /(baiduspider|googlebot|bingbot|yandex(bot)?|gptbot|oai-searchbot|chatgpt-user|ccbot|claudebot|anthropic-ai|claude-web|bytespider|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|amazonbot|applebot|perplexitybot|dataforseobot|meta-externalagent|imagesiftbot|seznambot|google-extended)/i;

export async function proxy(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (BLOCKED_BOTS.test(ua)) {
    return new NextResponse("Not available to crawlers.", {
      status: 403,
      headers: { "x-robots-tag": "noindex, nofollow" },
    });
  }

  // Default-sport routing for the bare root "/". "/" is the NBA home; anyone
  // whose active sport isn't NBA (the football default, or an explicit
  // football choice) is sent to /football. This MUST live here, not in the
  // page: a page-level redirect() loses to the already-streaming layout shell
  // and silently no-ops, so "/" was serving NBA content under football chrome.
  // Middleware runs before any render, so the redirect is real. The toggle
  // sets the cookie via a Server Action then navigates to "/"; that navigation
  // carries the freshly-set cookie, so a just-toggled NBA user is read as "nba"
  // here and correctly stays on "/".
  if (request.nextUrl.pathname === "/") {
    const sport = request.cookies.get("tmb_sport")?.value;
    if (sport !== "nba") {
      return NextResponse.redirect(new URL("/football", request.url));
    }
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  // No Supabase auth cookie ⇒ no session to refresh. Skipping the getUser()
  // round-trip here keeps anonymous traffic from making a network call to
  // Supabase on every single page request.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (!hasAuthCookie) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Rebuild the response AFTER mutating the request cookies. This line
        // is the whole fix for "why am I logged out again".
        //
        // `NextResponse.next({ request })` captures the request headers at the
        // moment it is called (proxy.md is explicit: `{ request: { headers } }`
        // is what forwards headers upstream). The response here was built
        // before the refresh, so mutating `request.cookies` afterwards never
        // reached the render — only the browser got the new cookies.
        //
        // That split is what logged people out. Refreshing rotates the token
        // and REVOKES the old one. The render then ran with the stale cookies,
        // called getUser() with the dead access token, and tried to refresh
        // using the refresh token that had just been revoked. Supabase treats
        // a revoked-token reuse as compromise and kills the session family, so
        // an ordinary visit an hour after the last one signed you out — and
        // the sessions table shows exactly that shape: 52 revoked tokens
        // against 5 live ones.
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the Supabase session cookie so RLS-bound queries in Server
  // Components and Route Handlers see a valid user. This is the only place
  // allowed to refresh: a Server Component cannot write cookies (see the
  // swallowed catch in lib/supabase/server.ts), so if the refresh happened
  // there the rotated token would be lost and the session would break.
  const { error } = await supabase.auth.getUser();
  // A session dying is otherwise completely silent: the visitor just finds
  // themselves signed out and we hear about it from them, which is how this
  // bug survived. An auth cookie was present, so an error here means the
  // session really failed rather than the visitor simply being anonymous.
  if (error) {
    console.error(
      `[auth] session refresh failed on ${request.nextUrl.pathname}: ${error.message}`,
    );
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
