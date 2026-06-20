import type { Metadata } from "next";
import {
  Anton,
  Archivo_Black,
  Bowlby_One,
  Geist,
  Geist_Mono,
  Permanent_Marker,
} from "next/font/google";
import "./globals.css";
import { CartShell } from "@/components/cart/CartShell";
import { ChatLauncher } from "@/components/chat/ChatLauncher";
import { Footer } from "@/components/site/Footer";
import { MarqueeTicker } from "@/components/site/MarqueeTicker";
import { Navbar } from "@/components/site/Navbar";
import { ScrollProgress } from "@/components/site/ScrollProgress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { getRequester } from "@/lib/identity";
import { getEngineStats, getSoccerEngineStats } from "@/lib/scoring/stats";
import { touchProfilePresence } from "@/lib/bros/presence";
import { activeSport } from "@/lib/sports/sport-cookie";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  weight: "400",
  subsets: ["latin"],
});

const permanentMarker = Permanent_Marker({
  variable: "--font-permanent-marker",
  weight: "400",
  subsets: ["latin"],
});

const bowlbyOne = Bowlby_One({
  variable: "--font-brush",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustMeBro — In Data We Trust",
  description:
    "Data-driven sports analysis and picks built to make you a winner. Stop guessing. Start winning.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [requester, sport] = await Promise.all([getRequester(), activeSport()]);
  // Engine stats follow the active sport so the marquee never shows NBA numbers
  // on football pages (and vice versa). Ledgers are fully separate.
  const engineStats =
    sport === "soccer" ? await getSoccerEngineStats() : await getEngineStats();
  const isSignedIn = !!requester;

  if (requester?.kind === "auth") {
    // Rate-limited inside the helper — fine to call on every render.
    await touchProfilePresence(requester.user_id);
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${geistSans.variable} ${geistMono.variable} ${anton.variable} ${archivoBlack.variable} ${permanentMarker.variable} ${bowlbyOne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>

        <TooltipProvider delay={150}>
          <ScrollProgress />
          <MarqueeTicker stats={engineStats} sport={sport} />
          <Navbar
            sport={sport}
            identity={
              requester
                ? {
                    kind: requester.kind,
                    display_name: requester.display_name,
                  }
                : null
            }
          />

          <CartShell isSignedIn={isSignedIn}>
            <main id="main" className="relative z-10 flex-1">
              {children}
            </main>
            <Footer />
            <ChatLauncher sport={sport} />
          </CartShell>

          <Toaster />
        </TooltipProvider>

        {/* Reusable SVG filter for the .sticker-headshot outline. Defined
            once here so every sticker on every page can apply it via
            `filter: url(#sticker-outline)`. Hidden from layout and from
            assistive tech. Replaces a 9-chain CSS drop-shadow stack that
            was the dominant scroll-paint cost in the combos region. */}
        <svg
          aria-hidden
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            pointerEvents: "none",
          }}
        >
          <defs>
            <filter
              id="sticker-outline"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              {/* Drop shadow at the back: blur of alpha, offset down,
                  scaled to 55% opacity. */}
              <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
              <feOffset dx="0" dy="12" />
              <feComponentTransfer result="shadow">
                <feFuncA type="linear" slope="0.55" />
              </feComponentTransfer>

              {/* Gold ring: dilate alpha by 2px, fill with brand gold. */}
              <feMorphology
                operator="dilate"
                radius="2"
                in="SourceAlpha"
                result="goldShape"
              />
              <feFlood floodColor="#FFB800" />
              <feComposite operator="in" in2="goldShape" result="goldRing" />

              {/* White ring inside the gold: dilate by 1px, fill white. */}
              <feMorphology
                operator="dilate"
                radius="1"
                in="SourceAlpha"
                result="whiteShape"
              />
              <feFlood floodColor="#FFFFFF" />
              <feComposite operator="in" in2="whiteShape" result="whiteRing" />

              {/* Back-to-front stack. */}
              <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="goldRing" />
                <feMergeNode in="whiteRing" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      </body>
    </html>
  );
}
