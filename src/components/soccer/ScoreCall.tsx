"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { MatchBanner } from "./MatchBanner";
import { GuestPicker } from "@/components/auth/GuestPicker";
import { cx, disabledStyles, focusRingInset } from "@/lib/design/tokens";
import type { SoccerCompetition } from "@/lib/sports/soccer/competitions";

const MAX_GOALS = 9;

export type ScoreCallTeam = {
  name: string;
  abbreviation: string;
  crest: string | null;
};

export type ScoreCallValue = {
  home_goals: number;
  away_goals: number;
  points: number | null;
  graded_at: string | null;
};

export type ScoreCallPublicSummary = {
  count: number;
  home: number;
  draw: number;
  away: number;
};

export type ScoreCallProps = {
  matchId: number;
  competition: SoccerCompetition;
  home: ScoreCallTeam;
  away: ScoreCallTeam;
  /** ISO kickoff time — drives the "locks at" helper text. */
  kickoff: string;
  initial: ScoreCallValue | null;
  locked: boolean;
  finalScore: { home: number; away: number } | null;
  /** Signed-in bros' call distribution — only meaningful once locked. */
  publicSummary?: ScoreCallPublicSummary | null;
};

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "kickoff";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function pointsLabel(points: number): string {
  if (points === 3) return "+3 · exact score";
  if (points === 1) return "+1 · right result";
  return "0 pts — no bragging rights this time";
}

function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${label}: one fewer goal`}
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className={cx(
          "grid size-7 shrink-0 place-items-center rounded-full bg-white/8 text-foreground/80 transition-colors hover:bg-white/15",
          disabledStyles,
          focusRingInset,
        )}
      >
        <Minus size={13} strokeWidth={2.5} aria-hidden />
      </button>
      <span className="w-7 text-center text-2xl font-black tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label}: one more goal`}
        disabled={disabled || value >= MAX_GOALS}
        onClick={() => onChange(Math.min(MAX_GOALS, value + 1))}
        className={cx(
          "grid size-7 shrink-0 place-items-center rounded-full bg-white/8 text-foreground/80 transition-colors hover:bg-white/15",
          disabledStyles,
          focusRingInset,
        )}
      >
        <Plus size={13} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}

// "Call the score" card for one match — steppers to pick a scoreline,
// optimistic save with a toast, and three read states: saved-and-editable,
// locked (post-kickoff), and signed-out (inline guest-name prompt so the pick
// isn't lost to a full redirect to /login).
export function ScoreCall({
  matchId,
  competition,
  home,
  away,
  kickoff,
  initial,
  locked,
  finalScore,
  publicSummary = null,
}: ScoreCallProps) {
  const pathname = usePathname();
  const [call, setCall] = useState<ScoreCallValue | null>(initial);
  const [homeVal, setHomeVal] = useState(initial?.home_goals ?? 0);
  const [awayVal, setAwayVal] = useState(initial?.away_goals ?? 0);
  const [editing, setEditing] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [needsGuestName, setNeedsGuestName] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/soccer/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, home_goals: homeVal, away_goals: awayVal }),
      });
      if (res.status === 401) {
        setNeedsGuestName(true);
        return;
      }
      if (res.status === 409) {
        toast.error("This match already kicked off — too late to call it.");
        return;
      }
      if (!res.ok) {
        toast.error("Couldn't save that call. Try again.");
        return;
      }
      const body = (await res.json()) as { call: ScoreCallValue };
      setCall(body.call);
      setEditing(false);
      toast.success(`Call saved: ${homeVal}–${awayVal}`);
    } catch {
      toast.error("Network error — call not saved.");
    } finally {
      setSaving(false);
    }
  }

  if (locked) {
    return (
      <div className="space-y-2.5 min-w-0 rounded-2xl border border-border/60 bg-card/40 p-4">
        <MatchBanner size="sm" competition={competition} home={home} away={away} />
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/55">Your call</span>
          {call ? (
            <span className="font-bold tabular-nums">
              {call.home_goals}–{call.away_goals}
            </span>
          ) : (
            <span className="text-foreground/40">Not called</span>
          )}
        </div>
        {finalScore ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground/55">Final</span>
            <span className="font-bold tabular-nums">
              {finalScore.home}–{finalScore.away}
            </span>
          </div>
        ) : (
          <p className="text-xs text-foreground/45">
            Locked at kickoff — the result lands once the match finishes.
          </p>
        )}
        {typeof call?.points === "number" ? (
          <p className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-primary">
            {pointsLabel(call.points)}
          </p>
        ) : null}
        {publicSummary && publicSummary.count > 0 ? (
          <p className="text-[11px] text-foreground/45">
            Bros called: {Math.round((publicSummary.home / publicSummary.count) * 100)}% home ·{" "}
            {Math.round((publicSummary.draw / publicSummary.count) * 100)}% draw ·{" "}
            {Math.round((publicSummary.away / publicSummary.count) * 100)}% away
          </p>
        ) : null}
      </div>
    );
  }

  if (needsGuestName) {
    return (
      <div className="space-y-3 min-w-0 rounded-2xl border border-border/60 bg-card/40 p-4">
        <MatchBanner size="sm" competition={competition} home={home} away={away} />
        <p className="text-xs text-foreground/55">
          Pick a name to save your call — you&apos;ll stay right here. Want a synced
          account instead?{" "}
          <a
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="text-primary hover:underline"
          >
            Sign in
          </a>
          .
        </p>
        <GuestPicker next={pathname} />
      </div>
    );
  }

  if (!editing && call) {
    return (
      <div className="space-y-2.5 min-w-0 rounded-2xl border border-border/60 bg-card/40 p-4">
        <MatchBanner size="sm" competition={competition} home={home} away={away} />
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground/55">Your call</span>
          <span className="font-bold tabular-nums">
            {call.home_goals}–{call.away_goals}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-foreground/45">
            Editable until kickoff, {kickoffLabel(kickoff)}.
          </p>
          <button
            type="button"
            onClick={() => {
              setHomeVal(call.home_goals);
              setAwayVal(call.away_goals);
              setEditing(true);
            }}
            className={cx(
              "shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/75 transition-colors hover:bg-white/10",
              focusRingInset,
            )}
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0 rounded-2xl border border-border/60 bg-card/40 p-4">
      <MatchBanner size="sm" competition={competition} home={home} away={away} />
      <div className="flex items-center justify-center gap-3">
        <Stepper
          label={home.abbreviation || home.name}
          value={homeVal}
          onChange={setHomeVal}
          disabled={saving}
        />
        <span className="text-lg font-black text-foreground/30">–</span>
        <Stepper
          label={away.abbreviation || away.name}
          value={awayVal}
          onChange={setAwayVal}
          disabled={saving}
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className={cx(
          "w-full rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary-hover",
          disabledStyles,
          focusRingInset,
        )}
      >
        {saving ? "Saving…" : call ? "Update call" : "Save call"}
      </button>
      <p className="text-center text-[11px] text-foreground/45">
        Locks at kickoff, {kickoffLabel(kickoff)} — edit anytime before then.
      </p>
    </div>
  );
}
