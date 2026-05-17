import "server-only";

import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { NewsItem } from "./types";

const MODEL = "gemini-2.5-flash";

type GameRow = {
  id: number;
  date: string;
  datetime: string | null;
  home_team_id: number;
  visitor_team_id: number;
  status: string;
};

type TeamRow = {
  id: number;
  abbreviation: string;
  full_name: string;
  name: string;
};

type PredictionRow = {
  id: string;
  game_id: number;
  player_id: number;
  market: string;
  line: number;
  pick: "over" | "under";
  confidence: number;
  projection: number;
  player: { first_name: string; last_name: string; team_id: number | null } | null;
};

/**
 * Generate a labelled engine-take blurb for each game in the given window
 * that doesn't already have writer commentary. Calls Gemini once per game.
 *
 * Gated by GOOGLE_API_KEY — no key = no-op, cron stays green.
 */
export async function generateEngineTakes(opts: {
  startDate: string;
  endDate: string;
  maxGames?: number;
}): Promise<NewsItem[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return [];

  const supabase = supabaseAdmin();

  const { data: games } = await supabase
    .from("games")
    .select("id, date, datetime, home_team_id, visitor_team_id, status")
    .gte("date", opts.startDate)
    .lte("date", opts.endDate)
    .order("date", { ascending: true });

  const gameRows = (games ?? []) as GameRow[];
  if (gameRows.length === 0) return [];

  // Which games already have *any* commentary? Skip those. Engine takes are
  // the fallback, not a co-author.
  const gameIds = gameRows.map((g) => g.id);
  const { data: existing } = await supabase
    .from("news_items")
    .select("game_id")
    .in("game_id", gameIds);
  const covered = new Set(
    ((existing ?? []) as Array<{ game_id: number | null }>)
      .map((r) => r.game_id)
      .filter((id): id is number => id != null),
  );
  const uncovered = gameRows.filter((g) => !covered.has(g.id));
  const targets = uncovered.slice(0, opts.maxGames ?? 12);
  if (targets.length === 0) return [];

  const teamIds = new Set<number>();
  for (const g of targets) {
    teamIds.add(g.home_team_id);
    teamIds.add(g.visitor_team_id);
  }
  const { data: teams } = await supabase
    .from("teams")
    .select("id, abbreviation, full_name, name")
    .in("id", [...teamIds]);
  const teamById = new Map(
    ((teams ?? []) as TeamRow[]).map((t) => [t.id, t] as const),
  );

  const { data: preds } = await supabase
    .from("predictions")
    .select(
      "id, game_id, player_id, market, line, pick, confidence, projection, player:players!inner(first_name, last_name, team_id)",
    )
    .in(
      "game_id",
      targets.map((g) => g.id),
    )
    .order("confidence", { ascending: false });
  const predsByGame = new Map<number, PredictionRow[]>();
  for (const p of (preds ?? []) as unknown as PredictionRow[]) {
    const list = predsByGame.get(p.game_id) ?? [];
    list.push(p);
    predsByGame.set(p.game_id, list);
  }

  const ai = new GoogleGenAI({ apiKey });
  const out: NewsItem[] = [];

  for (const g of targets) {
    const home = teamById.get(g.home_team_id);
    const visitor = teamById.get(g.visitor_team_id);
    if (!home || !visitor) continue;

    const topPicks = (predsByGame.get(g.id) ?? []).slice(0, 3);
    const picksLine = topPicks
      .map((p) => {
        const player = Array.isArray(p.player) ? p.player[0] : p.player;
        const name = player ? `${player.first_name} ${player.last_name}` : `player ${p.player_id}`;
        return `${name} ${p.pick} ${p.line} ${p.market} (${Math.round(p.confidence)}% confidence)`;
      })
      .join("; ");

    const prompt = [
      "You are the TrustMeBro engine writing a one-paragraph (2–3 short sentences, ≤ 360 characters) preview for an NBA matchup.",
      "Tone: terse, data-driven, no fluff, no hype words like 'epic' or 'must-watch'.",
      "Don't invent injuries, trades, or news. Stick to the matchup and the picks below.",
      "Don't quote any real journalist. This is the engine's own take.",
      "",
      `Matchup: ${visitor.full_name} @ ${home.full_name}`,
      `Date: ${g.date}`,
      topPicks.length > 0 ? `Top picks: ${picksLine}` : "No prop picks generated for this game.",
      "",
      "Write only the preview text. No headline, no quote marks, no attribution.",
    ].join("\n");

    let text: string;
    try {
      const resp = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.4, maxOutputTokens: 220 },
      });
      text = (resp.text ?? "").trim();
    } catch {
      continue;
    }
    if (!text) continue;
    if (text.length > 360) text = text.slice(0, 357).trimEnd() + "…";

    const published = g.datetime ?? new Date(`${g.date}T18:00:00Z`).toISOString();

    out.push({
      source: "engine",
      source_id: `game:${g.id}:${g.date}`,
      source_url: `/games/${g.id}`,
      outlet: "TrustMeBro Engine",
      author: "TrustMeBro Engine",
      headline: `${visitor.abbreviation} @ ${home.abbreviation} — engine preview`,
      summary: text,
      game_id: g.id,
      team_ids: [g.home_team_id, g.visitor_team_id],
      player_ids: topPicks.map((p) => p.player_id),
      is_engine_take: true,
      published_at: published,
      raw: { model: MODEL, picks_seeded: topPicks.length },
    });
  }

  return out;
}
