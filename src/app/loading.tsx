export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8" aria-busy="true" aria-live="polite">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-white/8 animate-pulse" />
          <div className="h-9 w-64 rounded-md bg-white/10 animate-pulse" />
          <div className="h-3 w-40 rounded bg-white/6 animate-pulse" />
        </div>
        <div className="glass rounded-full h-10 w-72 animate-pulse" />
      </div>

      <div className="glass glass-sheen rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="h-3 w-28 rounded bg-white/8 animate-pulse" />
        <div className="flex items-start gap-6 flex-wrap">
          <div className="h-[120px] w-[120px] rounded-full bg-white/8 animate-pulse" />
          <div className="flex-1 min-w-[200px] space-y-3">
            <div className="h-4 w-32 rounded bg-white/8 animate-pulse" />
            <div className="h-8 w-56 rounded bg-white/10 animate-pulse" />
            <div className="h-5 w-48 rounded bg-white/8 animate-pulse" />
          </div>
          <div className="h-[80px] w-[80px] rounded-full bg-white/10 animate-pulse" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="h-3 w-20 rounded bg-white/8 animate-pulse" />
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="glass rounded-2xl h-20 animate-pulse"
            />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
