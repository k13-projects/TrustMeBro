import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequester } from "@/lib/identity";
import {
  collectTeams,
  loadBroStats,
  loadFollowCounts,
  loadFollowState,
  loadProfileByHandle,
  loadProfileCoupons,
} from "@/lib/bros/loaders";
import { BroAvatar } from "@/components/bros/BroAvatar";
import { BroStatStrip } from "@/components/bros/BroStatStrip";
import { FollowButton } from "@/components/bros/FollowButton";
import { SharedCouponCard } from "@/components/bros/SharedCouponCard";

export const revalidate = 30;

type PageProps = {
  params: Promise<{ handle: string }>;
};

export default async function BroProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const profile = await loadProfileByHandle(handle);
  if (!profile) notFound();

  const requester = await getRequester();
  const viewerUserId =
    requester?.kind === "auth" ? requester.user_id : null;
  const isSelf = viewerUserId === profile.user_id;
  const canFollow = !!viewerUserId && !isSelf;

  const [stats, coupons, counts, initialFollowing] = await Promise.all([
    loadBroStats(profile.user_id),
    loadProfileCoupons(profile.user_id),
    loadFollowCounts(profile.user_id),
    viewerUserId && !isSelf
      ? loadFollowState(viewerUserId, profile.user_id)
      : Promise.resolve(false),
  ]);
  const teamById = await collectTeams(coupons);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <header className="glass-strong rounded-3xl p-5 sm:p-6 flex items-start gap-4 sm:gap-6 flex-wrap sm:flex-nowrap">
        <BroAvatar
          handle={profile.handle}
          displayName={profile.display_name}
          avatarUrl={profile.avatar_url}
          size={88}
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {profile.display_name}
            </h1>
            <span className="font-mono text-sm text-foreground/55">
              @{profile.handle}
            </span>
          </div>
          {profile.bio ? (
            <p className="text-sm text-foreground/65 max-w-prose">
              {profile.bio}
            </p>
          ) : null}
          <div className="flex items-center gap-4 text-xs text-foreground/55">
            <span>
              <span className="text-foreground/85 font-mono tabular-nums">
                {counts.followers}
              </span>{" "}
              followers
            </span>
            <span>
              <span className="text-foreground/85 font-mono tabular-nums">
                {counts.following}
              </span>{" "}
              following
            </span>
          </div>
        </div>
        <div className="shrink-0">
          <FollowButton
            followeeId={profile.user_id}
            initialFollowing={initialFollowing}
            canFollow={canFollow}
            isSelf={isSelf}
            redirectAfterAuth={`/bros/${profile.handle}`}
          />
        </div>
      </header>

      <BroStatStrip stats={stats} />

      <section className="space-y-3">
        <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          Shared coupons
        </h2>
        {coupons.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-foreground/55">
            {isSelf ? (
              <>
                You haven't shared any coupons yet.{" "}
                <Link
                  href="/history?tab=coupons"
                  className="text-primary hover:text-primary-hover underline-offset-4 hover:underline"
                >
                  Share one from your history.
                </Link>
              </>
            ) : (
              <>@{profile.handle} hasn't shared any coupons yet.</>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {coupons.map((c) => (
              <SharedCouponCard
                key={c.id}
                coupon={c}
                teamById={teamById}
                hideOwner
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
