import { NextResponse } from "next/server";
import { z } from "zod";
import { streamChat } from "@/lib/chat/gemini";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import type {
  ChatPredictionSummary,
  ChatStreamEvent,
} from "@/lib/chat/types";
import { todayIsoDate } from "@/lib/date";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Reasoning, PickSide, PropMarket } from "@/lib/analysis/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});
const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
});

// Token bucket per IP: 50 reqs / hour. Resets on cold start; fine for now.
const RATE_LIMIT = 50;
const WINDOW_MS = 60 * 60 * 1000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
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

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
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
    .limit(30);

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

export async function POST(req: Request) {
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
  let predictions: ChatPredictionSummary[] = [];
  try {
    predictions = await fetchTodayPredictions(date);
  } catch {
    // If DB is unreachable, fall through with no picks context;
    // the bot can still answer source/methodology questions.
  }

  const systemInstruction = buildSystemPrompt({ date, predictions });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        for await (const event of streamChat({
          systemInstruction,
          messages: parsed.data.messages,
        })) {
          write(event);
        }
      } catch (err) {
        write({
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
