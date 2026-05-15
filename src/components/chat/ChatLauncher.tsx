"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { useCart } from "@/components/cart/CartContext";

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const cart = useCart();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // When the coupon drawer is open we want the chat trigger sitting next to
  // it (so the user can ask the bot about their coupon while looking at it),
  // not hidden behind it. The drawer is sm:w-[420px] on desktop; we offset
  // the launcher to right-[436px] to clear the drawer + a 16px gap. On
  // mobile the drawer covers the screen, so we hide the launcher entirely.
  const drawerOpen = cart.isOpen;
  const visibility = drawerOpen ? "hidden sm:inline-flex" : "inline-flex";
  const position = drawerOpen
    ? "fixed bottom-6 right-[436px] z-[60]"
    : "fixed bottom-6 right-6 z-40";

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close chat" : "Open chat"}
        onClick={() => setOpen((o) => !o)}
        className={
          open
            ? `${visibility} ${position} size-12 rounded-full bg-white/10 border border-white/15 backdrop-blur-xl items-center justify-center text-foreground/90 hover:bg-white/15 transition-all duration-200 active:scale-95 hover:rotate-90`
            : `group ${visibility} ${position} items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 via-emerald-400 to-green-500 gradient-shift shadow-[0_10px_40px_-8px_rgba(16,185,129,0.55)] hover:shadow-[0_14px_50px_-6px_rgba(16,185,129,0.8)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]`
        }
      >
        {open ? (
          <CloseIcon />
        ) : (
          <>
            <span className="relative inline-flex">
              <Sparkle className="size-4 shimmer" />
              <span aria-hidden className="absolute -right-1 -top-1 size-1.5 rounded-full bg-emerald-200 soft-pulse" />
            </span>
            <span className="tracking-tight">Ask AI</span>
          </>
        )}
      </button>
      <ChatPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z" />
      <path d="M19 13.5c.2 2.3 1.2 3.3 3.5 3.5-2.3.2-3.3 1.2-3.5 3.5-.2-2.3-1.2-3.3-3.5-3.5 2.3-.2 3.3-1.2 3.5-3.5z" opacity="0.7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
