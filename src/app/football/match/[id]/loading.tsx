// Shown instantly while the match page's server component fetches DB + ESPN
// data in parallel. Mirrors the hero + two-column shape so nothing jumps when
// the real content swaps in.
export default function MatchLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10" aria-hidden>
      <div className="space-y-3 text-center">
        <div className="mx-auto h-3 w-40 animate-pulse rounded bg-foreground/10" />
        <div className="mx-auto flex w-full max-w-3xl items-stretch">
          <div className="h-14 flex-1 animate-pulse rounded-l-full rounded-r-lg bg-white/5 sm:h-16" />
          <div className="relative z-10 -mx-5 flex items-center sm:-mx-6">
            <div className="size-14 animate-pulse rounded-full bg-black/80 ring-2 ring-background sm:size-16" />
          </div>
          <div className="h-14 flex-1 animate-pulse rounded-l-lg rounded-r-full bg-white/5 sm:h-16" />
        </div>
        <div className="mx-auto h-3 w-28 animate-pulse rounded bg-foreground/10" />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-3xl border border-border/60 bg-card/40" />
          ))}
        </div>
        <div className="space-y-6">
          <div className="h-40 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
          <div className="h-40 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
        </div>
      </div>
    </div>
  );
}
