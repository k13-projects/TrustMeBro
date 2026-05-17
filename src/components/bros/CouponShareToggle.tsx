"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  couponId: string;
  isPublic: boolean;
  canShare: boolean; // false for guests / non-auth
  // If the user is auth but has no profile yet, the API returns 409
  // profile_required and we redirect to onboarding.
};

export function CouponShareToggle({ couponId, isPublic, canShare }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shared, setShared] = useState(isPublic);
  const [error, setError] = useState<string | null>(null);

  if (!canShare) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-foreground/45"
        title="Sign in to share coupons on Bro Board"
      >
        <LockIcon />
        Share locked
      </span>
    );
  }

  const onToggle = () => {
    setError(null);
    const next = !shared;
    setShared(next);
    startTransition(async () => {
      const res = await fetch(`/api/coupons/${couponId}/share`, {
        method: next ? "POST" : "DELETE",
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === "profile_required") {
          router.push(`/bros/onboarding?next=/history?tab=coupons`);
          return;
        }
      }
      if (!res.ok) {
        setShared(!next);
        setError("Couldn't update — try again");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={shared}
        className={
          shared
            ? "inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary border border-primary/40 px-3 py-1 text-[11px] font-medium uppercase tracking-widest hover:bg-primary/25 transition-colors disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-full bg-white/8 hover:bg-white/12 border border-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-foreground/80 transition-colors disabled:opacity-50"
        }
      >
        <ShareIcon />
        {shared ? "Shared on Bro Board" : "Share to Bro Board"}
      </button>
      {error ? (
        <span className="text-[11px] text-rose-300">{error}</span>
      ) : null}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
