import Link from "next/link";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamBadge } from "@/components/TeamBadge";
import { AddComboButton } from "@/components/cart/AddComboButton";
import { marketLabel } from "@/components/MarketLabel";
import { teamColors } from "@/lib/sports/nba/branding";
import type { CartPick } from "@/components/cart/CartContext";
import type { PredictionRow, TeamLite } from "@/components/types";

export type MoneyCombo = {
  picks: PredictionRow[];
  combined_confidence: number;
  power_payout: number;
  flex_payout: number;
};

type Tier = "double" | "triple";

const TIER_COPY: Record<Tier, { eyebrow: string; title: string; tagline: string }> = {
  double: {
    eyebrow: "2-pick combo",
    title: "Double Your Money",
    tagline: "Two high-conviction picks. Hit both → ~3× payout (your stake doubled).",
  },
  triple: {
    eyebrow: "3-pick combo",
    title: "Triple Your Money",
    tagline: "Three picks across three games. Hit all three → ~5× payout.",
  },
};

export function MoneyCombos({
  tier,
  combos,
  teamById,
  stake = 10,
}: {
  tier: Tier;
  combos: MoneyCombo[];
  teamById: Map<number, TeamLite>;
  stake?: number;
}) {
  const copy = TIER_COPY[tier];
  const ringClass =
    tier === "triple"
      ? "ring-1 ring-primary/40 shadow-[0_24px_60px_-30px_rgba(255,184,0,0.55)]"
      : "";

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-5">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {copy.eyebrow}
          </p>
          <h2 className="font-display uppercase text-[clamp(1.9rem,4vw,2.8rem)] leading-tight tracking-tight mt-1">
            <span className="text-foreground">{copy.title.split(" Your ")[0]}</span>{" "}
            <span
              style={{
                background:
                  "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Your {copy.title.split(" Your ")[1]}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {copy.tagline}
          </p>
        </div>
      </header>

      {combos.length === 0 ? (
        <div className="card-tmb p-6 text-center text-sm text-muted-foreground">
          Not enough high-confidence picks today to assemble a {tier === "double" ? "2-pick" : "3-pick"} combo. Check back after morning lines drop.
        </div>
      ) : (
        <div className={`grid gap-4 sm:grid-cols-2 ${tier === "triple" ? "lg:grid-cols-2" : "lg:grid-cols-4"}`}>
          {combos.slice(0, tier === "triple" ? 2 : 4).map((combo, i) => (
            <ComboCardLarge
              key={combo.picks.map((p) => p.id).join("|")}
              combo={combo}
              teamById={teamById}
              stake={stake}
              ringClass={ringClass}
              rank={i + 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ComboCardLarge({
  combo,
  teamById,
  stake,
  ringClass,
  rank,
}: {
  combo: MoneyCombo;
  teamById: Map<number, TeamLite>;
  stake: number;
  ringClass: string;
  rank: number;
}) {
  const picks = combo.picks;
  const payoutAmount = stake * combo.power_payout;
  const cartPicks: CartPick[] = picks.map((p) => ({
    prediction_id: p.id,
    game_id: p.game_id,
    player_id: p.player_id,
    player_first_name: p.player.first_name,
    player_last_name: p.player.last_name,
    team_id: p.player.team_id,
    team_abbreviation: teamById.get(p.player.team_id ?? -1)?.abbreviation ?? null,
    market: p.market,
    line: p.line,
    pick: p.pick,
    confidence: p.confidence,
    jersey_number: p.player.jersey_number,
  }));

  return (
    <article
      className={`card-tmb p-5 space-y-4 flex flex-col ${ringClass}`}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Combo #{rank}
        </span>
        <span className="font-mono tabular-nums text-xs text-primary font-semibold">
          {combo.combined_confidence.toFixed(1)}% combined
        </span>
      </header>

      {/* Player sticker row */}
      <div className="flex items-end justify-center gap-3 sm:gap-4 min-h-[5rem]">
        {picks.map((p) => {
          const team = teamById.get(p.player.team_id ?? -1) ?? null;
          return (
            <Link
              key={p.id}
              href={`/players/${p.player.id}`}
              className="block"
              aria-label={`${p.player.first_name} ${p.player.last_name}`}
            >
              <PlayerAvatar
                playerId={p.player.id}
                firstName={p.player.first_name}
                lastName={p.player.last_name}
                abbreviation={team?.abbreviation ?? ""}
                size={64}
                variant="sticker"
              />
            </Link>
          );
        })}
      </div>

      {/* Per-pick rows */}
      <ul className="space-y-1.5 text-xs">
        {picks.map((p, i) => {
          const team = teamById.get(p.player.team_id ?? -1) ?? null;
          const colors = teamColors(team?.abbreviation);
          return (
            <li
              key={p.id}
              className={`flex items-center gap-2 ${i > 0 ? "pt-1.5 border-t border-border/40" : ""}`}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: colors.primary }}
              />
              <TeamBadge team={team} size={14} />
              <span className="truncate text-foreground/85">
                {p.player.first_name.charAt(0)}.{" "}
                <span className="font-medium">{p.player.last_name}</span>
              </span>
              <span className="ml-auto font-mono tabular-nums uppercase text-foreground/70 text-[11px]">
                {p.pick} {p.line} {marketLabel(p.market).toUpperCase()}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto pt-3 border-t border-border/60 space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">
            Risk{" "}
            <span className="font-mono tabular-nums text-foreground/85">
              ${stake}
            </span>
          </span>
          <span className="text-muted-foreground">
            Win{" "}
            <span className="font-mono tabular-nums text-positive font-semibold">
              ${payoutAmount.toFixed(2)}
            </span>{" "}
            <span className="text-foreground/55">
              ({combo.power_payout}× power)
            </span>
          </span>
        </div>
        <AddComboButton picks={cartPicks} />
      </div>
    </article>
  );
}
