import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustMeBro — Live sports stats",
  description: "Live NBA stats and analysis for teams and players.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              TrustMeBro
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/" className="hover:underline">Games</Link>
              <Link href="/teams" className="hover:underline">Teams</Link>
              <Link href="/players" className="hover:underline">Players</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-black/10 dark:border-white/10 text-xs text-foreground/60">
          <div className="mx-auto max-w-6xl px-4 py-4">
            Data: balldontlie.io · NBA only (more sports coming)
          </div>
        </footer>
      </body>
    </html>
  );
}
