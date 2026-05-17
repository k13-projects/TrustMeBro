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

export type ComboTier = {
  multiplier: number;
  legs: number;
  slug: string;
  name: string;
  tagline: string;
};

// Section identity is the multiplier. Leg count is shown in the header so
// the same data also reads as "2-bet combo / 3-bet combo / …" without
// needing duplicate sections.
export const COMBO_TIERS: ComboTier[] = [
  {
    multiplier: 3,
    legs: 2,
    slug: "double-up",
    name: "The Double-Up",
    tagline: "Two locks. Hit both → 3× your stake.",
  },
  {
    multiplier: 5,
    legs: 3,
    slug: "high-five",
    name: "High Five",
    tagline: "Three picks. Run the board → 5× your stake.",
  },
  {
    multiplier: 10,
    legs: 4,
    slug: "ten-bag",
    name: "Ten Bag",
    tagline: "Four legs. All cash → 10× your stake.",
  },
  {
    multiplier: 20,
    legs: 5,
    slug: "twenty-stack",
    name: "Twenty-Stack",
    tagline: "Five-leg power. Perfect card → 20×.",
  },
  {
    multiplier: 37.5,
    legs: 6,
    slug: "moonshot",
    name: "Moonshot",
    tagline: "Six legs. The full ride → 37.5×.",
  },
];

const GRID_BY_LEGS: Record<number, string> = {
  2: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
  3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-2",
  4: "grid gap-4 sm:grid-cols-1 lg:grid-cols-2",
  5: "grid gap-4 lg:grid-cols-1",
  6: "grid gap-4 lg:grid-cols-1",
};

const MAX_CARDS_BY_LEGS: Record<number, number> = {
  2: 4,
  3: 2,
  4: 2,
  5: 1,
  6: 1,
};

const AVATAR_SIZE_BY_LEGS: Record<number, number> = {
  2: 96,
  3: 96,
  4: 88,
  5: 128,
  6: 104,
};

// Floor for the avatar row — picked to roughly match the largest avatar per
// leg count so the card doesn't feel hollow when one tier has fewer rows.
const AVATAR_ROW_MIN_H_BY_LEGS: Record<number, string> = {
  2: "min-h-[7rem]",
  3: "min-h-[7rem]",
  4: "min-h-[6.5rem]",
  5: "min-h-[9rem]",
  6: "min-h-[7.5rem]",
};

export function MoneyCombos({
  tier,
  combos,
  teamById,
  stake = 10,
}: {
  tier: ComboTier;
  combos: MoneyCombo[];
  teamById: Map<number, TeamLite>;
  stake?: number;
}) {
  const highlight = tier.multiplier >= 20;
  const ringClass = highlight
    ? "ring-1 ring-primary/40 shadow-[0_24px_60px_-30px_rgba(255,184,0,0.55)]"
    : "";
  const grid = GRID_BY_LEGS[tier.legs] ?? GRID_BY_LEGS[2];
  const maxCards = MAX_CARDS_BY_LEGS[tier.legs] ?? 2;
  const avatarSize = AVATAR_SIZE_BY_LEGS[tier.legs] ?? 96;
  const avatarRowMinH = AVATAR_ROW_MIN_H_BY_LEGS[tier.legs] ?? "min-h-[7rem]";
  const payoutLabel = formatMultiplier(tier.multiplier);
  const winAmount = stake * tier.multiplier;

  return (
    <section
      id={`combo-${tier.slug}`}
      className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-5 scroll-mt-24"
    >
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {tier.legs}-bet combo · {payoutLabel} payout
          </p>
          <h2 className="font-display uppercase text-[clamp(1.9rem,4vw,2.8rem)] leading-tight tracking-tight mt-1">
            <span className="text-foreground">{tier.name}</span>{" "}
            <span
              style={{
                background:
                  "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {payoutLabel}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {tier.tagline}{" "}
            <span className="text-foreground/70">
              ${stake} → ${winAmount.toFixed(winAmount % 1 ? 2 : 0)}
            </span>
          </p>
        </div>
      </header>

      {combos.length === 0 ? (
        <div className="card-tmb p-6 text-center text-sm text-muted-foreground">
          Not enough high-confidence picks today to assemble a{" "}
          {tier.legs}-pick combo. Check back after morning lines drop.
        </div>
      ) : (
        <div className={grid}>
          {combos.slice(0, maxCards).map((combo, i) => (
            <ComboCardLarge
              key={combo.picks.map((p) => p.id).join("|")}
              combo={combo}
              tier={tier}
              teamById={teamById}
              stake={stake}
              ringClass={ringClass}
              rank={i + 1}
              avatarSize={avatarSize}
              avatarRowMinH={avatarRowMinH}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function formatMultiplier(m: number): string {
  return m % 1 === 0 ? `${m}×` : `${m.toFixed(1)}×`;
}

function ComboCardLarge({
  combo,
  tier,
  teamById,
  stake,
  ringClass,
  rank,
  avatarSize,
  avatarRowMinH,
}: {
  combo: MoneyCombo;
  tier: ComboTier;
  teamById: Map<number, TeamLite>;
  stake: number;
  ringClass: string;
  rank: number;
  avatarSize: number;
  avatarRowMinH: string;
}) {
  const picks = combo.picks;
  const payoutAmount = stake * tier.multiplier;
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
    <article className={`card-tmb p-5 space-y-4 flex flex-col ${ringClass}`}>
      <header className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Combo #{rank}
        </span>
        <span className="font-mono tabular-nums text-xs text-primary font-semibold">
          {combo.combined_confidence.toFixed(1)}% combined
        </span>
      </header>

      <div
        className={`flex items-end justify-center gap-4 sm:gap-5 ${avatarRowMinH} flex-wrap`}
      >
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
                size={avatarSize}
                variant="sticker"
              />
            </Link>
          );
        })}
      </div>

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
              ${payoutAmount.toFixed(payoutAmount % 1 ? 2 : 0)}
            </span>{" "}
            <span className="text-foreground/55">
              ({formatMultiplier(tier.multiplier)} power)
            </span>
          </span>
        </div>
        <AddComboButton picks={cartPicks} />
      </div>
    </article>
  );
}
