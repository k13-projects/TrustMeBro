"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

type Ev = {
  minute: string;
  kind: "goal" | "yellow" | "red";
  side: "home" | "away" | null;
  player: string;
  detail: string | null;
};

const ICON: Record<Ev["kind"], string> = {
  goal: "⚽",
  yellow: "🟨",
  red: "🟥",
};

// Google surfaces a rich match panel (score, timeline, stats, lineups) for a
// "<home> vs <away> world cup" query — reliable and deep-linkable per match.
const matchFactsUrl = (home: string, away: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${home} vs ${away} world cup`)}`;

export function MatchEvents({
  matchId,
  home,
  away,
}: {
  matchId: number;
  home: string;
  away: string;
}) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && events === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/soccer/matches/${matchId}/events`);
        const json = await res.json();
        setEvents(Array.isArray(json.events) ? json.events : []);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="border-t border-border/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/45 hover:text-foreground/70 transition-colors"
      >
        Match events
        <ChevronDown
          size={13}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="px-4 pb-3">
          {loading ? (
            <p className="py-2 text-center text-xs text-foreground/40">Loading…</p>
          ) : events && events.length > 0 ? (
            <ul className="space-y-1.5">
              {events.map((e, i) => (
                <li
                  key={`${e.minute}-${e.player}-${i}`}
                  className={`flex items-center gap-2 text-sm ${
                    e.side === "away" ? "flex-row-reverse text-right" : ""
                  }`}
                >
                  <span className="w-9 shrink-0 tabular-nums text-xs text-foreground/45">
                    {e.minute}
                  </span>
                  <span aria-hidden>{ICON[e.kind]}</span>
                  <span className="min-w-0">
                    <span className="font-semibold">{e.player}</span>
                    {e.kind === "goal" && e.detail ? (
                      <span className="text-foreground/45"> (assist: {e.detail})</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-center text-xs text-foreground/40">
              No goals or cards recorded.
            </p>
          )}

          <a
            href={matchFactsUrl(home, away)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-border/60 bg-white/5 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-white/10 hover:text-foreground transition-colors"
          >
            See match facts
            <ExternalLink size={12} />
          </a>
        </div>
      ) : null}
    </div>
  );
}
