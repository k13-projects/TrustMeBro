"use client";

import { cx, focusRing } from "@/lib/design/tokens";
import { useCart } from "./CartContext";
import { useHideOnScroll } from "@/components/site/useHideOnScroll";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Coupon pill — bottom-right, above the Ask Bro launcher. When empty:
 * invites the user to start a coupon. When populated: shows count. Hidden
 * when the drawer itself is open (don't double up the affordance), while
 * actively scrolling down (out of the way of what's underneath), and for a
 * moment on load so the page's own content gets a clean first paint.
 */
export function CouponDrawerLauncher() {
  const cart = useCart();
  const scrollVisible = useHideOnScroll();
  if (!cart.hydrated || cart.isOpen) return null;

  const empty = cart.picks.length === 0;
  const label = "My Coupon";
  const ariaLabel = empty
    ? "Open coupon builder (empty)"
    : `Open coupon (${cart.picks.length} picks)`;

  // Sits one slot above the ChatLauncher so the green Ask Bro pill and the
  // gold Coupon pill never overlap when both are visible. Icon-only circular
  // FAB at every breakpoint — a text+count pill was wide enough on desktop
  // to land on top of page content (e.g. the bracket's Play-offs column);
  // the label now surfaces as a tooltip on hover/focus instead, and the
  // count stays as the always-visible corner badge.
  //
  // `lg:right-[...]` keeps the button in the empty margin outside the
  // site's max-w-7xl content column on wide viewports (where that margin is
  // wider than the button) instead of always hugging the viewport edge;
  // falls back to the fixed edge offset below that width, same as before.
  //
  // Empty state uses the brand-primary gold fill (--primary / #FFB800) with
  // dark bold uppercase text — same shape as the rest of the app's primary
  // CTAs. Once the user has picks in the coupon, the pill drops down to a
  // quieter glass+gold-border style so a populated cart doesn't shout at
  // them on every screen.
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={cart.open}
        aria-label={ariaLabel}
        className={cx(
          "fixed bottom-[8.25rem] md:bottom-20 right-5 lg:right-[max(1.5rem,calc((100vw-80rem)/2-3.5rem))] z-40 inline-flex items-center justify-center rounded-full size-12 text-sm uppercase tracking-[0.18em] transition-[opacity,transform,background-color,box-shadow] motion-reduce:transition-none",
          scrollVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
          empty
            ? "bg-primary text-primary-foreground font-extrabold border border-primary/60 shadow-[0_20px_50px_-10px_rgba(255,184,0,0.65),0_0_0_1px_rgba(255,184,0,0.35)] hover:bg-primary-hover hover:shadow-[0_24px_60px_-10px_rgba(255,184,0,0.85),0_0_0_1px_rgba(255,184,0,0.55)]"
            : "glass-strong border border-primary/35 text-primary font-semibold shadow-[0_18px_40px_-14px_rgba(255,184,0,0.45)] hover:bg-primary/12",
          focusRing,
        )}
      >
        <span aria-hidden className="text-base leading-none">🧾</span>
        <span
          className={cx(
            "absolute -top-1 -right-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums min-w-[1.15rem] text-center",
            empty
              ? "bg-primary-foreground/15 text-primary-foreground"
              : "bg-primary/30 text-primary-foreground",
          )}
        >
          {cart.picks.length}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8}>
        {empty ? label : `${label} · ${cart.picks.length}`}
      </TooltipContent>
    </Tooltip>
  );
}
