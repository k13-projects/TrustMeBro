import Link from "next/link";
import { LogIn } from "lucide-react";
import { getRequester } from "@/lib/identity";

// Top-nav identity. Signed-out users get a gold-bordered "Sign in / Sign up"
// pill — the only auth CTA on the site. Signed-in users see their display
// name with a discreet sign-out button.
export async function IdentityBadge() {
  const me = await getRequester();

  if (!me) {
    return (
      <Link
        href="/login"
        className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:bg-primary/20 hover:border-primary/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-[0_4px_18px_-6px_rgba(255,184,0,0.4)]"
      >
        <LogIn size={14} strokeWidth={2.5} aria-hidden />
        <span>Sign in</span>
        <span className="opacity-60">/</span>
        <span>Sign up</span>
      </Link>
    );
  }

  const isGuest = me.kind === "guest";
  return (
    <form
      action="/api/auth/signout"
      method="post"
      className="hidden sm:flex items-center gap-2"
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-foreground/80"
        aria-label={`Signed in as ${me.display_name}${isGuest ? " (guest)" : ""}`}
      >
        <span
          className={`size-1.5 rounded-full ${isGuest ? "bg-amber-300" : "bg-emerald-400"}`}
          aria-hidden
        />
        <span className="truncate max-w-[10rem]">{me.display_name}</span>
        {isGuest ? (
          <span className="text-[10px] uppercase tracking-widest text-foreground/45">
            Guest
          </span>
        ) : null}
      </span>
      <button
        type="submit"
        className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors"
      >
        Sign out
      </button>
    </form>
  );
}
