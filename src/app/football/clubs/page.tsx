import Link from "next/link";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { getCompetitionClubs } from "@/lib/sports/soccer/follow-queries";
import { FollowButton } from "@/components/soccer/FollowButton";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { TeamCrest } from "@/components/soccer/TeamCrest";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const competition = await activeCompetition();
  const meta = COMPETITIONS[competition];
  const clubs = await getCompetitionClubs(competition);
  const followedCount = clubs.filter((c) => c.followed).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <FootballHeader
          title={meta.kind === "club" ? "Clubs" : "Teams"}
          competition={competition}
        />
        <p className="mt-2 max-w-2xl text-sm text-foreground/55">
          Every side that has played in this season&apos;s {meta.label}, qualifying
          included. Follow the ones you care about and the home page leads with
          their matches.
          {followedCount > 0 ? ` You follow ${followedCount}.` : ""}
        </p>
      </div>

      {clubs.length === 0 ? (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-foreground/55">
          No clubs on record yet for this competition.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-3 py-2.5"
            >
              <TeamCrest crest={c.crest} name={c.name} size={26} />
              <Link
                href={`/football/club/${c.id}`}
                className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary"
              >
                {c.name}
                {c.rank !== null ? (
                  <span className="ml-1.5 text-[11px] font-normal text-foreground/40">
                    #{c.rank}
                  </span>
                ) : null}
              </Link>
              <FollowButton
                teamId={c.id}
                teamName={c.name}
                initialFollowing={Boolean(c.followed)}
                size="sm"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
