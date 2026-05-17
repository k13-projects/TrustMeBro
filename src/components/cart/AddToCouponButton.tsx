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
  const conflict =
    !inCart && cart.sameGameConflict(pick.game_id, pick.prediction_id);
  const atMax = !inCart && cart.picks.length >= 6;
  const disabled = !cart.hydrated || (!inCart && (conflict || atMax));
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
    : conflict
      ? "You already have a pick from this game"
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
        "inline-flex items-center justify-center gap-1 rounded-full border font-medium transition-colors",
        variant === "card"
          ? "h-11 w-full px-4 text-xs uppercase tracking-[0.14em] whitespace-nowrap"
          : "px-2.5 py-1 text-[11px]",
        inCart
          ? "border-amber-400/30 bg-amber-400/15 text-amber-300 hover:bg-amber-400/20"
          : variant === "card"
            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/60"
            : "border-white/10 bg-white/5 text-foreground/70 hover:text-foreground hover:bg-white/8",
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
