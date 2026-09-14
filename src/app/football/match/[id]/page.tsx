import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import {
  getHeadToHead,
  getMatchById,
  getNewsForMatch,
  getOddsHistory,
  getPredictionsForMatch,
  getRounds,
  roundLabelFor,
  type MatchRow,
  type NewsLite,
  type PredictionDetail,
} from "@/lib/sports/soccer/queries";
import { buildLiveSnapshot, getMatchLeagueSlug } from "@/lib/sports/soccer/match-queries";
import {
  getOwnScoreCalls,
  getPublicCallSummary,
} from "@/lib/sports/soccer/predictions-queries";
import { hasKickedOff } from "@/lib/date";
import { buildMatchPreview } from "@/lib/sports/soccer/match-preview";
import { getStandingForTeam } from "@/lib/sports/soccer/queries";
import { getSoccerRates, type MarketRates } from "@/lib/sports/soccer/rates";
import { soccerProvider } from "@/lib/sports/soccer";
import type { MatchDetail, RecentResult } from "@/lib/sports/soccer/provider";
import { BankoCard } from "@/components/soccer/BankoCard";
import { CountryFlag } from "@/components/soccer/CountryFlag";
import { LiveMatch } from "@/components/soccer/LiveMatch";
import { LiveTracker } from "@/components/soccer/LiveTracker";
import { MatchEvents } from "@/components/soccer/MatchEvents";
import { MatchRates } from "@/components/soccer/MatchRates";
import { OddsMovement } from "@/components/soccer/OddsMovement";
import { PickLine } from "@/components/soccer/PickLine";
import { MatchLeaders } from "@/components/soccer/MatchLeaders";
import { MatchPreview } from "@/components/soccer/MatchPreview";
import { ScoreCall } from "@/components/soccer/ScoreCall";
import { SettledPickRow } from "@/components/soccer/SettledPickRow";
import { ShareButton } from "@/components/soccer/ShareButton";
import { TeamCrest } from "@/components/soccer/TeamCrest";

export const dynamic = "force-dynamic";

// Isolated behind a plain function (not the component body) so the
// live-tracker-window check below reads as a pure computation off `now`.
function nowMs(): number {
  return Date.now();
}

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) return {};
  const match = await getMatchById(matchId);
  if (!match) return {};
  const meta = COMPETITIONS[match.competition];
  return {
    title: `${match.home.name} v ${match.away.name} · ${meta.label} · TrustMeBro`,
  };
}

function matchWhen(m: MatchRow): string {
  if (m.state === "in") return `Live${m.clock ? ` · ${m.clock}` : ""}`;
  if (m.state === "post") {
    // The banner already says FT; the caption carries the date, plus how it
    // ended when that's more than a normal full time (extra time, penalties).
    const played = m.datetime
      ? new Date(m.datetime).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "America/Los_Angeles",
        })
      : "Played";
    const how = /extra time|penalt/i.test(m.status)
      ? m.status.replace(/^Final Score - /i, "")
      : null;
    return how ? `${played} · ${how}` : played;
  }
  if (!m.datetime) return "Kickoff TBD";
  return (
    new Date(m.datetime).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    }) + " PT"
  );
}

