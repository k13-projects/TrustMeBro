import Link from "next/link";
import { getRequester } from "@/lib/identity";

// Top-nav identity. Auth users see their Google display name; guests see
// the name they picked. Both can sign out from the same button.
export async function IdentityBadge() {
  const me = await getRequester();

  if (!me) {
    return (
      <Link
        href="/login"
        className="hidden sm:inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-white/10 transition-colors"
      >
        Sign in
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
