"use client";

import Image from "next/image";
import { useState } from "react";
import {
  COMPETITIONS,
  COMPETITION_COOKIE,
  COMPETITION_COOKIE_MAX_AGE,
  COMPETITION_ORDER,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";
import { cx, focusRing } from "@/lib/design/tokens";

function rememberCompetition(next: SoccerCompetition) {
  document.cookie = `${COMPETITION_COOKIE}=${next}; path=/; max-age=${COMPETITION_COOKIE_MAX_AGE}; samesite=lax`;
}

// Segmented switch between football competitions. Writes the cookie
// client-side then hard-navigates to the football home, so SSR reads the new
// competition on the very next request (same approach as the sport toggle —
// no server-action/redirect cookie race).
export function CompetitionSwitcher({
  active,
  className,
}: {
  active: SoccerCompetition;
  className?: string;
}) {
  const [current, setCurrent] = useState<SoccerCompetition>(active);

  function choose(next: SoccerCompetition) {
    if (next === current) return;
    setCurrent(next);
    rememberCompetition(next);
    window.location.assign("/football");
  }

  return (
    <div
      role="tablist"
      aria-label="Competition"
      className={cx(
        "inline-flex items-center gap-1 rounded-full border border-border/70 bg-black/40 p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {COMPETITION_ORDER.map((id) => {
        const meta = COMPETITIONS[id];
        const selected = id === current;
        const archived = meta.status === "archived";
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => choose(id)}
            title={archived ? `${meta.fullName} — archived record` : meta.fullName}
            className={cx(
              "group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-all duration-200",
              focusRing,
              selected
                ? "bg-primary text-primary-foreground shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6)]"
                : "text-foreground/60 hover:text-foreground hover:bg-white/5",
            )}
          >
            <Image
              src={meta.logo}
              alt=""
              width={18}
              height={18}
              className={cx(
                "size-[18px] object-contain transition-all",
                selected ? "" : "opacity-60 grayscale group-hover:opacity-90 group-hover:grayscale-0",
              )}
              unoptimized
            />
            <span className="hidden sm:inline">{meta.label}</span>
            <span className="sm:hidden">{meta.shortLabel}</span>
            {archived ? (
              <span
                className={cx(
                  "hidden rounded-full px-1.5 py-px text-[9px] tracking-[0.12em] md:inline",
                  selected ? "bg-black/15" : "bg-white/8 text-foreground/50",
                )}
              >
                Archive
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
