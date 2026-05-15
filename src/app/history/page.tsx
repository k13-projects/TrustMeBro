import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { marketLabel } from "@/components/MarketLabel";
import { PickSideTag } from "@/components/PickSideTag";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamBadge } from "@/components/TeamBadge";
import type { TeamLite } from "@/components/types";

export const revalidate = 30;

type Outcome = "pending" | "won" | "lost" | "void";

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

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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

  const { data: betsRaw } = await supabase
    .from("user_bets")
    .select(
      `id, status, stake, taken_odds, result_value, user_note, created_at, settled_at,
       prediction:predictions!inner(id, game_id, player_id, market, line, pick, projection, confidence, is_bet_of_the_day,
         player:players!inner(id, first_name, last_name, team_id, position, jersey_number))`,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

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

  const teamIds = Array.from(
    new Set(
      bets
        .map((b) => b.prediction?.player?.team_id)
        .filter((id): id is number => id != null),
    ),
  );
  const { data: teams } = teamIds.length
    ? await supabase
        .from("teams")
        .select("id, abbreviation, full_name")
        .in("id", teamIds)
    : { data: [] };
  const teamById = new Map<number, TeamLite>(
    ((teams ?? []) as TeamLite[]).map((t) => [t.id, t]),
  );

  const totals = bets.reduce(
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
  const settled = totals.won + totals.lost;
  const winRate =
    settled > 0 ? Math.round((totals.won / settled) * 100) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          Your History
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          Played Picks
        </h1>
        <p className="text-sm text-foreground/55 mt-1">
          {totals.total === 0
            ? "You haven't marked any picks yet. Tap \"I played this\" on the dashboard."
            : `${totals.total} total · ${settled} settled${winRate !== null ? ` · ${winRate}% win rate` : ""}`}
        </p>
      </header>

      {totals.total > 0 ? (
        <div className="flex gap-2 flex-wrap">
          <Pill label="Pending" value={totals.pending} tone="amber" />
          <Pill label="Won" value={totals.won} tone="emerald" />
          <Pill label="Lost" value={totals.lost} tone="rose" />
          <Pill label="Voids" value={totals.void} tone="neutral" />
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
    </div>
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
