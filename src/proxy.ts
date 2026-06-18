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

  // The bare root "/" → /football default-sport bounce used to live here, but
  // a cookie set by the sport-toggle Server Action isn't visible to edge
  // middleware on the redirect it issues, so toggling to NBA got bounced
  // straight back to /football. The gate now lives in the root page
  // (src/app/page.tsx), where the freshly-set cookie is reliably readable.

  const response = NextResponse.next({ request });

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
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the Supabase session cookie so RLS-bound queries in Server
  // Components and Route Handlers see a valid user.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
