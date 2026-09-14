import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { RecentResult, SquadPlayer } from "@/lib/sports/soccer";
import { soccerProvider } from "@/lib/sports/soccer";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { isFollowing } from "@/lib/sports/soccer/follow-queries";
import { COMPETITIONS, type SoccerCompetition } from "@/lib/sports/soccer/competitions";
import {
  getMatchesForTeam,
  getNewsForTeam,
  getPredictionsForTeam,
  getStandingForTeam,
  getTeamById,
  type MatchRow as MatchRowData,
  type StandingRow,
  type TeamRow,
} from "@/lib/sports/soccer/queries";
import { CountryFlag } from "@/components/soccer/CountryFlag";
import { FollowButton } from "@/components/soccer/FollowButton";
import { accentColor } from "@/components/soccer/MatchBanner";
import { MatchRow } from "@/components/soccer/MatchRow";
import { PickLine } from "@/components/soccer/PickLine";
import { SettledPickRow } from "@/components/soccer/SettledPickRow";
import {
  SoccerNewsCard,
  type SoccerNewsCardItem,
  type SoccerNewsCardTeam,
} from "@/components/soccer/SoccerNewsCard";
import { TeamCrest } from "@/components/soccer/TeamCrest";

export const dynamic = "force-dynamic";

// Isolated behind a plain function (not the component body) so the
// "upcoming vs. played" split below reads as a pure computation off `now`.
function nowMs(): number {
  return Date.now();
}

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) return { title: "Club · TrustMeBro" };
  const [team, competition] = await Promise.all([getTeamById(teamId), activeCompetition()]);
  if (!team) return { title: "Club · TrustMeBro" };
  return { title: `${team.name} · ${COMPETITIONS[competition].label} · TrustMeBro` };
}

