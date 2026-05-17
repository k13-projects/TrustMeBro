"use client";

import { cx, focusRing } from "@/lib/design/tokens";
import { useCart } from "./CartContext";

/**
 * Always-visible coupon pill — bottom-right, above the Ask Bro launcher.
 * When empty: invites the user to start a coupon. When populated: shows
 * count. Hidden only when the drawer itself is open (don't double up the
 * affordance).
 */
export function CouponDrawerLauncher() {
  const cart = useCart();
  if (!cart.hydrated || cart.isOpen) return null;

  const empty = cart.picks.length === 0;
  const label = "My Coupon";
  const ariaLabel = empty
    ? "Open coupon builder (empty)"
    : `Open coupon (${cart.picks.length} picks)`;

  // Sits one slot above the ChatLauncher so the green Ask Bro pill and the
  // gold Coupon pill never overlap when both are visible. Mobile: circular
  // icon-only FAB so it doesn't sit on top of card content. Desktop (sm+):
  // full pill with label + count.
  //
  // Empty state uses the brand-primary gold fill (--primary / #FFB800) with
  // dark bold uppercase text — same shape as the rest of the app's primary
  // CTAs. Once the user has picks in the coupon, the pill drops down to a
  // quieter glass+gold-border style so a populated cart doesn't shout at
  // them on every screen.
  return (
    <button
      type="button"
      onClick={cart.open}
      aria-label={ariaLabel}
      className={cx(
        "fixed bottom-[5.5rem] sm:bottom-20 right-5 z-40 inline-flex items-center justify-center sm:gap-2 rounded-full size-12 sm:size-auto sm:px-5 sm:py-2.5 text-sm uppercase tracking-[0.18em] transition-colors transition-shadow",
        empty
          ? "bg-primary text-primary-foreground font-extrabold border border-primary/60 shadow-[0_20px_50px_-10px_rgba(255,184,0,0.65),0_0_0_1px_rgba(255,184,0,0.35)] hover:bg-primary-hover hover:shadow-[0_24px_60px_-10px_rgba(255,184,0,0.85),0_0_0_1px_rgba(255,184,0,0.55)]"
          : "glass-strong border border-primary/35 text-primary font-semibold shadow-[0_18px_40px_-14px_rgba(255,184,0,0.45)] hover:bg-primary/12",
        focusRing,
      )}
    >
      <span aria-hidden className="text-base sm:text-[15px] leading-none">🧾</span>
      <span className="hidden sm:inline">{label}</span>
      <span
        className={cx(
          "absolute -top-1 -right-1 sm:static sm:top-auto sm:right-auto rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-mono tabular-nums min-w-[1.15rem] text-center",
          empty
            ? "bg-primary-foreground/15 text-primary-foreground sm:bg-primary-foreground/20"
            : "bg-primary/30 text-primary-foreground sm:bg-primary/20 sm:text-primary",
        )}
      >
        {cart.picks.length}
      </span>
    </button>
  );
}
