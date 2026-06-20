import { NextResponse } from "next/server";
import { z } from "zod";
import { streamChat } from "@/lib/chat/gemini";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import type {
  ChatPredictionSummary,
  ChatSport,
  ChatStreamEvent,
  SoccerChatPredictionSummary,
} from "@/lib/chat/types";
import { todayIsoDate } from "@/lib/date";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { activeSport } from "@/lib/sports/sport-cookie";
import { sideLabel } from "@/lib/sports/soccer/labels";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import type { Reasoning, PickSide, PropMarket } from "@/lib/analysis/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const NBA_MARKETS = [
  "points",
  "rebounds",
  "assists",
  "threes_made",
  "minutes",
  "steals",
  "blocks",
  "pra",
] as const;

const SOCCER_MARKETS = ["match_winner", "total_goals", "btts"] as const;
const SOCCER_SIDES = [
  "home",
  "draw",
  "away",
  "over",
  "under",
  "yes",
  "no",
] as const;

// Cart snapshot from the browser. We re-validate at the boundary so a
// tampered request can't poison the prompt with arbitrary JSON. A coupon is
// single-sport, so picks are a discriminated union on `sport` and the
// top-level `sport` must agree.
const NbaPickSchema = z.object({
  sport: z.literal("nba"),
  prediction_id: z.string().uuid(),
  player_name: z.string().min(1).max(80),
  team_abbr: z.string().max(8).nullable(),
  market: z.enum(NBA_MARKETS),
  line: z.number(),
  pick: z.enum(["over", "under"]),
  confidence: z.number().min(0).max(100),
});

const SoccerPickSchema = z.object({
  sport: z.literal("soccer"),
  prediction_id: z.string().uuid(),
  match: z.string().min(1).max(100),
  market: z.enum(SOCCER_MARKETS),
  side: z.enum(SOCCER_SIDES),
  side_label: z.string().min(1).max(80),
  line: z.number().nullable(),
  confidence: z.number().min(0).max(100),
  best_odds: z.number().nullable(),
});

const CouponSchema = z.object({
  mode: z.enum(["power", "flex"]),
  stake: z.number().nonnegative().max(100000),
  sport: z.enum(["nba", "soccer"]),
  picks: z
    .array(z.discriminatedUnion("sport", [NbaPickSchema, SoccerPickSchema]))
    .min(1)
    .max(6),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
  coupon: CouponSchema.nullable().optional(),
});

// Token bucket per IP: 50 reqs / hour. Resets on cold start; fine for now.
// LIMITATION: this Map is per-instance. On Vercel each cold start gets a
// fresh limiter, and multi-region invocations don't share state. The IP key
// also trusts the leftmost x-forwarded-for hop, which is correct behind
// Vercel but spoofable in a non-proxied deployment. Upgrade to a KV/Redis
// counter once Gemini quota becomes a real concern.
const RATE_LIMIT = 50;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_BUCKETS = 5_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();

  // Opportunistic sweep so the Map doesn't grow without bound.
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.resetAt < now) buckets.delete(k);
    }
  }

  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= RATE_LIMIT) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true };
}

// Soft anti-CSRF: only respond to same-origin POSTs. Returns null on success,
// or a response with the rejection. Loose by design — we just want to keep
// random sites from posting to /api/chat and burning our free-tier quota.
function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  // No Origin header (e.g. curl, server-to-server) → allow; the rate limiter
  // is the backstop. Browsers always send Origin on cross-site POSTs.
  if (!origin || !host) return null;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  if (originHost !== host) {
    return NextResponse.json({ error: "cross_origin_denied" }, { status: 403 });
  }
  return null;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Compose multiple AbortSignals; replace with AbortSignal.any() once we drop