export default async function ClubPage({ params }: PageProps) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) notFound();

  const competition = await activeCompetition();
  const meta = COMPETITIONS[competition];
  const isNational = meta.kind === "national";

  const team = await getTeamById(teamId);
  if (!team) notFound();

  const provider = soccerProvider(competition);

  const [standing, matches, predictions, news, profile, schedule, squad, following] =
    await Promise.all([
    getStandingForTeam(competition, teamId),
    getMatchesForTeam(teamId),
    getPredictionsForTeam(teamId),
    getNewsForTeam(teamId),
    provider.getTeamProfile(teamId),
    provider.getTeamSchedule(teamId),
    provider.getTeamSquad(teamId),
    isFollowing(teamId),
  ]);

  const now = nowMs();

  // Cross-competition form: last 10 already-played fixtures, oldest→newest so
  // the strip reads left-to-right like a timeline. Upcoming ESPN rows report
  // "D" / 0-0 placeholders — date > now is what actually marks them unplayed.
  const formResults = schedule.filter((r) => new Date(r.date).getTime() <= now).slice(0, 10);
  const formRecord = formResults.reduce(
    (acc, r) => {
      if (r.result === "W") acc.w += 1;
      else if (r.result === "L") acc.l += 1;
      else acc.d += 1;
      acc.gf += r.goals_for;
      acc.ga += r.goals_against;
      return acc;
    },
    { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
  );

  // Upcoming: our own tracked fixtures (real MatchRow, live-capable) plus any
  // ESPN fixture (domestic league, etc.) we don't track, deduped by event id —
  // soccer_matches.id IS the ESPN event id, so a plain id check is enough.
  const dbUpcoming = matches.filter((m) => !m.finished);
  const dbUpcomingIds = new Set(dbUpcoming.map((m) => m.id));
  const espnUpcoming = schedule.filter(
    (r) => new Date(r.date).getTime() > now && !dbUpcomingIds.has(r.event_id),
  );
  type UpcomingItem =
    | { kind: "db"; when: number; match: MatchRowData }
    | { kind: "espn"; when: number; result: RecentResult };
  const upcomingItems: UpcomingItem[] = [
    ...dbUpcoming.map((m): UpcomingItem => ({
      kind: "db",
      when: m.datetime ? new Date(m.datetime).getTime() : new Date(`${m.date}T12:00:00Z`).getTime(),
      match: m,
    })),
    ...espnUpcoming.map((r): UpcomingItem => ({ kind: "espn", when: new Date(r.date).getTime(), result: r })),
  ]
    .sort((a, b) => a.when - b.when)
    .slice(0, 5);

  const dbResults = matches.filter((m) => m.finished).slice(0, 10);

  const pending = predictions.filter((p) => p.status === "pending");
  const graded = predictions.filter((p) => p.status !== "pending");
  const wins = graded.filter((p) => p.status === "won").length;
  const losses = graded.filter((p) => p.status === "lost").length;
  const voids = graded.filter((p) => p.status === "void").length;
  const units = wins - losses;

  const newsItems: SoccerNewsCardItem[] = news.map((n) => ({
    id: n.id,
    source_url: n.source_url,
    outlet: n.outlet,
    author: null,
    headline: n.headline,
    summary: n.summary,
    image_url: n.image_url,
    team_ids: [team.id],
    player_names: [],
    is_engine_take: n.is_engine_take,
    published_at: n.published_at,
  }));
  const teamById = new Map<number, SoccerNewsCardTeam>([
    [team.id, { id: team.id, name: team.name, abbreviation: team.abbreviation, crest: team.crest }],
  ]);

  const squadByGroup = new Map<SquadGroup, SquadPlayer[]>();
  for (const p of squad) {
    const g = squadGroup(p.position);
    const list = squadByGroup.get(g) ?? [];
    list.push(p);
    squadByGroup.set(g, list);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <ClubHeader
        team={team}
        competition={competition}
        standing={standing}
        venue={profile?.venue ?? null}
        standingSummary={profile?.standing_summary ?? null}
        isNational={isNational}
        following={following}
      />

      <section className="space-y-4">
        <SectionTitle title="Form" />
        {formResults.length === 0 ? (
          <EmptyCard text="No recent results on file yet — the form strip fills in once this side has played." />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-bold tabular-nums text-foreground/85">
                {formRecord.w}W – {formRecord.d}D – {formRecord.l}L
              </span>
              <span className="tabular-nums text-foreground/55">
                {formRecord.gf}–{formRecord.ga} GF–GA in this run
              </span>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-2">
                {[...formResults].reverse().map((r) => (
                  <FormChip key={r.event_id} result={r} />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <SectionTitle title="Fixtures & Results" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">
              Upcoming
            </h3>
            {upcomingItems.length === 0 ? (
              <EmptyCard text="No fixtures scheduled yet." />
            ) : (
              <div className="space-y-3">
                {upcomingItems.map((item) =>
                  item.kind === "db" ? (
                    <MatchRow key={`db-${item.match.id}`} match={item.match} />
                  ) : (
                    <EspnFixtureRow key={`espn-${item.result.event_id}`} result={item.result} />
                  ),
                )}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">
              Results
            </h3>
            {dbResults.length === 0 ? (
              <EmptyCard text="No results recorded yet." />
            ) : (
              <div className="space-y-3">
                {dbResults.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle title="Engine On This Club" />
        {predictions.length === 0 ? (
          <EmptyCard text="Picks land once a match involving this club is priced." />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Wins" value={String(wins)} tone="text-emerald-400" />
              <Stat label="Losses" value={String(losses)} tone="text-rose-400" />
              <Stat label="Voids" value={String(voids)} />
              <Stat
                label="Units"
                value={`${units > 0 ? "+" : ""}${units}`}
                tone={units > 0 ? "text-emerald-400" : units < 0 ? "text-rose-400" : ""}
              />
            </div>
            {pending.length > 0 ? (
              <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/40 px-4">
                {pending.map((p) => (
                  <PickLine key={p.id} pick={p} />
                ))}
              </div>
            ) : null}
            {graded.length > 0 ? (
              <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                {graded.map((p) => (
                  <SettledPickRow key={p.id} pick={p} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle title="Squad" />
        {squad.length === 0 ? (
          <EmptyCard text="No squad list available for this team yet." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {SQUAD_GROUP_ORDER.filter(({ key }) => (squadByGroup.get(key)?.length ?? 0) > 0).map(
              ({ key, label }) => {
                const players = sortSquad(squadByGroup.get(key) ?? []);
                const visible = players.slice(0, 6);
                const rest = players.slice(6);
                return (
                  <div key={key} className="rounded-2xl border border-border/60 bg-card/40 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-display text-sm uppercase tracking-[0.08em]">{label}</span>
                      <span className="text-[11px] text-foreground/45">{players.length}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {visible.map((p) => (
                        <SquadRow key={p.id} player={p} />
                      ))}
                    </ul>
                    {rest.length > 0 ? (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.14em] text-primary hover:text-primary-hover">
                          Show all {players.length}
                        </summary>
                        <ul className="mt-1.5 space-y-1.5">
                          {rest.map((p) => (
                            <SquadRow key={p.id} player={p} />
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                );
              },
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle title="News" />
        {newsItems.length === 0 ? (
          <EmptyCard text="No recent news tagged to this club yet." />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {newsItems.map((it) => (
              <SoccerNewsCard key={it.id} item={it} teamById={teamById} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local presentation helpers — this page is the only caller.
// ---------------------------------------------------------------------------

function ClubHeader({
  team,
  competition,
  standing,
  venue,
  standingSummary,
  isNational,
  following,
}: {
  team: TeamRow;
  competition: SoccerCompetition;
  standing: StandingRow | null;
  venue: string | null;
  standingSummary: string | null;
  isNational: boolean;
  following: boolean;
}) {
  const meta = COMPETITIONS[competition];
  const accent = isNational ? null : accentColor(team.color);
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {isNational ? (
          <CountryFlag crest={team.crest} abbr={team.abbreviation} name={team.name} size={56} />
        ) : (
          <TeamCrest crest={team.crest} name={team.name} size={56} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {[
              // ESPN's "location" doubles as the club name for most clubs; only
              // show it when it's actually a place (national teams, "Bodø").
              team.country && team.country.toLowerCase() !== team.name.toLowerCase()
                ? team.country
                : null,
              team.abbreviation,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h1 className="mt-1 font-display uppercase text-[clamp(1.8rem,4.4vw,3.2rem)] leading-[0.95] tracking-[-0.01em]">
            {team.name}
          </h1>
          {venue || standingSummary ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-foreground/60">
              {venue ? <span>{venue}</span> : null}
              {venue && standingSummary ? <span aria-hidden>·</span> : null}
              {standingSummary ? <span>{standingSummary}</span> : null}
            </p>
          ) : null}
        </div>
        <FollowButton
          teamId={team.id}
          teamName={team.name}
          initialFollowing={following}
        />
      </div>

      {accent ? (
        <div aria-hidden className="h-1 w-full rounded-full" style={{ background: accent }} />
      ) : null}

      {standing ? (
        <div className="space-y-1.5 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-xs uppercase tracking-[0.14em] text-foreground/50">
              {meta.label} table
            </span>
            <Link
              href="/football/standings"
              className="shrink-0 py-1 -my-1 text-xs font-semibold text-primary hover:text-primary-hover"
            >
              Full table →
            </Link>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max items-center gap-4">
              <span className="font-bold tabular-nums">#{standing.rank}</span>
              <span className="tabular-nums text-foreground/70">P {standing.played}</span>
              <span className="tabular-nums text-foreground/70">W {standing.won}</span>
              <span className="tabular-nums text-foreground/70">D {standing.draw}</span>
              <span className="tabular-nums text-foreground/70">L {standing.lost}</span>
              <span className="tabular-nums text-foreground/70">
                GD {standing.goal_diff > 0 ? `+${standing.goal_diff}` : standing.goal_diff}
              </span>
              <span className="font-bold tabular-nums">{standing.points} PTS</span>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="font-display text-xl uppercase tracking-tight sm:text-2xl">{title}</h2>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-foreground/55">
      {text}
    </p>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 px-5 py-4 text-center">
      <div className={`text-3xl font-black tabular-nums ${tone ?? ""}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-foreground/50">{label}</div>
    </div>
  );
}

function FormChip({ result }: { result: RecentResult }) {
  const tone =
    result.result === "W"
      ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
      : result.result === "L"
        ? "bg-rose-400/15 text-rose-300 ring-rose-400/30"
        : "bg-white/8 text-foreground/60 ring-white/10";
  const when = new Date(result.date);
  const dateLabel = Number.isFinite(when.getTime())
    ? when.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  return (
    <span
      title={`${dateLabel} · ${result.competition_name} · ${result.home_away === "H" ? "vs" : "@"} ${result.opponent.name} ${result.goals_for}-${result.goals_against}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ring-1 ${tone}`}
    >
      <TeamCrest crest={result.opponent.crest} name={result.opponent.abbreviation || result.opponent.name} size={16} />
      {result.result}
      <span className="tabular-nums text-foreground/70">
        {result.goals_for}-{result.goals_against}
      </span>
    </span>
  );
}

function EspnFixtureRow({ result }: { result: RecentResult }) {
  const when = new Date(result.date);
  const dateLabel = Number.isFinite(when.getTime())
    ? when.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/Los_Angeles",
      })
    : "TBD";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-4 py-3">
      <TeamCrest
        crest={result.opponent.crest}
        name={result.opponent.abbreviation || result.opponent.name}
        size={28}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {result.home_away === "H" ? "vs" : "@"} {result.opponent.name}
        </div>
        <div className="truncate text-[11px] uppercase tracking-[0.14em] text-foreground/45">
          {result.competition_name}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs font-semibold uppercase tracking-wide text-foreground/60">
        {dateLabel}
      </div>
    </div>
  );
}

function SquadRow({ player }: { player: SquadPlayer }) {
  const meta = [player.age ? `${player.age}y` : null, player.nationality].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className="w-6 shrink-0 text-right tabular-nums text-foreground/45">
        {player.jersey ?? "—"}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{player.name}</span>
      {meta ? <span className="shrink-0 text-xs text-foreground/50">{meta}</span> : null}
    </li>
  );
}

type SquadGroup = "GK" | "DEF" | "MID" | "FWD" | "OTH";

const SQUAD_GROUP_ORDER: Array<{ key: SquadGroup; label: string }> = [
  { key: "GK", label: "Goalkeepers" },
  { key: "DEF", label: "Defenders" },
  { key: "MID", label: "Midfielders" },
  { key: "FWD", label: "Forwards" },
  { key: "OTH", label: "Other" },
];

const SQUAD_GROUP_MAP: Record<string, SquadGroup> = {
  G: "GK",
  GK: "GK",
  GOALKEEPER: "GK",
  D: "DEF",
  DF: "DEF",
  CB: "DEF",
  LB: "DEF",
  RB: "DEF",
  LWB: "DEF",
  RWB: "DEF",
  SW: "DEF",
  DEFENDER: "DEF",
  DEFENCE: "DEF",
  DEFENSE: "DEF",
  M: "MID",
  MF: "MID",
  CM: "MID",
  DM: "MID",
  CDM: "MID",
  AM: "MID",
  CAM: "MID",
  LM: "MID",
  RM: "MID",
  MIDFIELDER: "MID",
  MIDFIELD: "MID",
  F: "FWD",
  FW: "FWD",
  ST: "FWD",
  CF: "FWD",
  LW: "FWD",
  RW: "FWD",
  W: "FWD",
  FORWARD: "FWD",
  STRIKER: "FWD",
  WINGER: "FWD",
  ATTACKER: "FWD",
};

function squadGroup(position: string): SquadGroup {
  return SQUAD_GROUP_MAP[position.trim().toUpperCase()] ?? "OTH";
}

function sortSquad(players: SquadPlayer[]): SquadPlayer[] {
  return [...players].sort((a, b) => {
    const an = a.jersey ? Number(a.jersey) : Number.POSITIVE_INFINITY;
    const bn = b.jersey ? Number(b.jersey) : Number.POSITIVE_INFINITY;
    const aFinite = Number.isFinite(an);
    const bFinite = Number.isFinite(bn);
    if (aFinite && bFinite && an !== bn) return an - bn;
    if (aFinite !== bFinite) return aFinite ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
