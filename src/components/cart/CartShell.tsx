"use client";

import type { ReactNode } from "react";
import { CartProvider } from "./CartContext";
import { CouponDrawer } from "./CouponDrawer";
import { CouponDrawerLauncher } from "./CouponDrawerLauncher";

export function CartShell({
  children,
  isSignedIn,
}: {
  children: ReactNode;
  isSignedIn: boolean;
}) {
  return (
    <CartProvider>
      {children}
      <CouponDrawer isSignedIn={isSignedIn} />
      <CouponDrawerLauncher />
    </CartProvider>
  );
}
