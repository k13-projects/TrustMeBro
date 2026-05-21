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
                onClick={(e) => {
                  // Same-page navigation: do the scroll + active state
                  // ourselves. Next's Link hash handling is racy on the FIRST
                  // click — it misses the scroll and the active-dot animation
                  // (only "takes" on the second click). A different route is
                  // left to normal Link navigation.
                  if (pathname !== itemPath) return;
                  if (itemHash) {
                    const el = document.getElementById(itemHash.slice(1));
                    if (!el) return;
                    e.preventDefault();
                    window.history.pushState(null, "", item.href);
                    window.dispatchEvent(new Event("hashchange"));
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                  } else if (item.exact) {
                    // Home, already home → scroll to top + clear the hash, so
                    // the Home dot lights up (same as clicking the logo).
                    e.preventDefault();
                    window.history.pushState(null, "", itemPath);
                    window.dispatchEvent(new Event("hashchange"));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
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
