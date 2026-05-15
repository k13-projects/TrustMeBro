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
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full glass glass-sheen grain flex items-center justify-center text-foreground/90 hover:text-foreground transition-transform hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(99,102,241,0.45)]"
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400/30 via-fuchsia-500/20 to-rose-500/30 opacity-80"
        />
        <ChatIcon open={open} />
      </button>
      <ChatPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ChatIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative size-5"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="relative size-6"
    >
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12Z" />
      <path d="M8 11h.01M12 11h.01M16 11h.01" />
    </svg>
  );
}
