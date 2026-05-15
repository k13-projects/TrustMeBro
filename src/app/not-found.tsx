import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="glass glass-sheen rounded-3xl p-8 space-y-5 text-center">
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          404 · Not found
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          We couldn&apos;t find that page.
        </h1>
        <p className="text-sm text-foreground/65">
          The link may be stale, or the player / team / game you&apos;re looking
          for isn&apos;t in our system yet.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
          <Link
            href="/"
            className="rounded-full px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508]"
          >
            Today&apos;s picks
          </Link>
          <Link
            href="/games"
            className="rounded-full px-4 py-2 text-sm text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508]"
          >
            Scoreboard
          </Link>
        </div>
      </div>
    </div>
  );
}
