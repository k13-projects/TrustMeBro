"use client";

import { useId, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/sports/soccer/glossary";
import { cx } from "@/lib/design/tokens";

// A word the site uses that a newcomer would have to guess at. Hover, focus
// or tap shows a one-sentence explanation; the full list lives on the
// glossary page. Keyboard reachable, and readable to a screen reader through
// aria-describedby rather than a title attribute.
export function Term({
  k,
  children,
  className,
}: {
  k: GlossaryKey;
  children?: React.ReactNode;
  className?: string;
}) {
  const entry = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={cx(
          "cursor-help underline decoration-dotted decoration-foreground/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:decoration-primary",
          className,
        )}
      >
        {children ?? entry.term}
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-white/12 bg-[#0b0d14] px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-foreground/85 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
        >
          <span className="block font-semibold text-foreground">{entry.term}</span>
          {entry.short}
        </span>
      ) : null}
    </span>
  );
}
