"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Compact follow toggle for the sidebar — single icon button, no labels.
// Unauthenticated visitors get bounced to /login with a next= param so they
// land back on /bros after sign-in.
export function QuickFollowButton({
  followeeId,
  initialFollowing,
  canFollow,
  handle,
}: {
  followeeId: string;
  initialFollowing: boolean;
  canFollow: boolean;
  handle: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  if (!canFollow) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/login?next=/bros`)}
        title={`Sign in to follow @${handle}`}
        className="shrink-0 size-7 grid place-items-center rounded-full bg-white/8 hover:bg-primary/20 hover:text-primary border border-white/10 hover:border-primary/40 transition-colors"
      >
        <PlusIcon />
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
      title={following ? `Unfollow @${handle}` : `Follow @${handle}`}
      className={
        following
          ? "shrink-0 size-7 grid place-items-center rounded-full bg-primary/15 text-primary border border-primary/30 hover:bg-rose-400/15 hover:text-rose-200 hover:border-rose-400/30 transition-colors disabled:opacity-50"
          : "shrink-0 size-7 grid place-items-center rounded-full bg-white/8 hover:bg-primary/20 hover:text-primary border border-white/10 hover:border-primary/40 transition-colors disabled:opacity-50"
      }
    >
      {following ? <CheckIcon /> : <PlusIcon />}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="size-3.5"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