export default async function MatchPage({ params }: PageProps) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();

  const [match, leagueSlug] = await Promise.all([
    getMatchById(matchId),
    getMatchLeagueSlug(matchId),
  ]);
  if (!match) notFound();

  const meta = COMPETITIONS[match.competition];
  const kind: "flag" | "crest" = meta.kind === "national" ? "flag" : "crest";

  const [predictions, oddsHistory, rounds, ratesByMatch, h2h, news, detailAndEvents, ownCalls, callSummary] = await Promise.all([
    getPredictionsForMatch(matchId),
    getOddsHistory(matchId),
    getRounds(match.competition),
    getSoccerRates([matchId]),
    getHeadToHead(match.home.id, match.away.id, matchId),
    getNewsForMatch(matchId, [match.home.id, match.away.id]),
    leagueSlug
      ? (async () => {
          const provider = soccerProvider(match.competition, leagueSlug);
          const [d, e] = await Promise.all([
            provider.getMatchDetail(matchId).catch(() => null),
            provider.getMatchEvents(matchId).catch(() => []),
          ]);
          return { detail: d, events: e };
        })()
      : Promise.resolve({ detail: null, events: [] }),
    getOwnScoreCalls([matchId]),
    getPublicCallSummary([matchId]),
  ]);

  const { detail, events } = detailAndEvents;
  const callLocked = Boolean(match.datetime && hasKickedOff(match.datetime));

  const round = rounds.find((r) => r.matches.some((m) => m.id === match.id)) ?? null;
  const roundLabel = roundLabelFor(match, rounds);
  const markets = ratesByMatch.get(matchId) ?? [];

  // A match that has not been played has no stats, lineups or commentary, so
  // the page was mostly empty. Build the preview from what we do know.
  const upcoming = match.state === "pre";
  const [homeStanding, awayStanding] = upcoming
    ? await Promise.all([
        getStandingForTeam(match.competition, match.home.id),
        getStandingForTeam(match.competition, match.away.id),
      ])
    : [null, null];
  const preview =
    upcoming && detail
      ? buildMatchPreview({
          match,
          homeResults: detail.last_five.home,
          awayResults: detail.last_five.away,
          homeStanding,
          awayStanding,
          markets,
          headToHead: h2h,
          phaseLabel: meta.phaseLabel,
        })
      : null;


  // Live tracker: renders while in-play, within 20 min of kickoff (catches the
  // state flip pre → in), or finished (final snapshot, no polling). Beyond
  // that window pre-match, a small pill stands in its place.
  const withinTrackerWindow = match.datetime
    ? Math.abs(new Date(match.datetime).getTime() - nowMs()) <= 20 * 60_000
    : false;
  const trackerEligible = match.state !== "pre" || withinTrackerWindow;
  const liveSnapshot = trackerEligible && detail ? await buildLiveSnapshot(matchId, detail, events) : null;

  const pending = predictions.filter((p) => p.status === "pending");
  const graded = predictions.filter((p) => p.status !== "pending");

  const venueName = detail?.venue ?? match.venue;
  const attendance = detail?.attendance ?? null;
  const referee = detail?.officials?.[0] ?? null;
  const subLine = [
    venueName,
    attendance ? `${attendance.toLocaleString("en-US")} attendance` : null,
    referee,
  ]
    .filter(Boolean)
    .join(" · ");

  const sameMatchday = (round?.matches ?? []).filter((m) => m.id !== match.id);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      {/* Hero */}
      <section className="space-y-3 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/45">
          {meta.label}
          {roundLabel ? ` · ${roundLabel}` : ""}
        </p>
        <LiveMatch match={match} />
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
          {matchWhen(match)}
        </p>
        {subLine ? <p className="text-xs text-foreground/45">{subLine}</p> : null}
        <div className="flex justify-center pt-1">
          <ShareButton
            url={`/football/match/${match.id}`}
            title={`${match.home.name} v ${match.away.name} · ${meta.label}`}
            text={
              match.state === "post"
                ? `${match.home.name} ${match.home_score}–${match.away_score} ${match.away.name} · ${meta.label} on TrustMeBro`
                : `${match.home.name} v ${match.away.name} · ${meta.label} · picks, odds and live tracker on TrustMeBro`
            }
          />
        </div>
      </section>

      {liveSnapshot ? (
        <LiveTracker
          matchId={match.id}
          competition={match.competition}
          datetime={match.datetime}
          home={match.home}
          away={match.away}
          initial={liveSnapshot}
        />
      ) : match.state === "pre" ? (
        <p className="mx-auto w-fit rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
          Live tracker starts at kickoff
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          {preview ? (
            <MatchPreview match={match} preview={preview} national={kind === "flag"} />
          ) : null}

          {detail && detail.leaders.length > 0 ? (
            <MatchLeaders
              match={match}
              leaders={detail.leaders}
              national={kind === "flag"}
              competitionLabel={meta.label}
            />
          ) : null}

          <EngineSection pending={pending} graded={graded} finished={match.state === "post"} />

          <section className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl uppercase tracking-tight">Call the score</h2>
              <Link
                href="/football/predictions"
                className="text-sm font-semibold text-primary hover:text-primary-hover"
              >
                Whole matchday →
              </Link>
            </div>
            <div className="max-w-md">
              <ScoreCall
                matchId={match.id}
                competition={match.competition}
                home={{ name: match.home.name, abbreviation: match.home.abbreviation, crest: match.home.crest }}
                away={{ name: match.away.name, abbreviation: match.away.abbreviation, crest: match.away.crest }}
                kickoff={match.datetime ?? new Date(`${match.date}T00:00:00Z`).toISOString()}
                initial={ownCalls.get(match.id) ?? null}
                locked={callLocked}
                finalScore={match.finished ? { home: match.home_score, away: match.away_score } : null}
                publicSummary={callSummary.get(match.id) ?? null}
              />
            </div>
          </section>

          <OddsSection match={match} markets={markets} oddsHistory={oddsHistory} />

          <FormSection match={match} detail={detail} h2h={h2h} kind={kind} />

          {detail && (detail.stats.home.length > 0 || detail.stats.away.length > 0) ? (
            <StatsSection match={match} detail={detail} />
          ) : null}

          {detail && detail.lineups.length > 0 ? (
            <LineupsSection match={match} detail={detail} />
          ) : null}

          <TimelineSection match={match} detail={detail} />
        </div>

        <aside className="space-y-8">
          <NewsAside news={news} />
          <SameMatchdayAside
            matches={sameMatchday}
            roundLabel={round?.label ?? null}
          />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engine on this match
// ---------------------------------------------------------------------------
function EngineSection({
  pending,
  graded,
  finished,
}: {
  pending: PredictionDetail[];
  graded: PredictionDetail[];
  finished: boolean;
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl uppercase tracking-tight">Engine on this match</h2>

      {pending.length === 0 && graded.length === 0 ? (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-8 text-center text-sm text-foreground/55">
          {finished
            ? "The engine made no picks on this match — it wasn't priced by the books in time."
            : "No picks yet — the engine generates them once odds are in for this match, usually the day before kickoff."}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {pending.map((p) =>
            p.is_banko ? (
              <BankoCard key={p.id} pick={p} />
            ) : (
              <div key={p.id} className="rounded-3xl border border-border/60 bg-card/40 p-5">
                <PickLine pick={p} />
              </div>
            ),
          )}
        </div>
      ) : null}

      {graded.length > 0 ? (
        <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
          {graded.map((p) => (
            <SettledPickRow key={p.id} pick={p} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Odds
// ---------------------------------------------------------------------------
function OddsSection({
  match,
  markets,
  oddsHistory,
}: {
  match: MatchRow;
  markets: MarketRates[];
  oddsHistory: Awaited<ReturnType<typeof getOddsHistory>>;
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl uppercase tracking-tight">Odds</h2>

      {markets.length > 0 ? (
        <MatchRates match={match} markets={markets} />
      ) : (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-4 py-6 text-center text-sm text-foreground/45">
          {match.state === "post"
            ? "No pre-match prices were captured for this match."
            : "No priced markets yet — odds populate in the day or so before kickoff."}
        </p>
      )}

      <div className="rounded-3xl border border-border/60 bg-card/40 p-4 sm:p-5">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
          Odds movement
        </h3>
        <OddsMovement points={oddsHistory} homeName={match.home.name} awayName={match.away.name} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Form (last five + head-to-head)
// ---------------------------------------------------------------------------
function ResultChip({ r, kind }: { r: RecentResult; kind: "flag" | "crest" }) {
  const tone =
    r.result === "W"
      ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
      : r.result === "L"
        ? "bg-rose-400/15 text-rose-300 ring-rose-400/30"
        : "bg-white/8 text-foreground/60 ring-white/10";
  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${tone}`}
      title={`${r.result} ${r.goals_for}-${r.goals_against} vs ${r.opponent.name} (${r.competition_name})`}
    >
      <span className="text-[10px] font-black">{r.result}</span>
      {kind === "flag" ? (
        <CountryFlag crest={r.opponent.crest} abbr={r.opponent.abbreviation} name={r.opponent.name} size={16} />
      ) : (
        <TeamCrest crest={r.opponent.crest} name={r.opponent.name} size={16} />
      )}
      <span className="font-semibold tabular-nums">
        {r.goals_for}-{r.goals_against}
      </span>
    </div>
  );
}

function TeamFormRow({
  name,
  results,
  kind,
}: {
  name: string;
  results: RecentResult[];
  kind: "flag" | "crest";
}) {
  if (results.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55">{name}</p>
      <div className="flex flex-wrap gap-2">
        {results.slice(0, 5).map((r) => (
          <ResultChip key={r.event_id} r={r} kind={kind} />
        ))}
      </div>
    </div>
  );
}

function H2HRow({ m, kind }: { m: MatchRow; kind: "flag" | "crest" }) {
  const dateLabel = m.datetime
    ? new Date(m.datetime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : m.date;
  const Crest = kind === "flag" ? CountryFlag : TeamCrest;
  return (
    <Link
      href={`/football/match/${m.id}`}
      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/[0.04]"
    >
      <span className="w-[5.5rem] shrink-0 text-[11px] tabular-nums text-foreground/50">{dateLabel}</span>
      <span className="flex flex-1 items-center justify-center gap-2 truncate">
        <Crest crest={m.home.crest} abbr={m.home.abbreviation} name={m.home.name} size={16} />
        <span className="truncate">{m.home.abbreviation || m.home.name}</span>
        <span className="font-mono tabular-nums text-foreground/80">
          {m.home_score}–{m.away_score}
        </span>
        <span className="truncate">{m.away.abbreviation || m.away.name}</span>
        <Crest crest={m.away.crest} abbr={m.away.abbreviation} name={m.away.name} size={16} />
      </span>
    </Link>
  );
}

function FormSection({
  match,
  detail,
  h2h,
  kind,
}: {
  match: MatchRow;
  detail: MatchDetail | null;
  h2h: MatchRow[];
  kind: "flag" | "crest";
}) {
  const homeForm = detail?.last_five.home ?? [];
  const awayForm = detail?.last_five.away ?? [];
  if (homeForm.length === 0 && awayForm.length === 0 && h2h.length === 0) return null;

  return (
    <section className="space-y-5">
      <h2 className="font-display text-xl uppercase tracking-tight">Form</h2>

      {homeForm.length > 0 || awayForm.length > 0 ? (
        <div className="space-y-4 rounded-3xl border border-border/60 bg-card/40 p-4 sm:p-5">
          <TeamFormRow name={match.home.name} results={homeForm} kind={kind} />
          <TeamFormRow name={match.away.name} results={awayForm} kind={kind} />
        </div>
      ) : null}

      {h2h.length === 0 ? (
        <p className="text-xs text-foreground/45">
          <span className="font-semibold uppercase tracking-wide text-foreground/55">Head to head</span>
          {" · "}no previous meetings on our record.
        </p>
      ) : null}
      {h2h.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/55">
            Head to head
          </p>
          <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
            {h2h.map((m) => (
              <H2HRow key={m.id} m={m} kind={kind} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Match stats
// ---------------------------------------------------------------------------
function numericMagnitude(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function StatsSection({ match, detail }: { match: MatchRow; detail: MatchDetail }) {
  const byKey = new Map<string, { label: string; home: string | null; away: string | null }>();
  for (const s of detail.stats.home) {
    byKey.set(s.key, { label: s.label, home: s.value, away: null });
  }
  for (const s of detail.stats.away) {
    const existing = byKey.get(s.key);
    if (existing) existing.away = s.value;
    else byKey.set(s.key, { label: s.label, home: null, away: s.value });
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl uppercase tracking-tight">Match stats</h2>
      <div className="space-y-3 rounded-3xl border border-border/60 bg-card/40 p-4 sm:p-5">
        {[...byKey.values()].map((row) => {
          const homeVal = row.home ?? "0";
          const awayVal = row.away ?? "0";
          const homeMag = numericMagnitude(homeVal);
          const awayMag = numericMagnitude(awayVal);
          const total = homeMag + awayMag;
          const homePct = total > 0 ? (homeMag / total) * 100 : 50;
          return (
            <div key={row.label}>
              <div className="flex items-center justify-between text-sm font-bold tabular-nums">
                <span>{row.home ?? "—"}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
                  {row.label}
                </span>
                <span>{row.away ?? "—"}</span>
              </div>
              <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/8" aria-hidden>
                <div className="bg-primary" style={{ width: `${homePct}%` }} />
                <div className="bg-white/40" style={{ width: `${100 - homePct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-foreground/40">
        {match.home.abbreviation || match.home.name} left · {match.away.abbreviation || match.away.name} right
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Lineups
// ---------------------------------------------------------------------------
function LineupsSection({ match, detail }: { match: MatchRow; detail: MatchDetail }) {
  const home = detail.lineups.find((l) => l.side === "home");
  const away = detail.lineups.find((l) => l.side === "away");

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl uppercase tracking-tight">Lineups</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { team: match.home, lineup: home },
          { team: match.away, lineup: away },
        ].map(({ team, lineup }) => {
          if (!lineup || lineup.players.length === 0) return null;
          const starters = lineup.players.filter((p) => p.starter);
          const subs = lineup.players.filter((p) => !p.starter);
          return (
            <div key={team.id} className="rounded-3xl border border-border/60 bg-card/40 p-4 sm:p-5">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold">{team.name}</p>
                {lineup.formation ? (
                  <span className="shrink-0 text-xs font-mono tabular-nums text-foreground/50">
                    {lineup.formation}
                  </span>
                ) : null}
              </div>
              <ul className="space-y-1 text-sm">
                {starters.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-foreground/85">
                    <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-foreground/45">
                      {p.jersey ?? ""}
                    </span>
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] uppercase text-foreground/40">
                      {p.position}
                    </span>
                  </li>
                ))}
              </ul>
              {subs.length > 0 ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-foreground/45 hover:text-foreground/70">
                    Substitutes ({subs.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {subs.map((p, i) => (
                      <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-foreground/60">
                        <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-foreground/40">
                          {p.jersey ?? ""}
                        </span>
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] uppercase text-foreground/35">
                          {p.position}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Timeline / commentary
// ---------------------------------------------------------------------------
function TimelineSection({ match, detail }: { match: MatchRow; detail: MatchDetail | null }) {
  if (match.state === "pre") return null;
  const commentary = (detail?.commentary ?? []).slice(0, 12);

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl uppercase tracking-tight">Timeline</h2>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <MatchEvents
          matchId={match.id}
          home={match.home.name}
          away={match.away.name}
          competitionName={COMPETITIONS[match.competition].label}
        />
        {commentary.length > 0 ? (
          <details className="border-t border-border/40 px-4 py-3">
            <summary className="cursor-pointer text-center text-[11px] font-semibold uppercase tracking-wide text-foreground/45 hover:text-foreground/70">
              Commentary
            </summary>
            <ul className="mt-3 space-y-2">
              {commentary.map((c, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-9 shrink-0 tabular-nums text-xs text-foreground/45">{c.minute}</span>
                  <span className="text-foreground/75">{c.text}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Aside — news + same matchday
// ---------------------------------------------------------------------------
function NewsCard({ item }: { item: NewsLite }) {
  const when = new Date(item.published_at);
  const whenLabel = Number.isFinite(when.getTime())
    ? when.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  const isExternal = item.source_url?.startsWith("http");

  return (
    <article className="rounded-2xl border border-border/60 bg-card/40 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ring-1 ${
            item.is_engine_take
              ? "bg-primary/15 text-primary ring-primary/30"
              : "bg-foreground/5 text-foreground/70 ring-border"
          }`}
        >
          {item.is_engine_take ? "Engine Take" : item.outlet}
        </span>
        {whenLabel ? <span className="text-[11px] tabular-nums text-foreground/40">{whenLabel}</span> : null}
      </div>
      {item.headline ? (
        <h4 className="mt-1.5 text-sm font-semibold leading-snug">{item.headline}</h4>
      ) : null}
      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-foreground/60">{item.summary}</p>
      {item.source_url && isExternal ? (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80"
        >
          Read on {item.outlet} <ExternalLink size={11} />
        </a>
      ) : null}
    </article>
  );
}

function NewsAside({ news }: { news: NewsLite[] }) {
  if (news.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/45">News</h2>
      <div className="space-y-3">
        {news.map((n) => (
          <NewsCard key={n.id} item={n} />
        ))}
      </div>
    </section>
  );
}

function SameMatchdayRow({ m }: { m: MatchRow }) {
  const when =
    m.state === "in"
      ? m.clock ?? "Live"
      : m.state === "post"
        ? "FT"
        : m.datetime
          ? new Date(m.datetime).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/Los_Angeles",
            })
          : "TBD";
  return (
    <Link
      href={`/football/match/${m.id}`}
      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm hover:bg-white/[0.04]"
    >
      <span className="min-w-0 truncate">
        {m.home.abbreviation || m.home.name} v {m.away.abbreviation || m.away.name}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-foreground/50">
        {m.state === "pre" ? when : `${m.home_score}–${m.away_score} · ${when}`}
      </span>
    </Link>
  );
}

function SameMatchdayAside({ matches, roundLabel }: { matches: MatchRow[]; roundLabel: string | null }) {
  if (matches.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/45">
        Same matchday{roundLabel ? ` · ${roundLabel}` : ""}
      </h2>
      <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        {matches.map((m) => (
          <SameMatchdayRow key={m.id} m={m} />
        ))}
      </div>
    </section>
  );
}
