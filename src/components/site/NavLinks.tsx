"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

type Item = { href: string; label: string; exact?: boolean };

// Next.js `usePathname()` doesn't include the hash, so items like
// `/#picks` never matched. We track `window.location.hash` separately.
//
// Why so many listeners: Next.js's client navigation to a same-route hash
// (clicking `<Link href="/#picks" />` while already on `/`) updates the URL
// via History.replaceState/pushState but doesn't reliably fire a
// `hashchange` event in every code path. Listening on click (capture phase)
// plus `popstate` covers back/forward and direct anchor clicks alike. The
// requestAnimationFrame defer makes sure the URL has actually been updated
// by the time we read it.
function useUrlHash() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    const syncSoon = () => requestAnimationFrame(sync);
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    document.addEventListener("click", syncSoon, true);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      document.removeEventListener("click", syncSoon, true);
    };
  }, []);
  return hash;
}

export function NavLinks({ items }: { items: ReadonlyArray<Item> }) {
  const pathname = usePathname();
  const urlHash = useUrlHash();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="hidden md:flex items-center"
      onMouseLeave={() => setHoverIdx(null)}
    >
      <nav
        className="relative flex items-center gap-1 text-[12.5px]"
        aria-label="Primary"
      >
        {items.map((item, i) => {
          const [rawPath, fragment] = item.href.split("#");
          const itemPath = rawPath || "/";
          const itemHash = fragment ? `#${fragment}` : "";

          const isActive = itemHash
            ? pathname === itemPath && urlHash === itemHash
            : item.exact
              ? pathname === itemPath && !urlHash
              : itemPath !== "/" && pathname.startsWith(itemPath);

          return (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => setHoverIdx(i)}
            >
              <AnimatePresence>
                {hoverIdx === i && (
                  <motion.span
                    layoutId="nav-hover-pill"
                    className="absolute inset-0 rounded-full bg-primary/10 ring-1 ring-primary/30 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  />
                )}
              </AnimatePresence>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative inline-flex items-center px-4 py-2 font-semibold uppercase tracking-[0.14em] transition-colors duration-200 ${
                  isActive
                    ? "text-primary"
                    : "text-foreground/72 hover:text-foreground"
                }`}
              >
                {item.label}
                {isActive && (
                  <motion.span
                    layoutId="nav-active-dot"
                    className="ml-1.5 size-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(255,184,0,0.7)]"
                  />
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
