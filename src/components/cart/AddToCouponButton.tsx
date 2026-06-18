"use client";

import { useState } from "react";
import { cx, focusRing } from "@/lib/design/tokens";
import { useCart, type CartPick } from "./CartContext";

type Variant = "inline" | "card";

export function AddToCouponButton({
  pick,
  variant = "inline",
}: {
  pick: CartPick;
  variant?: Variant;
}) {
  const cart = useCart();
  const inCart = cart.has(pick.prediction_id);
  // Same-game parlays are allowed, so the only block left is a cross-sport
  // coupon: you can't add a football pick onto an NBA coupon (and vice versa).
  const wrongSport =
    !inCart && cart.sport !== null && cart.sport !== pick.sport;
  const atMax = !inCart && cart.picks.length >= 6;
  const disabled = !cart.hydrated || (!inCart && (wrongSport || atMax));
  const [flash, setFlash] = useState<string | null>(null);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!cart.hydrated) return;
    if (inCart) {
      cart.remove(pick.prediction_id);
      return;
    }
    const result = cart.add(pick);
    if (!result.ok) {
      setFlash(result.reason ?? "Cannot add this pick");
      window.setTimeout(() => setFlash(null), 1800);
      return;
    }
    cart.open();
  }

  const title = inCart
    ? "Remove from coupon"
    : wrongSport
      ? "Clear your coupon to mix in another sport"
      : atMax
        ? "Coupons cap at 6 picks"
        : "Add to coupon";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={flash ?? title}
      aria-label={title}
      aria-pressed={inCart}
      className={cx(
        // Unified add-to-coupon look: gold-outline pill, amber when in the
        // coupon. Only the SIZE differs by variant — never the treatment.
        "inline-flex items-center justify-center gap-1 rounded-full border font-medium transition-colors",
        variant === "card"
          ? "h-11 flex-1 min-w-0 px-3 text-[11px] uppercase tracking-[0.1em] whitespace-nowrap"
          : "px-3 py-1.5 text-[11px]",
        inCart
          ? "border-amber-400/30 bg-amber-400/15 text-amber-300 hover:bg-amber-400/20"
          : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/60",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        focusRing,
      )}
    >
      {flash ? (
        <span aria-live="polite">{flash}</span>
      ) : inCart ? (
        <>✓ In coupon</>
      ) : variant === "card" ? (
        <>+ Add to Coupon</>
      ) : (
        <>+ Coupon</>
      )}
    </button>
  );
}
