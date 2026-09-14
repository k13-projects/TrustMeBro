"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { cx, focusRing } from "@/lib/design/tokens";

type Props = {
  /** Path or absolute URL to share — resolved against the current origin. */
  url: string;
  title: string;
  text?: string;
  className?: string;
};

// One-tap share: the Web Share API on phones (WhatsApp/iMessage/X all show up
// in the native sheet), falling back to copy-to-clipboard + toast on desktop.
export function ShareButton({ url, title, text, className }: Props) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    const absoluteUrl = new URL(url, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: absoluteUrl });
      } catch {
        // User cancelled the share sheet — not an error worth surfacing.
      }
      return;
    }
    setPending(true);
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link — try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label="Share"
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full bg-white/8 hover:bg-white/12 border border-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-foreground/80 transition-colors disabled:opacity-50",
        focusRing,
        className,
      )}
    >
      <Share2 className="size-3" aria-hidden />
      Share
    </button>
  );
}
