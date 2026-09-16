"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { useCart } from "@/components/cart/CartContext";
import { useHideOnScroll } from "@/components/site/useHideOnScroll";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ChatLauncher({
  sport = "soccer",
}: {
  sport?: "nba" | "soccer";
}) {
  const [open, setOpen] = useState(false);
  const cart = useCart();
  // A coupon being built pins the conversation to its sport; otherwise follow
  // the page's active sport.
  const panelSport = cart.picks[0]?.sport ?? sport;
  // Declutters the launcher while the visitor is reading the page: hidden on
  // load until content has had a first, unobstructed paint, hidden again
  // while actively scrolling down, back on scroll-up or once scrolling
  // settles. Only applies to the idle (closed) trigger — an open chat panel
  // always keeps its close button on screen.
  const scrollVisible = useHideOnScroll();

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
  //
  // The `lg:right-[...]` term keeps the button in the empty margin outside
  // the site's max-w-7xl content column on wide viewports (where that margin
  // is wider than the button itself) instead of always hugging the viewport
  // edge, which is what let it land on top of wide page content (e.g. the
  // bracket's rightmost column) — falls back to the fixed edge offset below
  // that width, same as before.
  const drawerOpen = cart.isOpen;
  const visibility = drawerOpen ? "hidden sm:inline-flex" : "inline-flex";
  const position = drawerOpen
    ? "fixed bottom-[4.75rem] md:bottom-6 right-[436px] z-[60]"
    : "fixed bottom-[4.75rem] md:bottom-6 right-6 lg:right-[max(1.5rem,calc((100vw-80rem)/2-3.5rem))] z-40";
  const revealClasses =
    open || scrollVisible
      ? "opacity-100 translate-y-0"
      : "opacity-0 translate-y-2 pointer-events-none";

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={open ? "Close chat" : "Open chat with Bro"}
          onClick={() => setOpen((o) => !o)}
          className={
            open
              ? `${visibility} ${position} ${revealClasses} size-12 rounded-full bg-white/10 border border-white/15 items-center justify-center text-foreground/90 hover:bg-white/15 transition-[opacity,transform,background-color] duration-200 motion-reduce:transition-none active:scale-95 hover:rotate-90`
                // Icon-only at every breakpoint — a text-labelled pill was
                // wide enough on desktop to sit on top of page content (e.g.
                // the bracket's Play-offs column); the label now surfaces as
                // a tooltip on hover/focus instead. gradient-shift + shimmer
                // + soft-pulse were each infinite animations running 24/7 on
                // every page even when the chat was closed — three
                // concurrent compositor jobs for a decorative FAB. Replaced
                // with a static gradient + a hover-only ring pulse.
              : `group ${visibility} ${position} ${revealClasses} items-center justify-center rounded-full size-11 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-500 shadow-[0_10px_40px_-8px_rgba(16,185,129,0.55)] hover:shadow-[0_14px_50px_-6px_rgba(16,185,129,0.8)] transition-[opacity,transform,box-shadow] duration-200 motion-reduce:transition-none hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]`
          }
        >
          {open ? (
            <CloseIcon />
          ) : (
            <span className="relative inline-flex">
              <Sparkle className="size-4" />
              <span aria-hidden className="absolute -right-1 -top-1 size-1.5 rounded-full bg-emerald-200" />
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          {open ? "Close chat" : "Ask Bro"}
        </TooltipContent>
      </Tooltip>
      <ChatPanel open={open} onClose={() => setOpen(false)} sport={panelSport} />
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
