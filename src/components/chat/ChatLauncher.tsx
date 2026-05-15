"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "./ChatPanel";

export function ChatLauncher() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close chat" : "Open chat"}
        onClick={() => setOpen((o) => !o)}
        className={
          open
            ? "fixed bottom-6 right-6 z-40 size-12 rounded-full bg-white/10 border border-white/15 backdrop-blur-xl flex items-center justify-center text-foreground/90 hover:bg-white/15 transition-all active:scale-95"
            : "group fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500 gradient-shift shadow-[0_10px_40px_-8px_rgba(217,70,239,0.55)] hover:shadow-[0_14px_50px_-6px_rgba(217,70,239,0.75)] transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
        }
      >
        {open ? (
          <CloseIcon />
        ) : (
          <>
            <Sparkle className="size-4 shimmer" />
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
