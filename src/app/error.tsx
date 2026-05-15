"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[app error boundary]", error);
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="glass glass-sheen rounded-3xl p-8 space-y-5 text-center">
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-rose-300">
          Something went wrong
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          We hit an unexpected error.
        </h1>
        <p className="text-sm text-foreground/65">
          Our engine ran into a snag loading this page. You can try again — if it
          keeps happening, the issue is on our side.
        </p>
        {error.digest ? (
          <p className="text-[11px] font-mono text-foreground/40">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-full px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full px-4 py-2 text-sm text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508]"
          >
            Back to today&apos;s picks
          </Link>
        </div>
      </div>
    </div>
  );
}
