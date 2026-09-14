"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Home,
  MoreHorizontal,
  Target,
  X,
} from "lucide-react";
import { cx, focusRing } from "@/lib/design/tokens";
import { isNavGroup, type NavEntry, type NavItem } from "@/lib/sports/registry";
import type { Sport } from "@/lib/sports/types";

// Phones have no room for a nav row, and burying every destination in a
// hamburger at the top of a long page means nobody moves around the site.
// A fixed bar puts the five places people actually go one thumb-tap away,
// with everything else behind "More".
type Tab = { href: string; label: string; Icon: typeof Home; exact?: boolean };

const TABS: Record<Sport, Tab[]> = {
  soccer: [
    { href: "/football", label: "Home", Icon: Home, exact: true },
    { href: "/football/schedule", label: "Matches", Icon: CalendarDays },
    { href: "/football/picks", label: "Picks", Icon: Target },
    { href: "/football/predictions", label: "Play", Icon: BarChart3 },
  ],
  nba: [
    { href: "/", label: "Home", Icon: Home, exact: true },
    { href: "/games", label: "Games", Icon: CalendarDays },
    { href: "/#picks", label: "Picks", Icon: Target },
    { href: "/bros", label: "Play", Icon: BarChart3 },
  ],
};

export function BottomBar({
  sport,
  entries,
}: {
  sport: Sport;
  entries: ReadonlyArray<NavEntry>;
}) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = TABS[sport];
  const primary = new Set(tabs.map((t) => t.href));

  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  // Close the sheet when the route changes. The previous-pathname ref keeps
  // this out of render-triggering state, same pattern as the drawer.
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setMoreOpen(false);
    }
  }, [pathname]);

  const isActive = (t: Tab) =>
    t.exact
      ? pathname === t.href.split("#")[0]
      : pathname === t.href || pathname.startsWith(`${t.href}/`);

  return (
    <>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-[70] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="More destinations"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0b0d14] pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            <div className="mb-2 flex items-center justify-between px-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/45">
                Everything else
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className={cx("rounded-full bg-white/8 p-1.5", focusRing)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="px-3 pb-2">
              {entries.map((entry) =>
                isNavGroup(entry) ? (
                  <div key={entry.label} className="pt-2">
                    <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/40">
                      {entry.label}
                    </div>
                    {entry.items.map((item) => (
                      <SheetLink key={item.href} item={item} pathname={pathname} />
                    ))}
                  </div>
                ) : primary.has(entry.href) ? null : (
                  <SheetLink key={entry.href} item={entry} pathname={pathname} />
                ),
              )}
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-[55] border-t border-white/10 bg-[#0b0d14]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {tabs.map((t) => {
            const active = isActive(t);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors",
                    active ? "text-primary" : "text-foreground/55 hover:text-foreground",
                    focusRing,
                  )}
                >
                  <t.Icon size={18} aria-hidden />
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={cx(
                "flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/55 transition-colors hover:text-foreground",
                focusRing,
              )}
            >
              <MoreHorizontal size={18} aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

function SheetLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "block rounded-xl px-3 py-2.5 text-sm",
        active
          ? "bg-white/12 text-foreground"
          : "text-foreground/75 hover:bg-white/5 hover:text-foreground",
        focusRing,
      )}
    >
      {item.label}
    </Link>
  );
}
