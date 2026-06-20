"use client";

import { useEffect, useState } from "react";
import type { MatchRow } from "@/lib/sports/soccer/queries";
import type { LiveScore } from "@/lib/sports/soccer/live";
import { MatchBanner } from "./MatchBanner";

type Volatile = Pick<MatchRow, "state" | "clock" | "home_score" | "away_score">;

const POLL_MS = 25_000;

// Wraps MatchBanner and keeps a live match's score/clock current by polling
// /api/soccer/live. Polls only while a match is in-play (or about to kick off),
// so finished/distant matches add no client work. SSR values seed the initial
// state, so there's no empty flash — the numbers update in place.
export function LiveMatch({ match }: { match: MatchRow }) {
  const [v, setV] = useState<Volatile>({
    state: match.state,
    clock: match.clock,
    home_score: match.home_score,
    away_score: match.away_score,
  });

  useEffect(() => {
    // Time check lives in the effect (Date.now is impure — not allowed in render).
    const nearKickoff = (() => {
      if (!match.datetime) return false;
      const diff = new Date(match.datetime).getTime() - Date.now();
      return diff <= 20 * 60_000 && diff >= -30 * 60_000;
    })();
    if (!(v.state === "in" || (v.state === "pre" && nearKickoff))) return;

    let active = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/soccer/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { matches?: LiveScore[] };
        const me = data.matches?.find((m) => m.id === match.id);
        if (me && active) {
          setV({
            state: me.state,
            clock: me.clock,
            home_score: me.home_score,
            away_score: me.away_score,
          });
        }
      } catch {
        // Keep last-known values; retry next tick.
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [match.id, match.datetime, v.state]);

  const showScore = v.state === "in" || v.state === "post";

  return (
    <MatchBanner
      home={match.home}
      away={match.away}
      score={showScore ? { home: v.home_score, away: v.away_score } : null}
      state={v.state}
      clock={v.clock}
      datetime={match.datetime}
    />
  );
}
