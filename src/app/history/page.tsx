import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRequester } from "@/lib/identity";
import { marketLabel } from "@/components/MarketLabel";
import { PickSideTag } from "@/components/PickSideTag";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamBadge } from "@/components/TeamBadge";
import type { TeamLite } from "@/components/types";
import { CouponShareToggle } from "@/components/bros/CouponShareToggle";

export const revalidate = 30;

type Outcome = "pending" | "won" | "lost" | "void";

type HistoryTab = "bets" | "coupons";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

type RawUserBet = {
  id: string;
  status: Outcome;
  stake: number | null;
  taken_odds: number | null;
  result_value: number | null;
  user_note: string | null;
  created_at: string;
  settled_at: string | null;
  prediction:
    | {
        id: string;
        game_id: number;
        player_id: number;
        market: string;
        line: number;
        pick: "over" | "under";
        projection: number;
        confidence: number;
        is_bet_of_the_day: boolean;
        player:
          | {
              id: number;
              first_name: string;
              last_name: string;
              team_id: number | null;
              position: string | null;
              jersey_number: string | null;
            }
          | null;
      }
    | null;
};

export default async function HistoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab: HistoryTab = params.tab === "coupons" ? "coupons" : "bets";

  const requester = await getRequester();

  if (!requester) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-3xl glass-strong glass-sheen grain p-8 space-y-4">
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            History
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Sign in to see your bet history
          </h1>
          <p className="text-sm text-foreground/55">
            Mark picks as &quot;played&quot; on the dashboard and they&apos;ll
            show up here with their outcomes after each game finalizes.
          </p>
          <Link
            href="/login?next=/history"
            className="inline-flex rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium hover:bg-white/12 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  // Authed users read through RLS; guests' rows aren't visible under anon RLS,
  // so we use the service-role client and filter manually by guest_name.
  const reader =
    requester.kind === "auth" ? await createSupabaseServerClient() : supabaseAdmin();
  const ownerCol = requester.kind === "auth" ? "user_id" : "guest_name";
  const ownerVal =
    requester.kind === "auth" ? requester.user_id : requester.guest_name;

  const [{ data: betsRaw }, { data: couponsRaw }] = await Promise.all([
    reader
      .from("user_bets")
      .select(
        `id, status, stake, taken_odds, result_value, user_note, created_at, settled_at,
         prediction:predictions!inner(id, game_id, player_id, market, line, pick, projection, confidence, is_bet_of_the_day,
           player:players!inner(id, first_name, last_name, team_id, position, jersey_number))`,
      )
      .eq(ownerCol, ownerVal)
      .order("created_at", { ascending: false })
      .limit(200),
    reader
      .from("user_coupons")
      .select(
        `id, mode, pick_count, stake, payout_multiplier, potential_payout,
         status, result_payout, settled_at, created_at, is_public, shared_at,
         picks:user_coupon_picks(pick_order, prediction:predictions(id, game_id, market, line, pick,
           player:players(id, first_name, last_name, team_id)))`,
      )
      .eq(ownerCol, ownerVal)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const bets = (betsRaw ?? []).map((b: unknown) => {
    const row = b as RawUserBet & {
      prediction: RawUserBet["prediction"] | RawUserBet["prediction"][];
    };
    const prediction = Array.isArray(row.prediction)
      ? (row.prediction[0] ?? null)
      : row.prediction;
    let player = prediction?.player ?? null;
    if (Array.isArray(player)) player = player[0] ?? null;
    return {
      ...(row as RawUserBet),
      prediction: prediction
        ? { ...prediction, player }
        : null,
    };
  });

  const coupons: NormalizedCoupon[] = (couponsRaw ?? []).map((raw: unknown) => {
    const c = raw as CouponRow;
    const picks = (c.picks ?? []).map((p) => {
      const pred = Array.isArray(p.prediction)
        ? p.prediction[0] ?? null
        : p.prediction;
      const player = pred
        ? Array.isArray(pred.player)
          ? pred.player[0] ?? null
          : pred.player
        : null;
      return {
        pick_order: p.pick_order,
        prediction: pred ? { ...pred, player } : null,
      };
    });
    picks.sort((a, b) => a.pick_order - b.pick_order);
    return { ...c, picks };
  });

  const teamIds = Array.from(
    new Set(
      [
        ...bets.map((b) => b.prediction?.player?.team_id),
        ...coupons.flatMap((c) =>
          c.picks.map((p) => p.prediction?.player?.team_id ?? null),
        ),
      ].filter((id): id is number => id != null),
    ),
  );
  const { data: teams } = teamIds.length
    ? await reader
        .from("teams")
        .select("id, abbreviation, full_name")
        .in("id", teamIds)
    : { data: [] };
  const teamById = new Map<number, TeamLite>(
    ((teams ?? []) as TeamLite[]).map((t) => [t.id, t]),
  );

  const betTotals = bets.reduce(
    (acc, b) => {
      acc[b.status]++;
      acc.total++;
      return acc;
    },
    { total: 0, pending: 0, won: 0, lost: 0, void: 0 } as Record<
      "total" | Outcome,
      number
    >,
  );
  const couponTotals = coupons.reduce(
    (acc, c) => {
      acc[c.status]++;
      acc.total++;
      return acc;
    },
    { total: 0, pending: 0, won: 0, lost: 0, void: 0 } as Record<
      "total" | Outcome,
      number
    >,
  );
  const betsSettled = betTotals.won + betTotals.lost;
  const betsWinRate =
    betsSettled > 0 ? Math.round((betTotals.won / betsSettled) * 100) : null;
  const couponsSettled = couponTotals.won + couponTotals.lost;
  const couponsWinRate =
    couponsSettled > 0
      ? Math.round((couponTotals.won / couponsSettled) * 100)
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          Your History
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          {tab === "coupons" ? "Saved Coupons" : "Played Picks"}
        </h1>
        <p className="text-sm text-foreground/55 mt-1">
          {tab === "coupons"
            ? couponTotals.total === 0
              ? "You haven't saved any coupons yet. Build one with the + Coupon button on any pick."
              : `${couponTotals.total} total · ${couponsSettled} settled${couponsWinRate !== null ? ` · ${couponsWinRate}% hit rate` : ""}`
            : betTotals.total === 0
              ? "You haven't marked any picks yet. Tap \"I played this\" on the dashboard."
              : `${betTotals.total} total · ${betsSettled} settled${betsWinRate !== null ? ` · ${betsWinRate}% win rate` : ""}`}
        </p>
      </header>

      <nav className="glass rounded-full inline-flex items-center gap-1 p-1 text-sm" aria-label="History sections">
        <TabLink href="/history" active={tab === "bets"} count={betTotals.total} label="Bets" />
        <TabLink href="/history?tab=coupons" active={tab === "coupons"} count={couponTotals.total} label="Coupons" />
      </nav>

      {tab === "bets" ? (
        <>
          {betTotals.total > 0 ? (
            <div className="flex gap-2 flex-wrap">
              <Pill label="Pending" value={betTotals.pending} tone="amber" />
              <Pill label="Won" value={betTotals.won} tone="emerald" />
              <Pill label="Lost" value={betTotals.lost} tone="rose" />
              <Pill label="Voids" value={betTotals.void} tone="neutral" />
            </div>
          ) : null}

          {bets.length === 0 ? null : (
            <section className="space-y-2">
              {bets.map((b) => (
                <BetRow
                  key={b.id}
                  bet={b}
                  team={
                    b.prediction?.player?.team_id != null
                      ? teamById.get(b.prediction.player.team_id) ?? null
                      : null
                  }
                />
              ))}
            </section>
          )}
        </>
      ) : (
        <>
          {couponTotals.total > 0 ? (
            <div className="flex gap-2 flex-wrap">
              <Pill label="Pending" value={couponTotals.pending} tone="amber" />
              <Pill label="Won" value={couponTotals.won} tone="emerald" />
              <Pill label="Lost" value={couponTotals.lost} tone="rose" />
              <Pill label="Refunded" value={couponTotals.void} tone="neutral" />
            </div>
          ) : null}

          {coupons.length === 0 ? null : (
            <section className="space-y-3">
              {coupons.map((c) => (
                <CouponRowCard
                  key={c.id}
                  coupon={c}
                  teamById={teamById}
                  canShare={requester.kind === "auth"}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

type CouponPickPlayerLite = {
  id: number;
  first_name: string;
  last_name: string;
  team_id: number | null;
};

type CouponPickPrediction = {
  id: string;
  game_id: number;
  market: string;
  line: number;
  pick: "over" | "under";
  player: CouponPickPlayerLite | CouponPickPlayerLite[] | null;
};

type CouponRow = {
  id: string;
  mode: "power" | "flex";
  pick_count: number;
  stake: number | string;
  payout_multiplier: number | string;
  potential_payout: number | string;
  status: Outcome;
  result_payout: number | string | null;
  settled_at: string | null;
  created_at: string;
  is_public: boolean;
  shared_at: string | null;
  picks: Array<{
    pick_order: number;
    prediction: CouponPickPrediction | CouponPickPrediction[] | null;
  }>;
};

type NormalizedCoupon = Omit<CouponRow, "picks"> & {
  picks: Array<{
    pick_order: number;
    prediction:
      | (Omit<CouponPickPrediction, "player"> & {
          player: CouponPickPlayerLite | null;
        })
      | null;
  }>;
};

function TabLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-full bg-white/12 text-foreground px-3 py-1.5 text-sm font-medium"
          : "rounded-full text-foreground/65 px-3 py-1.5 text-sm hover:bg-white/5"
      }
    >
      <span>{label}</span>
      <span className="ml-2 font-mono tabular-nums text-[11px] opacity-70">{count}</span>
    </Link>
  );
}

function CouponRowCard({
  coupon,
  teamById,
  canShare,
}: {
  coupon: NormalizedCoupon;
  teamById: Map<number, TeamLite>;
  canShare: boolean;
}) {
  const outcomeTones = {
    pending: "bg-white/5 text-foreground/55 border-white/10",
    won: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    lost: "bg-rose-400/15 text-rose-300 border-rose-400/30",
    void: "bg-white/5 text-foreground/55 border-white/10",
  } as const;
  const stake = Number(coupon.stake);
  const multiplier = Number(coupon.payout_multiplier);
  const potential = Number(coupon.potential_payout);
  const resultPayout =
    coupon.result_payout !== null ? Number(coupon.result_payout) : null;

  return (
    <article className="glass glass-sheen rounded-2xl p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-400/15 text-amber-200 border border-amber-400/30 px-2.5 py-0.5 text-[10px] uppercase tracking-widest font-medium">
            {coupon.pick_count}-pick {coupon.mode}
          </span>
          <span className="text-[11px] text-foreground/45 font-mono tabular-nums">
            ${stake.toFixed(2)} × {multiplier}× → ${potential.toFixed(2)}
          </span>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium ${outcomeTones[coupon.status]}`}
        >
          {coupon.status === "void" ? "refunded" : coupon.status}
        </span>
      </header>

      <ul className="space-y-1.5">
        {coupon.picks.map((p) =>
          p.prediction && p.prediction.player ? (
            <li
              key={p.prediction.id}
              className="flex items-center gap-2 text-xs"
            >
              <span className="size-1.5 rounded-full bg-amber-300/70" aria-hidden />
              <span className="font-medium">
                {p.prediction.player.first_name} {p.prediction.player.last_name}
              </span>
              <TeamBadge
                team={
                  p.prediction.player.team_id != null
                    ? teamById.get(p.prediction.player.team_id) ?? null
                    : null
                }
                size={14}
              />
              <PickSideTag side={p.prediction.pick} />
              <span className="font-mono tabular-nums">{p.prediction.line}</span>
              <span className="text-foreground/55">
                {marketLabel(p.prediction.market)}
              </span>
            </li>
          ) : null,
        )}
      </ul>

      {resultPayout !== null ? (
        <div className="text-xs text-foreground/65 font-mono tabular-nums border-t border-white/8 pt-2 flex items-center justify-between">
          <span className="uppercase tracking-widest text-[10px] text-foreground/45">
            Settled
          </span>
          <span>
            paid{" "}
            <span
              className={
                coupon.status === "won"
                  ? "text-emerald-300"
                  : coupon.status === "void"
                    ? "text-foreground/65"
                    : "text-rose-300"
              }
            >
              ${resultPayout.toFixed(2)}
            </span>
          </span>
        </div>
      ) : null}
      <footer className="pt-2 border-t border-white/8 flex items-center justify-between gap-2">
        <CouponShareToggle
          couponId={coupon.id}
          isPublic={coupon.is_public}
          canShare={canShare}
        />
      </footer>
    </article>
  );
}


// American odds: +150 means $100 stake wins $150; -200 means $200 stake wins $100.
// Decimal odds (>=1.0): multiplier directly. We accept either; positive numbers
// >= 100 are treated as american, otherwise decimal.
function formatOdds(odds: number): string {
  if (Math.abs(odds) >= 100 && Number.isInteger(odds)) {
    return odds > 0 ? `+${odds}` : `${odds}`;
  }
  return odds.toFixed(2);
}

function potentialPayout(stake: number, odds: number): number {
  if (Math.abs(odds) >= 100 && Number.isInteger(odds)) {
    const ratio = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
    return stake + stake * ratio;
  }
  return stake * odds;
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "neutral" | "amber";
}) {
  const tones = {
    emerald: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    rose: "bg-rose-400/15 text-rose-300 border-rose-400/30",
    neutral: "bg-white/5 text-foreground/60 border-white/10",
    amber: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  } as const;
  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[88px] ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-80">{label}</div>
      <div className="font-mono tabular-nums text-2xl font-semibold">{value}</div>
    </div>
  );
}

function BetRow({
  bet,
  team,
}: {
  bet: RawUserBet;
  team: TeamLite | null;
}) {
  if (!bet.prediction) return null;
  const p = bet.prediction;
  const player = p.player;
  if (!player) return null;
  const name = `${player.first_name} ${player.last_name}`;
  const outcomeTones = {
    pending: "bg-white/5 text-foreground/55 border-white/10",
    won: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    lost: "bg-rose-400/15 text-rose-300 border-rose-400/30",
    void: "bg-white/5 text-foreground/45 border-white/10",
  } as const;

  return (
    <Link
      href={`/games/${p.game_id}`}
      className="block glass glass-sheen rounded-2xl p-3 sm:p-4 hover:bg-white/3 transition-colors"
    >
      <div className="flex items-center gap-4">
        <PlayerAvatar
          playerId={player.id}
          firstName={player.first_name}
          lastName={player.last_name}
          abbreviation={team?.abbreviation ?? ""}
          size={44}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{name}</span>
            <TeamBadge team={team} size={16} />
            {p.is_bet_of_the_day ? (
              <span className="text-amber-300 text-xs" aria-label="Bet of the day">
                ★
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-baseline gap-2 text-sm flex-wrap">
            <PickSideTag side={p.pick} />
            <span className="font-mono tabular-nums">{p.line}</span>
            <span className="text-foreground/60">{marketLabel(p.market)}</span>
            {bet.result_value !== null ? (
              <span className="text-xs text-foreground/45 font-mono">
                · actual {bet.result_value}
              </span>
            ) : null}
          </div>
          {bet.taken_odds !== null || bet.stake !== null ? (
            <div className="mt-1 flex items-center gap-3 text-[11px] text-foreground/55 font-mono tabular-nums flex-wrap">
              {bet.taken_odds !== null ? (
                <span>
                  <span className="text-foreground/45 uppercase tracking-widest text-[10px] mr-1">
                    Odds
                  </span>
                  {formatOdds(bet.taken_odds)}
                </span>
              ) : null}
              {bet.stake !== null ? (
                <span>
                  <span className="text-foreground/45 uppercase tracking-widest text-[10px] mr-1">
                    Stake
                  </span>
                  {bet.stake.toFixed(2)}
                </span>
              ) : null}
              {bet.stake !== null && bet.taken_odds !== null ? (
                <span title="Potential payout if pick wins">
                  <span className="text-foreground/45 uppercase tracking-widest text-[10px] mr-1">
                    To win
                  </span>
                  {potentialPayout(bet.stake, bet.taken_odds).toFixed(2)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium ${outcomeTones[bet.status]}`}
        >
          {bet.status}
        </span>
      </div>
    </Link>
  );
}
