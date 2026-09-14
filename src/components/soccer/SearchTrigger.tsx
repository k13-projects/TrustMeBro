"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cx, focusRing } from "@/lib/design/tokens";
import { SearchPalette } from "./SearchPalette";

// The magnifier in the navbar, and the Cmd-K listener that opens the same
// palette from anywhere on the site.
export function SearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search clubs and matches"
        className={cx(
          "inline-flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-black/30 px-2.5 py-1.5 text-foreground/60 transition-colors hover:border-primary/50 hover:text-foreground",
          focusRing,
        )}
      >
        <Search size={15} aria-hidden />
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] lg:inline">
          ⌘K
        </span>
      </button>
      <SearchPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
