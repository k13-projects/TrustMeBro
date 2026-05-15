"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";

export function PlayButton({
  predictionId,
  initialPlayed,
  isSignedIn,
}: {
  predictionId: string;
  initialPlayed: boolean;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [played, setPlayed] = useState(initialPlayed);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  if (!isSignedIn) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
        }}
        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-foreground/65 hover:text-foreground hover:bg-white/8 transition-colors"
      >
        Sign in to track
      </button>
    );
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !played;
    setPlayed(next);
    try {
      const res = await fetch(`/api/bets/${predictionId}/play`, {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: next ? "{}" : undefined,
      });
      if (!res.ok && res.status !== 409) {
        setPlayed(!next);
      } else {
        startTransition(() => router.refresh());
      }
    } catch {
      setPlayed(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      disabled={busy}
      className={
        played
          ? "rounded-full border border-emerald-400/30 bg-emerald-400/15 text-emerald-300 px-2.5 py-1 text-[11px] font-medium hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
          : "rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-foreground/70 hover:text-foreground hover:bg-white/8 transition-colors disabled:opacity-50"
      }
      title={played ? "Click to remove from your history" : "Mark as played"}
    >
      {played ? "✓ Played" : "▶ I played this"}
    </button>
  );
}
