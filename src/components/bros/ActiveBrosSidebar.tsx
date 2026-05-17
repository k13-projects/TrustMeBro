import Link from "next/link";
import { BroAvatar } from "./BroAvatar";
import { QuickFollowButton } from "./QuickFollowButton";
import type { BroDirectoryEntry } from "@/lib/bros/types";

// The discovery list. Shown to the left of the /bros feed so even bros who
// haven't shared a coupon yet are findable + followable. Split into Online
// (touched in the last 5 minutes, see lib/bros/presence.ts) and the rest.
export function ActiveBrosSidebar({
  bros,
  canFollow,
}: {
  bros: BroDirectoryEntry[];
  canFollow: boolean;
}) {
  const online = bros.filter((b) => b.is_online);
  const offline = bros.filter((b) => !b.is_online);

  return (
    <aside className="space-y-5 lg:sticky lg:top-24">
      <Section
        title="Online now"
        emptyText="No bros active right now. They'll surface here when they hit the site."
        bros={online}
        dotTone="emerald"
        canFollow={canFollow}
      />
      <Section
        title="Bros"
        emptyText={
          bros.length === 0
            ? "No bros yet — claim your handle to be the first."
            : null
        }
        bros={offline}
        dotTone="muted"
        canFollow={canFollow}
      />
    </aside>
  );
}

function Section({
  title,
  emptyText,
  bros,
  dotTone,
  canFollow,
}: {
  title: string;
  emptyText: string | null;
  bros: BroDirectoryEntry[];
  dotTone: "emerald" | "muted";
  canFollow: boolean;
}) {
  if (bros.length === 0 && !emptyText) return null;
  return (
    <section className="glass rounded-2xl p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-[0.22em] text-foreground/55 font-medium">
          {title}
        </h3>
        <span className="text-[10px] font-mono tabular-nums text-foreground/40">
          {bros.length}
        </span>
      </header>
      {bros.length === 0 ? (
        <p className="text-xs text-foreground/45 leading-relaxed">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-2">
          {bros.map((b) => (
            <BroRow key={b.profile.user_id} entry={b} dotTone={dotTone} canFollow={canFollow} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BroRow({
  entry,
  dotTone,
  canFollow,
}: {
  entry: BroDirectoryEntry;
  dotTone: "emerald" | "muted";
  canFollow: boolean;
}) {
  const settled = entry.wins + entry.losses;
  const dotClass =
    dotTone === "emerald" ? "bg-emerald-400" : "bg-white/25";

  return (
    <li className="flex items-center gap-2.5">
      <Link
        href={`/bros/${entry.profile.handle}`}
        className="flex-1 min-w-0 flex items-center gap-2.5 -mx-1 px-1 py-1 rounded-lg hover:bg-white/5 transition-colors"
      >
        <div className="relative shrink-0">
          <BroAvatar
            handle={entry.profile.handle}
            displayName={entry.profile.display_name}
            avatarUrl={entry.profile.avatar_url}
            size={32}
          />
          <span
            aria-hidden
            className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[#15151a] ${dotClass}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate leading-tight">
            {entry.profile.display_name}
          </div>
          <div className="text-[10px] text-foreground/45 font-mono truncate leading-tight">
            @{entry.profile.handle}
            {settled > 0 ? (
              <span className="ml-1.5 text-foreground/55">
                · {entry.wins}–{entry.losses}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      {entry.is_self ? (
        <span className="text-[10px] uppercase tracking-widest text-foreground/40 px-1.5">
          You
        </span>
      ) : (
        <QuickFollowButton
          followeeId={entry.profile.user_id}
          initialFollowing={entry.is_following}
          canFollow={canFollow}
          handle={entry.profile.handle}
        />
      )}
    </li>
  );
}
