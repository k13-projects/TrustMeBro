"use client";

import { useEffect, useState } from "react";
import { COMPETITIONS, type SoccerCompetition } from "@/lib/sports/soccer/competitions";
import type { TeamLite } from "@/lib/sports/soccer/queries";
import type { MatchEvent } from "@/lib/sports/soccer/provider";
import type { LiveMatchState, LiveProb, LiveSnapshot } from "@/lib/sports/soccer/match-queries";
import { minutesFromClock } from "@/lib/analysis/soccer/live-prob";
import { CountryFlag } from "./CountryFlag";
import { TeamCrest } from "./TeamCrest";

const POLL_MS = 20_000;
const NEAR_KICKOFF_MS = 20 * 60_000;

const ICON: Record<MatchEvent["kind"], string> = {
  goal: "⚽",
  yellow: "🟨",
  red: "🟥",
};

const KEY_STAT_ORDER: Array<{ key: string; label: string }> = [
  { key: "possessionPct", label: "Possession" },
  { key: "totalShots", label: "Shots" },
  { key: "shotsOnTarget", label: "On target" },
  { key: "wonCorners", label: "Corners" },
];

function periodLabel(m: LiveMatchState): string {
  if (m.state === "post") return "FT";
  if (m.state === "pre") return "Kickoff soon";
  if (/halftime/i.test(m.status)) return "Half-time";
  if (m.period >= 3) return /penalt/i.test(m.status) ? "Penalties" : "Extra Time";
  return m.period === 2 ? "2nd Half" : "1st Half";
}

