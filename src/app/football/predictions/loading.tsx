// Shown instantly while the predictions board fetches rounds, own calls, and
// the leaderboard. Mirrors the real shape (header, stat strip, card grid,
// table) so nothing jumps when the real content swaps in.
export default function PredictionsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10" aria-hidden>
      <div className="space-y-3">
        <div className="h-3 w-28 animate-pulse rounded bg-foreground/10" />
        <div className="h-10 w-72 animate-pulse rounded bg-foreground/10" />
      </div>

      <div className="h-14 w-full animate-pulse rounded-2xl bg-foreground/10" />

      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-foreground/10" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-foreground/10" />
        <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
      </div>
    </div>
  );
}
