import Link from "next/link";
import { hasKickedOff, todayIsoDate } from "@/lib/date";
import { getRequester } from "@/lib/identity";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { sideLabel } from "@/lib/sports/soccer/labels";
import { currentRound, getPredictionsForMatches, getRounds } from "@/lib/sports/soccer/queries";
import {
  getOwnCompetitionStats,
  getOwnScoreCalls,
  getPublicCallSummary,
  loadPredictionLeaderboard,
} from "@/lib/sports/soccer/predictions-queries";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { ScoreCall } from "@/components/soccer/ScoreCall";
import { BroAvatar } from "@/components/bros/BroAvatar";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  const competition = await activeCompetition();
  const today = todayIsoDate();

  const rounds = await getRounds(competition);
  const round = currentRound(rounds, today);
  const matches = round?.matches ?? [];
  const matchIds = matches.map((m) => m.id);

  const [requester, stats, ownCalls, publicSummary, leaderboard, enginePicksByMatch] =
    await Promise.all([
      getRequester(),
      getOwnCompetitionStats(competition),
      getOwnScoreCalls(matchIds),
      getPublicCallSummary(matchIds),
      loadPredictionLeaderboard(competition, 25),
      getPredictionsForMatches(matchIds),
    ]);
  const viewerUserId = requester?.kind === "auth" ? requester.user_id : null;
  const isAuth = requester?.kind === "auth";

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <FootballHeader title="Call the Scores" competition={competition} />

      {stats ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 sm:gap-6">
          <Stat label="Points" value={stats.points} highlight />
          <Stat label="Calls" value={stats.calls} />
          <Stat label="Graded" value={stats.graded} />
          <Stat label="Exact scores" value={stats.exact_scores} />
        </div>
      ) : (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-sm text-foreground/55">
          Sign in or play as a guest on any match below to start racking up
          points — 3 for an exact score, 1 for the right result.
        </p>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/50 pb-3">
          <div>
            <h2 className="font-display text-2xl uppercase tracking-[0.04em] sm:text-3xl">
              {round ? round.label : "No round open"}
            </h2>
            {round ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {matches.length} {matches.length === 1 ? "match" : "matches"}
              </p>
            ) : null}
          </div>
          <Link
            href="/football/schedule"
            className="inline-block py-1 -my-1 text-sm font-semibold text-primary hover:text-primary-hover"
          >
            Full schedule →
          </Link>
        </div>

        {matches.length === 0 ? (
          <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-foreground/55">
            No fixtures loaded for this round yet. Check back once the sync job
            populates the next matchday, or browse the{" "}
            <Link href="/football/schedule" className="text-primary hover:underline">
              full schedule
            </Link>
            .
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((m) => {
              const own = ownCalls.get(m.id) ?? null;
              const locked = Boolean(m.datetime && hasKickedOff(m.datetime));
              // The engine's own pick, if it has one — a hint marker only,
              // never a preselected score (house rule, 2026-09-15). Strongest
              // pending pick wins; getPredictionsForMatches already orders by
              // confidence descending.
              const topPick = (enginePicksByMatch.get(m.id) ?? []).find(
                (p) => p.status === "pending",
              );
              const enginePick = topPick
                ? {
                    label: sideLabel(topPick.market, topPick.side, topPick.line, m.home.name, m.away.name),
                    isBanko: topPick.is_banko,
                  }
                : null;
              return (
                <ScoreCall
                  key={m.id}
                  matchId={m.id}
                  competition={competition}
                  home={{ name: m.home.name, abbreviation: m.home.abbreviation, crest: m.home.crest }}
                  away={{ name: m.away.name, abbreviation: m.away.abbreviation, crest: m.away.crest }}
                  kickoff={m.datetime ?? new Date(`${m.date}T00:00:00Z`).toISOString()}
                  initial={own}
                  locked={locked}
                  finalScore={m.finished ? { home: m.home_score, away: m.away_score } : null}
                  publicSummary={publicSummary.get(m.id) ?? null}
                  enginePick={enginePick}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl uppercase tracking-[0.04em] sm:text-3xl">
          Leaderboard
        </h2>

        {!isAuth ? (
          <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-sm text-foreground/55">
            {requester?.kind === "guest"
              ? "Guest calls count toward your own points, but only signed-in bros show up here. Sign in to claim your spot on the board."
              : "Sign in to put your calls on the board — guests can play, but the leaderboard is for signed-in bros only."}{" "}
            <Link href="/login?next=/football/predictions" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        ) : null}

        {leaderboard.length === 0 ? (
          <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-foreground/55">
            No graded calls yet for this competition. Call a score above — the
            board fills in once matches finish.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-foreground/45">
                  <th className="px-4 py-2 text-left font-medium">Bro</th>
                  <th className="px-2 py-2 text-center font-medium">Calls</th>
                  <th className="hidden px-2 py-2 text-center font-medium sm:table-cell">Exact</th>
                  <th className="px-3 py-2 text-center font-semibold text-foreground/70">Points</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => {
                  const self = row.user_id === viewerUserId;
                  return (
                    <tr
                      key={row.user_id}
                      className={`border-t border-border/40 ${self ? "bg-primary/8" : ""}`}
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/bros/${row.profile?.handle ?? ""}`}
                          className="flex min-w-0 items-center gap-2.5 font-semibold transition-colors hover:text-primary"
                        >
                          <span className="w-4 text-xs tabular-nums text-foreground/50">{i + 1}</span>
                          <BroAvatar
                            handle={row.profile?.handle ?? "?"}
                            displayName={row.profile?.display_name ?? "Bro"}
                            avatarUrl={row.profile?.avatar_url}
                            size={24}
                          />
                          <span className="truncate">{row.profile?.display_name ?? "Bro"}</span>
                          {self ? (
                            <span className="text-[10px] uppercase tracking-widest text-primary/80">You</span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-foreground/70">{row.calls}</td>
                      <td className="hidden px-2 py-2 text-center tabular-nums text-foreground/70 sm:table-cell">
                        {row.exact_scores}
                      </td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-xl font-black tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</span>
      <span className="text-[11px] uppercase tracking-widest text-foreground/45">{label}</span>
    </div>
  );
}