// Wraps the win-probability bar, score/clock, momentum timeline, live
// commentary and key stats for one match. SSR seeds `initial` so first paint
// is complete; polling then keeps it current while the match is live (or
// close enough to kickoff that state could flip any moment) and stops for
// good once the match is finished.
export function LiveTracker({
  matchId,
  competition,
  datetime,
  home,
  away,
  initial,
}: {
  matchId: number;
  competition: SoccerCompetition;
  datetime: string | null;
  home: TeamLite;
  away: TeamLite;
  initial: LiveSnapshot;
}) {
  const [snap, setSnap] = useState<LiveSnapshot>(initial);

  useEffect(() => {
    if (snap.match.finished || snap.match.state === "post") return;

    const nearKickoff = datetime
      ? Math.abs(new Date(datetime).getTime() - Date.now()) <= NEAR_KICKOFF_MS
      : false;
    if (!(snap.match.state === "in" || nearKickoff)) return;

    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/soccer/matches/${matchId}/live`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean } & Partial<LiveSnapshot>;
        if (data.ok && active && data.match) {
          setSnap({
            match: data.match,
            events: data.events ?? [],
            commentary: data.commentary ?? [],
            stats: data.stats ?? { home: [], away: [] },
            prob: data.prob ?? null,
            preMatchProb: data.preMatchProb ?? null,
            probSource: data.probSource ?? "neutral",
          });
        }
      } catch {
        // Keep last-known snapshot; retry next tick.
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [matchId, datetime, snap.match.state, snap.match.finished]);

  const meta = COMPETITIONS[competition];
  const kind: "flag" | "crest" = meta.kind === "national" ? "flag" : "crest";

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 rounded-3xl border border-border/60 bg-card/40 p-5 sm:p-6">
      <ScoreClock home={home} away={away} match={snap.match} kind={kind} />

      {snap.prob ? (
        <WinProbBar
          prob={snap.prob}
          preMatchProb={snap.preMatchProb ?? snap.prob}
          source={snap.probSource}
          finished={snap.match.finished}
        />
      ) : null}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Momentum</p>
        <MomentumTimeline events={snap.events} home={home} away={away} />
      </div>

      <KeyStats stats={snap.stats} />

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Commentary</p>
        <CommentaryFeed commentary={snap.commentary} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Score & clock
// ---------------------------------------------------------------------------
function ScoreClock({
  home,
  away,
  match,
  kind,
}: {
  home: TeamLite;
  away: TeamLite;
  match: LiveMatchState;
  kind: "flag" | "crest";
}) {
  const Crest = kind === "flag" ? CountryFlag : TeamCrest;
  const live = match.state === "in";
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-6">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate text-sm font-semibold sm:text-base">{home.abbreviation || home.name}</span>
        <Crest crest={home.crest} abbr={home.abbreviation} name={home.name} size={22} />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="font-display text-3xl font-black tabular-nums sm:text-4xl">
          {match.home_score}–{match.away_score}
        </span>
        <span
          className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide tabular-nums ${
            match.state === "post" ? "text-foreground/50" : "text-primary"
          }`}
        >
          {live ? (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          ) : null}
          {live && match.clock ? `${match.clock} · ` : ""}
          {periodLabel(match)}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Crest crest={away.crest} abbr={away.abbreviation} name={away.name} size={22} />
        <span className="truncate text-sm font-semibold sm:text-base">{away.abbreviation || away.name}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Win probability
// ---------------------------------------------------------------------------
function WinProbBar({
  prob,
  preMatchProb,
  source,
  finished,
}: {
  prob: LiveProb;
  preMatchProb: LiveProb;
  source: LiveSnapshot["probSource"];
  finished: boolean;
}) {
  const pct = (n: number) => Math.round(n * 100);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
        <span>Live win probability</span>
        {source === "neutral" ? (
          <span className="normal-case tracking-normal text-foreground/40">no pre-match price — neutral model</span>
        ) : null}
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/8" role="img" aria-label="Live win probability by side">
        <div
          className="bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pct(prob.home)}%` }}
        />
        <div
          className="bg-muted-foreground transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pct(prob.draw)}%` }}
        />
        <div
          className="bg-white/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pct(prob.away)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs font-bold tabular-nums">
        <span className="text-primary">{pct(prob.home)}%</span>
        <span className="text-foreground/55">{pct(prob.draw)}%</span>
        <span className="text-foreground/85">{pct(prob.away)}%</span>
      </div>
      {!finished ? (
        <div className="flex items-center justify-between text-[10px] tabular-nums text-foreground/35">
          <span>pre-match {pct(preMatchProb.home)}%</span>
          <span>{pct(preMatchProb.draw)}%</span>
          <span>{pct(preMatchProb.away)}%</span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Momentum timeline
// ---------------------------------------------------------------------------
function MomentumTimeline({
  events,
  home,
  away,
}: {
  events: MatchEvent[];
  home: TeamLite;
  away: TeamLite;
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/50 bg-card/20 px-3 py-4 text-center text-xs text-foreground/40">
        No goals or cards yet.
      </p>
    );
  }

  const withMinute = events.map((e) => ({ e, minute: minutesFromClock(e.minute, 0) }));
  const axisMax = Math.max(90, ...withMinute.map(({ minute }) => Math.ceil(minute / 15) * 15));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
        <span className="truncate">{home.abbreviation || home.name}</span>
        <span className="truncate">{away.abbreviation || away.name}</span>
      </div>
      <div className="relative h-16">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" aria-hidden />
        {withMinute
          .filter(({ e }) => e.side === "home")
          .map(({ e, minute }, i) => (
            <span
              key={`h-${i}`}
              title={`${e.player}${e.detail ? ` (assist: ${e.detail})` : ""} · ${e.minute}`}
              style={{ left: `${Math.min(100, (minute / axisMax) * 100)}%` }}
              className="absolute bottom-[calc(50%+3px)] -translate-x-1/2 text-base leading-none"
            >
              {ICON[e.kind]}
            </span>
          ))}
        {withMinute
          .filter(({ e }) => e.side === "away")
          .map(({ e, minute }, i) => (
            <span
              key={`a-${i}`}
              title={`${e.player}${e.detail ? ` (assist: ${e.detail})` : ""} · ${e.minute}`}
              style={{ left: `${Math.min(100, (minute / axisMax) * 100)}%` }}
              className="absolute top-[calc(50%+3px)] -translate-x-1/2 text-base leading-none"
            >
              {ICON[e.kind]}
            </span>
          ))}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-foreground/35">
        <span>0&apos;</span>
        <span>{axisMax}&apos;</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key stats
// ---------------------------------------------------------------------------
function KeyStats({ stats }: { stats: LiveSnapshot["stats"] }) {
  const rows = KEY_STAT_ORDER.map((s) => ({
    ...s,
    home: stats.home.find((l) => l.key === s.key)?.value ?? null,
    away: stats.away.find((l) => l.key === s.key)?.value ?? null,
  })).filter((r) => r.home !== null || r.away !== null);

  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      {rows.map((r) => (
        <div key={r.key} className="rounded-lg bg-white/[0.03] px-1.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-foreground/40">{r.label}</p>
          <p className="mt-1 text-xs font-bold tabular-nums">
            <span>{r.home ?? "—"}</span>
            <span className="mx-1 text-foreground/30">·</span>
            <span>{r.away ?? "—"}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commentary
// ---------------------------------------------------------------------------
function CommentaryFeed({ commentary }: { commentary: LiveSnapshot["commentary"] }) {
  if (commentary.length === 0) {
    return <p className="text-center text-xs text-foreground/40">No commentary yet.</p>;
  }
  const visible = commentary.slice(0, 6);
  const rest = commentary.slice(6);

  return (
    <div className="space-y-1.5">
      <ul className="space-y-2">
        {visible.map((c, i) => (
          <li
            key={i}
            className={`flex gap-3 text-sm ${
              i === 0 ? "rounded-lg bg-primary/5 px-2 py-1.5 ring-1 ring-primary/20" : ""
            }`}
          >
            <span className="w-9 shrink-0 tabular-nums text-xs text-foreground/45">{c.minute}</span>
            <span className={i === 0 ? "text-foreground" : "text-foreground/70"}>{c.text}</span>
          </li>
        ))}
      </ul>
      {rest.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-center text-[11px] font-semibold uppercase tracking-wide text-foreground/45 hover:text-foreground/70">
            {rest.length} earlier
          </summary>
          <ul className="mt-2 space-y-2">
            {rest.map((c, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-9 shrink-0 tabular-nums text-xs text-foreground/45">{c.minute}</span>
                <span className="text-foreground/60">{c.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
