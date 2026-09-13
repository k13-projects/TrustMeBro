// Shown instantly while the club page's server component fetches DB + ESPN
// data in parallel. Mirrors the real shape (crest + name, stat strip, two
// fixture columns) so the layout doesn't jump once data arrives.
export default function ClubLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10" aria-hidden>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="size-14 shrink-0 animate-pulse rounded-full bg-foreground/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-foreground/10" />
            <div className="h-9 w-64 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
        <div className="h-12 w-full animate-pulse rounded-2xl bg-foreground/10" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-foreground/10" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, col) => (
          <div key={col} className="space-y-3">
            <div className="h-3 w-24 animate-pulse rounded bg-foreground/10" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-foreground/10" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
