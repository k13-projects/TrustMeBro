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
  const label = empty ? "Start a coupon" : "Coupon";
  const ariaLabel = empty
    ? "Open coupon builder (empty)"
    : `Open coupon (${cart.picks.length} picks)`;

  return (
    <button
      type="button"
      onClick={cart.open}
      aria-label={ariaLabel}
      className={cx(
        // Mobile: circular icon-only FAB so it doesn't sit on top of card
        // content. Desktop (sm+): full pill with label + count. Sits one
        // slot above the ChatLauncher so the green Ask Bro pill and the
        // amber Coupon pill never overlap when both are visible.
        "fixed bottom-[5.5rem] sm:bottom-20 right-5 z-40 inline-flex items-center justify-center sm:gap-2 rounded-full glass-strong border border-amber-400/30 size-11 sm:size-auto sm:px-4 sm:py-2 text-sm font-medium text-amber-300 shadow-[0_20px_40px_-12px_rgba(251,191,36,0.5)] hover:bg-amber-400/15 transition-colors",
        focusRing,
      )}
    >
      <span aria-hidden>🧾</span>
      <span className="hidden sm:inline">{label}</span>
      <span
        className={cx(
          "absolute -top-1 -right-1 sm:static sm:top-auto sm:right-auto rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-mono tabular-nums min-w-[1.1rem] text-center",
          empty
            ? "bg-amber-400/10 text-amber-100/70"
            : "bg-amber-400/40 text-amber-50 sm:bg-amber-400/25 sm:text-amber-100",
        )}
      >
        {cart.picks.length}
      </span>
    </button>
  );
}
