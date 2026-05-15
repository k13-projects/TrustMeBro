import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ChatLauncher } from "@/components/chat/ChatLauncher";

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
        <header className="sticky top-0 z-30">
          <div className="glass glass-sheen">
            <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between relative">
              <Link
                href="/"
                className="flex items-center gap-2 font-semibold tracking-tight text-lg"
              >
                <Image
                  src="/logo.png"
                  alt="TrustMeBro"
                  width={36}
                  height={36}
                  priority
                  className="rounded-lg shadow-[0_0_24px_rgba(244,63,94,0.45)]"
                />
                TrustMeBro
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <NavLink href="/">Picks</NavLink>
                <NavLink href="/games">Games</NavLink>
                <NavLink href="/teams">Teams</NavLink>
                <NavLink href="/players">Players</NavLink>
                <NavLink href="/score">Score</NavLink>
              </nav>
            </div>
          </div>
        </header>
        <main className="relative z-10 flex-1">{children}</main>
        <footer className="relative z-10 mt-12">
          <div className="glass">
            <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-foreground/55">
              Data: ESPN · NBA only (more sports coming)
            </div>
          </div>
        </footer>
        <ChatLauncher />
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1.5 text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors"
    >
      {children}
    </Link>
  );
}
