"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  followeeId: string;
  initialFollowing: boolean;
  // null = unauthenticated (or guest), so the button routes to login.
  canFollow: boolean;
  // self-view — render disabled "you" badge instead of a button
  isSelf?: boolean;
  redirectAfterAuth?: string;
};

export function FollowButton({
  followeeId,
  initialFollowing,
  canFollow,
  isSelf,
  redirectAfterAuth,
}: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  if (isSelf) {
    return (
      <span className="inline-flex items-center rounded-full bg-white/8 border border-white/12 px-3 py-1.5 text-xs uppercase tracking-widest text-foreground/60">
        You
      </span>
    );
  }

  if (!canFollow) {
    const next = redirectAfterAuth ?? "/bros";
    return (
      <button
        type="button"
        onClick={() => router.push(`/login?next=${encodeURIComponent(next)}`)}
        className="inline-flex items-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors"
      >
        Sign in to follow
      </button>
    );
  }

  const onClick = () => {
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const res = await fetch("/api/follows", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followee_id: followeeId }),
      });
      if (!res.ok) {
        setFollowing(!next);
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={following}
      className={
        following
          ? "inline-flex items-center rounded-full bg-white/8 border border-white/15 hover:bg-rose-400/15 hover:border-rose-400/40 hover:text-rose-200 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors disabled:opacity-60 group"
          : "inline-flex items-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors disabled:opacity-60"
      }
    >
      {following ? (
        <span>
          <span className="group-hover:hidden">Following</span>
          <span className="hidden group-hover:inline">Unfollow</span>
        </span>
      ) : (
        "Follow"
      )}
    </button>
  );
}