// any environment that doesn't ship it (Node 20.x is borderline).
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      return ctrl.signal;
    }
    s.addEventListener("abort", () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

type PredictionRowWithRelations = {
  game_id: number;
  market: PropMarket;
  line: number;
  pick: PickSide;
  projection: number;
  confidence: number;
  is_bet_of_the_day: boolean;
  reasoning: Reasoning;
  player: {
    first_name: string;
    last_name: string;
    team_id: number | null;
  } | null;
};

async function fetchTodayPredictions(
  date: string,
): Promise<ChatPredictionSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("date", date);
  const gameIds = (games ?? []).map((g) => g.id);
  if (gameIds.length === 0) return [];

  const { data: rows } = await supabase
    .from("predictions")
    .select(
      "game_id, market, line, pick, projection, confidence, is_bet_of_the_day, reasoning, player:players!inner(first_name, last_name, team_id)",
    )
    .in("game_id", gameIds)
    .order("is_bet_of_the_day", { ascending: false })
    .order("confidence", { ascending: false })
    // Cap context to top 10 — feeding all 30 daily picks burns ~3× the tokens
    // for little benefit; bot can call lookup_player for anything off this list.
    .limit(10);

  const preds = (rows ?? []) as unknown as PredictionRowWithRelations[];
  const teamIds = Array.from(
    new Set(
      preds
        .map((p) => p.player?.team_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  const { data: teams } = teamIds.length
    ? await supabase
        .from("teams")
        .select("id, abbreviation")
        .in("id", teamIds)
    : { data: [] };
  const abbrById = new Map<number, string>(
    ((teams ?? []) as Array<{ id: number; abbreviation: string }>).map(
      (t) => [t.id, t.abbreviation] as const,
    ),
  );

  return preds.map((p): ChatPredictionSummary => {
    const checks = (p.reasoning?.checks ?? [])
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((c) => ({
        label: c.label,
        passed: c.passed,
        weight: c.weight,
      }));
    return {
      player_name: `${p.player?.first_name ?? ""} ${p.player?.last_name ?? ""}`.trim(),
      team_abbr: p.player?.team_id ? abbrById.get(p.player.team_id) ?? null : null,
      market: p.market,
      line: p.line,
      pick: p.pick,
      projection: p.projection,
      confidence: p.confidence,
      is_bet_of_the_day: p.is_bet_of_the_day,
      top_checks: checks,
    };
  });
}

type SoccerPredictionRow = {
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  confidence: number;
  best_odds: number;
  is_banko: boolean;
  reasoning: Reasoning;
  soccer_matches: {
    datetime: string | null;
    home: { name: string } | { name: string }[] | null;
    away: { name: string } | { name: string }[] | null;
  } | Array<{
    datetime: string | null;
    home: { name: string } | { name: string }[] | null;
    away: { name: string } | { name: string }[] | null;
  }> | null;
};

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

async function fetchTodaySoccerPredictions(
  date: string,
): Promise<SoccerChatPredictionSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data: matches } = await supabase
    .from("soccer_matches")
    .select("id")
    .eq("date", date);
  const matchIds = (matches ?? []).map((m) => m.id);
  if (matchIds.length === 0) return [];

  const { data: rows } = await supabase
    .from("soccer_predictions")
    .select(
      "market, side, line, confidence, best_odds, is_banko, reasoning, " +
        "soccer_matches(datetime, " +
        "home:soccer_teams!soccer_matches_home_team_id_fkey(name), " +
        "away:soccer_teams!soccer_matches_away_team_id_fkey(name))",
    )
    .in("match_id", matchIds)
    .eq("status", "pending")
    .order("is_banko", { ascending: false })
    .order("confidence", { ascending: false })
    .limit(10);

  const preds = (rows ?? []) as unknown as SoccerPredictionRow[];
  return preds.map((p): SoccerChatPredictionSummary => {
    const match = firstOf(p.soccer_matches);
    const home = firstOf(match?.home)?.name ?? "Home";
    const away = firstOf(match?.away)?.name ?? "Away";
    const line = p.line === null ? null : Number(p.line);
    const checks = (p.reasoning?.checks ?? [])
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((c) => ({ label: c.label, passed: c.passed, weight: c.weight }));
    return {
      match: `${home} v ${away}`,
      market: p.market,
      side: p.side,
      side_label: sideLabel(p.market, p.side, line, home, away),
      line,
      confidence: Number(p.confidence),
      best_odds: Number(p.best_odds),
      is_banko: p.is_banko,
      kickoff: match?.datetime ?? null,
      top_checks: checks,
    };
  });
}

export async function POST(req: Request) {
  const originReject = assertSameOrigin(req);
  if (originReject) return originReject;

  const ip = clientIp(req);
  const rl = rateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const date = todayIsoDate();
  const coupon = parsed.data.coupon ?? null;
  // The coupon being built is the strongest signal of which sport the user is
  // working; otherwise fall back to the active-sport cookie (the page they're
  // on). NBA is in off-season light mode, so a football visitor must land on
  // the soccer context or the bot is useless to them.
  const sport: ChatSport = coupon?.sport ?? (await activeSport());

  let nbaPredictions: ChatPredictionSummary[] = [];
  let soccerPredictions: SoccerChatPredictionSummary[] = [];
  try {
    if (sport === "soccer") {
      soccerPredictions = await fetchTodaySoccerPredictions(date);
    } else {
      nbaPredictions = await fetchTodayPredictions(date);
    }
  } catch {
    // If DB is unreachable, fall through with no picks context;
    // the bot can still answer source/methodology questions.
  }

  const systemInstruction = buildSystemPrompt({
    sport,
    date,
    nbaPredictions,
    soccerPredictions,
    coupon,
  });

  // Hard cap: 60s per chat request. Combined with the client's req.signal so a
  // closed tab tears down the upstream Gemini call instead of burning quota.
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), 60_000);
  const signal = anySignal([req.signal, timeoutController.signal]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        for await (const event of streamChat({
          systemInstruction,
          messages: parsed.data.messages,
          sport,
          signal,
        })) {
          if (signal.aborted) break;
          write(event);
        }
      } catch (err) {
        if (!signal.aborted) {
          write({
            type: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      } finally {
        clearTimeout(timer);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by aborted client
        }
      }
    },
    cancel() {
      timeoutController.abort();
      clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
