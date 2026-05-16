"use client";

import { motion } from "motion/react";
import { Check, Clock, MessageCircle, Send, X } from "lucide-react";
import { BrushText } from "@/components/site/BrushText";
import { GoldButton } from "@/components/site/GoldButton";
import type { BotdResult, EngineStats } from "@/lib/scoring/stats";

const MARKET_LABEL: Record<string, string> = {
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  threes_made: "3PM",
  minutes: "MIN",
  pra: "PRA",
  steals: "STL",
  blocks: "BLK",
};

export function WinnersClub({ stats }: { stats: EngineStats }) {
  const botds = stats.recent_botds;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.55fr] items-start">
        <div className="space-y-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Recent
          </p>
          <h2 className="font-display italic uppercase text-[clamp(2.6rem,6vw,4.5rem)] leading-[0.9]">
            <BrushText>Bet of the</BrushText>
            <br />
            <span className="text-foreground/95">Day</span>
          </h2>
          <p className="text-foreground/70 max-w-sm">
            Highest-conviction pick we put out each day. Settled the morning
            after, no edits. Win{" "}
            <span className="text-positive font-semibold">+1.0</span>, loss{" "}
            <span className="text-negative font-semibold">−0.5</span>.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <GoldButton href="https://discord.com" size="md">
              <MessageCircle size={16} />
              Join Discord
            </GoldButton>
            <GoldButton href="https://t.me" variant="outline" size="md">
              <Send size={16} />
              Join Telegram
            </GoldButton>
          </div>
        </div>

        {botds.length === 0 ? (
          <EmptyBotdSlot firstPickDate={stats.first_pick_date} />
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            {botds.slice(0, 3).map((b, i) => (
              <motion.div
                key={b.prediction_id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15%" }}
                transition={{ delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <BotdCard botd={b} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyBotdSlot({ firstPickDate }: { firstPickDate: string | null }) {
  return (
    <div className="card-tmb p-8 text-center space-y-2">
      <p className="text-sm text-foreground/80">
        {firstPickDate
          ? `First Bet of the Day issued ${firstPickDate}. Results land here once games settle.`
          : "Engine just started. The first Bet of the Day will appear here once tonight's slate generates."}
      </p>
      <p className="text-xs text-muted-foreground">
        Every pick is graded — wins and losses alike. No retroactive edits.
      </p>
    </div>
  );
}

function BotdCard({ botd }: { botd: BotdResult }) {
  const market = MARKET_LABEL[botd.market] ?? botd.market.toUpperCase();
  const name = `${botd.player_first_name} ${botd.player_last_name}`.trim();
  const settledDate = botd.settled_at
    ? new Date(botd.settled_at).toLocaleDateString()
    : new Date(botd.generated_at).toLocaleDateString();
  const tone =
    botd.status === "won"
      ? "ring-positive/40 bg-positive/10"
      : botd.status === "lost"
        ? "ring-negative/40 bg-negative/10"
        : botd.status === "void"
          ? "ring-border/60 bg-background/40"
          : "ring-primary/30 bg-primary/5";
  return (
    <figure className={`card-tmb p-5 space-y-3 ring-1 ${tone}`}>
      <div className="flex items-center justify-between">
        <StatusBadge status={botd.status} />
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {settledDate}
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">
          <span className="uppercase tracking-wider font-mono">{botd.pick}</span>{" "}
          <span className="font-numeric tabular-nums">{botd.line}</span>{" "}
          <span>{market}</span>
        </p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <span className="text-[11px] text-muted-foreground">
          Confidence
          <span className="text-foreground/85 font-mono tabular-nums ml-1">
            {botd.confidence.toFixed(0)}
          </span>
        </span>
        {botd.result_value !== null ? (
          <span className="text-[11px] text-muted-foreground">
            Result
            <span className="text-foreground/85 font-mono tabular-nums ml-1">
              {botd.result_value.toFixed(1)}
            </span>
          </span>
        ) : null}
      </div>
    </figure>
  );
}

function StatusBadge({ status }: { status: BotdResult["status"] }) {
  if (status === "won") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-positive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-positive">
        <Check size={10} strokeWidth={3} /> Won
      </span>
    );
  }
  if (status === "lost") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-negative/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-negative">
        <X size={10} strokeWidth={3} /> Lost
      </span>
    );
  }
  if (status === "void") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/65">
        Void
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
      <Clock size={10} /> Pending
    </span>
  );
}
