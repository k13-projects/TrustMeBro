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
import { getEngineStats } from "@/lib/scoring/stats";

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
  const [requester, engineStats] = await Promise.all([
    getRequester(),
    getEngineStats(),
  ]);
  const isSignedIn = !!requester;

  return (
    <html
      lang="en"
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
          <MarqueeTicker stats={engineStats} />
          <Navbar
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
            <ChatLauncher />
          </CartShell>

          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
