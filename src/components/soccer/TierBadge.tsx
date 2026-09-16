// Every engine row is one of two tiers, and the badge must say which.
// `is_banko` rows are the engine's actual picks — confidence >= 60, one per
// match, capped at 5/day (selectBanko in lib/analysis/soccer/coupons.ts) —
// and keep the app's existing "Banko" term rather than introducing a second
// word for the same thing. Everything else is a "lean": a real read the
// engine emitted (it already cleared the >=50% probability and EV >= 0
// gates in lib/analysis/soccer/engine.ts) but not one the engine is willing
// to call its pick of the day. Conflating the two reads as the app
// recommending more than it actually stands behind, so the badge is always
// shown, not just on the elevated tier.
export function TierBadge({ isBanko }: { isBanko: boolean }) {
  if (isBanko) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary ring-1 ring-primary/30">
        <span aria-hidden>★</span>
        Banko
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-white/6 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/45 ring-1 ring-white/10">
      Lean
    </span>
  );
}
