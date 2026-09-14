"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { cx, disabledStyles, focusRingInset } from "@/lib/design/tokens";

// Follow a club and the site starts leading with their matches. Optimistic,
// because the round trip is a write we can safely assume succeeds and undo
// visibly if it doesn't.
export function FollowButton({
  teamId,
  teamName,
  initialFollowing,
  size = "md",
  className,
}: {
  teamId: number;
  teamName: string;
  initialFollowing: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      const res = await fetch("/api/soccer/follows", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId }),
      });
      if (res.status === 401) {
        setFollowing(!next);
        toast.error("Pick a name first", {
          description: "Sign in or choose a guest name to follow clubs.",
        });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      toast.success(next ? `Following ${teamName}` : `Unfollowed ${teamName}`);
    } catch {
      setFollowing(!next);
      toast.error("Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  }

  const sm = size === "sm";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      aria-label={following ? `Unfollow ${teamName}` : `Follow ${teamName}`}
      title={following ? `Unfollow ${teamName}` : `Follow ${teamName}`}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide transition-colors",
        sm ? "min-h-6 px-2 py-1.5 text-[10px]" : "min-h-8 px-3 py-1.5 text-[11px]",
        following
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/70 text-foreground/60 hover:border-primary/50 hover:text-foreground",
        disabledStyles,
        focusRingInset,
        className,
      )}
    >
      <Star
        size={sm ? 11 : 13}
        aria-hidden
        className={following ? "fill-current" : ""}
      />
      {sm ? null : following ? "Following" : "Follow"}
    </button>
  );
}
