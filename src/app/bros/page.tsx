import Link from "next/link";
import { getRequester } from "@/lib/identity";
import {
  collectTeams,
  listBros,
  loadFeedCoupons,
} from "@/lib/bros/loaders";
import { ActiveBrosSidebar } from "@/components/bros/ActiveBrosSidebar";
import { SharedCouponCard } from "@/components/bros/SharedCouponCard";

export const revalidate = 60;

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

type FeedTab = "all" | "following";

export default async function BroBoardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedTab: FeedTab = params.tab === "following" ? "following" : "all";

  const requester = await getRequester();
  const isAuth = requester?.kind === "auth";
  const viewerUserId = isAuth ? requester.user_id : null;
  const tab: FeedTab =
    requestedTab === "following" && !isAuth ? "all" : requestedTab;

  const [coupons, bros] = await Promise.all([
    loadFeedCoupons({
      followerId: tab === "following" && viewerUserId ? viewerUserId : null,
      limit: 30,
    }),
    listBros({ viewerUserId, limit: 80 }),
  ]);
  const teamById = await collectTeams(coupons);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          The feed
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          Bro Board
        </h1>
        <p className="text-sm text-foreground/55 mt-1 max-w-prose">
          Coupons your fellow bros actually played. Follow the ones cashing,
          ignore the ones cold. Receipts are real — every coupon settles when
          the games finalize.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        <ActiveBrosSidebar bros={bros} canFollow={isAuth} />

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
        <p className="text-lg font-semibold">You aren't following any bros yet.</p>
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
