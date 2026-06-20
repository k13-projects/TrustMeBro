// Shown instantly while a /football page's server component fetches. Covers the
// home + any subroute without its own loading.tsx, so navigation never lands on
// a blank screen — the layout shape is there, then the real data swaps in.
export default function FootballLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10" aria-hidden>
      <div className="space-y-3">
        <div className="h-3 w-28 animate-pulse rounded bg-foreground/10" />
        <div className="h-10 w-56 animate-pulse rounded bg-foreground/10" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <MatchSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function MatchSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-stretch">
      <div className="flex min-w-0 flex-1 items-center gap-4 rounded-l-full rounded-r-lg bg-black/60 py-3 pl-5 pr-8">
        <div className="h-8 w-11 shrink-0 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
      </div>
      <div className="relative z-10 -mx-5 flex items-center sm:-mx-6">
        <div className="size-14 animate-pulse rounded-full bg-black/80 ring-2 ring-background sm:size-16" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-4 rounded-l-lg rounded-r-full bg-black/60 py-3 pl-8 pr-5">
        <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
        <div className="h-8 w-11 shrink-0 animate-pulse rounded bg-white/10" />
      </div>
    </div>
  );
}
