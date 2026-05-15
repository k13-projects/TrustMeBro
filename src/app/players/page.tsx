export default function PlayersPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          NBA · Roster
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          Players
        </h1>
      </header>
      <div className="glass glass-sheen rounded-2xl p-8 text-foreground/65">
        Player search and stat profiles land here next. L5 sparkline, L10 average,
        season vs. last-game color coding, and pattern alerts will live on each
        player card.
      </div>
    </div>
  );
}
