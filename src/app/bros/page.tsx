import Link from "next/link";
import { getRequester } from "@/lib/identity";
import {
  collectTeams,
  listBros,
  loadFeedCoupons,
} from "@/lib/bros/loaders";
import { ActiveBrosSidebar } from "@/components/bros/ActiveBrosSidebar";
import { SharedCouponCard } from "@/components/bros/SharedCouponCard";
import { SectionHeading } from "@/components/site/SectionHeading";
import { activeSport } from "@/lib/sports/sport-cookie";
import { SPORTS } from "@/lib/sports/registry";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import {
  loadPredictionLeaderboard,
  type LeaderboardRow,
} from "@/lib/sports/soccer/predictions-queries";
import { BroAvatar } from "@/components/bros/BroAvatar";

export const revalidate = 60;

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

type FeedTab = "all" | "following";

export default async function BroBoardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedTab: FeedTab = params.tab === "following" ? "following" : "all";

  const [requester, sport] = await Promise.all([getRequester(), activeSport()]);
  const isAuth = requester?.kind === "auth";
  const viewerUserId = isAuth ? requester.user_id : null;
  const tab: FeedTab =
    requestedTab === "following" && !isAuth ? "all" : requestedTab;

  const [coupons, bros] = await Promise.all([
    loadFeedCoupons({
      sport,
      followerId: tab === "following" && viewerUserId ? viewerUserId : null,
      limit: 30,
    }),
    listBros({ sport, viewerUserId, limit: 80 }),
  ]);
  const teamById = await collectTeams(coupons);

  const competition = sport === "soccer" ? await activeCompetition() : null;
  const topCallers = competition
    ? await loadPredictionLeaderboard(competition, 3)
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">
      <header className="space-y-3">
        <SectionHeading
          eyebrow={`${SPORTS[sport].competition} · The Feed`}
          title={
            <>
              <span
                style={{
                  background:
                    "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Bro
              </span>{" "}
              Board
            </>
          }
          className="mb-0"
        />
        <p className="text-sm text-foreground/55 max-w-prose">
          Coupons your fellow bros actually played. Follow the ones cashing,
          ignore the ones cold. Receipts are real — every coupon settles when
          the games finalize.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        <div className="space-y-5">
          <ActiveBrosSidebar bros={bros} canFollow={isAuth} />
          {competition ? (
            <ScoreCallersCard
              competitionLabel={COMPETITIONS[competition].label}
              rows={topCallers}
            />
          ) : null}
        </div>

        <div className="space-y-6 min-w-0">
          <nav
            className="glass rounded-full inline-flex items-center gap-1 p-1 text-sm"
            aria-label="Bro Board sections"
          >
            <TabLink href="/bros" active={tab === "all"} label="All bros" />
            <TabLink
              href="/bros?tab=following"
              active={tab === "following"}
              label="Following"
              disabled={!isAuth}
            />
          </nav>

          {coupons.length === 0 ? (
            <EmptyState tab={tab} isAuth={isAuth} />
          ) : (
            <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {coupons.map((c) => (
                <SharedCouponCard key={c.id} coupon={c} teamById={teamById} />
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  disabled,
}: {
  href: string;
  active: boolean;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        className="rounded-full text-foreground/35 px-3 py-1.5 text-sm cursor-not-allowed"
        title="Sign in to see bros you follow"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-full bg-white/12 text-foreground px-3 py-1.5 text-sm font-medium"
          : "rounded-full text-foreground/65 px-3 py-1.5 text-sm hover:bg-white/5"
      }
    >
      {label}
    </Link>
  );
}

function EmptyState({ tab, isAuth }: { tab: FeedTab; isAuth: boolean }) {
  if (tab === "following") {
    return (
      <div className="glass-strong rounded-3xl p-8 text-center space-y-3">
        <p className="text-lg font-semibold">You aren&apos;t following any bros yet.</p>
        <p className="text-sm text-foreground/55 max-w-prose mx-auto">
          Tap the <span className="text-foreground/85">+</span> next to any bro
          on the left to start a follow list, or switch back to{" "}
          <span className="text-foreground/85">All bros</span>.
        </p>
        <Link
          href="/bros"
          className="inline-flex rounded-full bg-primary text-primary-foreground hover:bg-primary-hover px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors"
        >
          Browse all bros
        </Link>
      </div>
    );
  }
  return (
    <div className="glass-strong rounded-3xl p-8 text-center space-y-3">
      <p className="text-lg font-semibold">No coupons shared yet.</p>
      <p className="text-sm text-foreground/55 max-w-prose mx-auto">
        {isAuth
          ? "Build a coupon, play it, and hit Share to Bro Board on your History page. In the meantime, find bros on the left and follow whoever's cashing."
          : "Sign in, build a coupon, and share it to kick things off. The list on the left shows everyone on Bro Board so far."}
      </p>
      <Link
        href={isAuth ? "/history?tab=coupons" : "/login?next=/bros"}
        className="inline-flex rounded-full bg-primary text-primary-foreground hover:bg-primary-hover px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors"
      >
        {isAuth ? "Your coupons" : "Sign in"}
      </Link>
    </div>
  );
}

// Compact tie-in to the Bro predictions game (/football/predictions) —
// football only. Top 3 score-callers for the active competition, or a
// pointer to go start calling scores if nobody's graded yet.
function ScoreCallersCard({
  competitionLabel,
  rows,
}: {
  competitionLabel: string;
  rows: LeaderboardRow[];
}) {
  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/55">
          Score callers · {competitionLabel}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-foreground/50">
          No graded calls yet.{" "}
          <Link href="/football/predictions" className="text-primary hover:underline">
            Call a score
          </Link>{" "}
          to be first on the board.
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.user_id} className="flex items-center gap-2.5 text-sm">
              <span className="w-3 text-xs tabular-nums text-foreground/45">{i + 1}</span>
              <BroAvatar
                handle={row.profile?.handle ?? "?"}
                displayName={row.profile?.display_name ?? "Bro"}
                avatarUrl={row.profile?.avatar_url}
                size={22}
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {row.profile?.display_name ?? "Bro"}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-primary">{row.points}</span>
            </li>
          ))}
        </ol>
      )}
      <Link
        href="/football/predictions"
        className="block text-center text-[11px] font-semibold uppercase tracking-widest text-primary hover:text-primary-hover"
      >
        Call the Scores →
      </Link>
    </div>
  );
}
