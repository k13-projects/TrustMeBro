"use client";

import { useState } from "react";
import type { MatchRow } from "@/lib/sports/soccer/queries";
import type { MarketRates, RateOutcome } from "@/lib/sports/soccer/rates";
import { marketLabel } from "@/lib/sports/soccer/labels";
import { outcomeKey } from "@/lib/sports/soccer/coupon-legs";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import { cx, focusRing } from "@/lib/design/tokens";
import { useCart } from "@/components/cart/CartContext";
import { MatchBanner } from "./MatchBanner";

function shortSide(side: MatchSide, line: number | null): string {
  switch (side) {
    case "home":
      return "Home";
    case "draw":
      return "Draw";
    case "away":
      return "Away";
    case "over":
      return `Over ${line ?? ""}`.trim();
    case "under":
      return `Under ${line ?? ""}`.trim();
    case "yes":
      return "BTTS";
    case "no":
      return "No BTTS";
  }
}

// One priced outcome as a tile the viewer can pick straight into a coupon.
// Every outcome is equally selectable — the ★ marker (isEnginePick) is only
// ever a small "this is our pick too" note, never a pre-selected state. That
// separation is the whole point: conflating our opinion with the user's
// selection made it unclear whose decision a highlighted tile represented.
function RateTile({
  matchId,
  market,
  line,
  outcome,
  label,
  selectable,
  home,
  away,
  homeAbbr,
  awayAbbr,
}: {
  matchId: number;
  market: SoccerMarket;
  line: number | null;
  outcome: RateOutcome;
  label: string;
  selectable: boolean;
  home: string;
  away: string;
  homeAbbr: string;
  awayAbbr: string;
}) {
  const cart = useCart();
  const [flash, setFlash] = useState<string | null>(null);
  const key = `user:${outcomeKey(matchId, market, outcome.side, line)}`;
  const selected = cart.has(key);
  const noPrice = outcome.bestOdds === null;
  const wrongSport = !selected && cart.sport !== null && cart.sport !== "soccer";
  const atMax = !selected && cart.picks.length >= 6;
  // A selected tile always stays removable, even if the match has since kicked
  // off or its price has dropped out — only *adding* is gated on those.
  const disabled =
    !cart.hydrated || (!selected && (!selectable || noPrice || wrongSport || atMax));

  function onClick() {
    if (!cart.hydrated) return;
    if (selected) {
      cart.remove(key);
      return;
    }
    if (!selectable || noPrice || outcome.bestOdds === null) return;
    const result = cart.add({
      sport: "soccer",
      kind: "user",
      prediction_id: key,
      match_id: matchId,
      market,
      side: outcome.side,
      line,
      odds_taken: outcome.bestOdds,
      home,
      away,
      home_abbr: homeAbbr,
      away_abbr: awayAbbr,
    });
    if (!result.ok) {
      setFlash(result.reason ?? "Cannot add this pick");
      window.setTimeout(() => setFlash(null), 1800);
      return;
    }
    cart.open();
  }

  const title = !selectable
    ? "Match has kicked off — no longer selectable"
    : noPrice
      ? "No price available for this outcome"
      : selected
        ? "Remove from coupon"
        : wrongSport
          ? "Clear your coupon to mix in another sport"
          : atMax
            ? "Coupons cap at 6 picks"
            : "Add to coupon";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={flash ?? title}
      aria-label={`${label}${outcome.isEnginePick ? ", our pick" : ""}: ${title}`}
      aria-pressed={selected}
      className={cx(
        "relative min-h-11 rounded-xl border px-3 py-2 text-center transition-colors",
        focusRing,
        selected
          ? "border-amber-400/40 bg-amber-400/15"
          : disabled
            ? "cursor-not-allowed border-white/10 bg-white/[0.03] opacity-50"
            : "border-white/10 bg-white/[0.03] hover:border-primary/40 hover:bg-primary/8",
      )}
    >
      {outcome.isEnginePick ? (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 text-[10px] leading-none text-primary"
        >
          ★
        </span>
      ) : null}
      {flash ? (
        <div className="text-[10px] leading-tight text-amber-200" aria-live="polite">
          {flash}
        </div>
      ) : (
        <>
          <div className="text-[11px] uppercase tracking-wide text-foreground/55">{label}</div>
          <div
            className={cx(
              "text-lg font-black tabular-nums",
              selected ? "text-amber-200" : "text-white",
            )}
          >
            {Math.round(outcome.prob * 100)}%
          </div>
          <div className="text-[11px] font-mono tabular-nums text-foreground/45">
            {outcome.bestOdds ? outcome.bestOdds.toFixed(2) : "—"}
          </div>
        </>
      )}
    </button>
  );
}

// One match's priced markets as rate tiles — the /football/rates board's
// per-match card, also reused on the match detail page's Odds section. Every
// tile is a live coupon-building control (see RateTile); this component just
// lays markets and outcomes out.
export function MatchRates({
  match,
  markets,
}: {
  match: MatchRow;
  markets: MarketRates[];
}) {
  const selectable = match.state === "pre";
  return (
    <section className="space-y-4 rounded-3xl border border-border/60 bg-card/40 p-4 sm:p-5">
      <MatchBanner
        competition={match.competition}
        home={match.home}
        away={match.away}
        state={match.state}
        clock={match.clock}
        datetime={match.datetime}
        score={
          match.state !== "pre"
            ? { home: match.home_score, away: match.away_score }
            : null
        }
      />

      <div className="space-y-3">
        {markets.map((mk) => (
          <div key={`${mk.market}:${mk.line ?? ""}`}>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
              <span>{marketLabel(mk.market)}</span>
              <span className="text-foreground/30">{mk.bookCount} books</span>
            </div>
            <div
              className={`grid gap-2 ${
                mk.outcomes.length === 3 ? "grid-cols-3" : "grid-cols-2"
              }`}
            >
              {mk.outcomes.map((o) => (
                <RateTile
                  key={o.side}
                  matchId={match.id}
                  market={mk.market}
                  line={mk.line}
                  outcome={o}
                  label={shortSide(o.side, mk.line)}
                  selectable={selectable}
                  home={match.home.name}
                  away={match.away.name}
                  homeAbbr={match.home.abbreviation}
                  awayAbbr={match.away.abbreviation}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-foreground/35">
        {selectable
          ? "Tap a price to add it to your coupon. ★ marks our own pick."
          : "This match has kicked off — its prices are no longer selectable."}
      </p>
    </section>
  );
}
