import "server-only";

import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { marketLabel, sideLabel } from "@/lib/sports/soccer/labels";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import type { SoccerNewsItem } from "./types";

const MODEL = "gemini-2.5-flash";

type MatchRow = {
  id: number;
  date: string;
  datetime: string | null;
  stage: string | null;
  grp: string | null;
  home_team_id: number;
  away_team_id: number;
};

type TeamRow = { id: number; name: string; abbreviation: string };

type PredictionRow = {
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  confidence: number;
};

/**
 * Soccer mirror of ../engine-take.ts. Writes a labelled engine preview for each
 * upcoming World Cup match in the window that has no writer coverage yet.
 * Gated by GOOGLE_API_KEY — no key = no-op, cron stays green.
 */
export async function generateSoccerEngineTakes(opts: {
  startDate: string;
  endDate: string;
  maxMatches?: number;
}): Promise<SoccerNewsItem[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return [];

  const supabase = supabaseAdmin();

  const { data: matches } = await supabase
    .from("soccer_matches")
    .select("id, date, datetime, stage, grp, home_team_id, away_team_id")
    .gte("date", opts.startDate)
    .lte("date", opts.endDate)
    .eq("finished", false)
    .order("date", { ascending: true });

  const matchRows = (matches ?? []) as MatchRow[];
  if (matchRows.length === 0) return [];

  const matchIds = matchRows.map((m) => m.id);
  const { data: existing } = await supabase
    .from("soccer_news")
    .select("match_id")
    .in("match_id", matchIds);
  const covered = new Set(
    ((existing ?? []) as Array<{ match_id: number | null }>)
      .map((r) => r.match_id)
      .filter((id): id is number => id != null),
  );
  const targets = matchRows
    .filter((m) => !covered.has(m.id))
    .slice(0, opts.maxMatches ?? 12);
  if (targets.length === 0) return [];

  const teamIds = new Set<number>();
  for (const m of targets) {
    teamIds.add(m.home_team_id);
    teamIds.add(m.away_team_id);
  }
  const { data: teams } = await supabase
    .from("soccer_teams")
    .select("id, name, abbreviation")
    .in("id", [...teamIds]);
  const teamById = new Map(
    ((teams ?? []) as TeamRow[]).map((t) => [t.id, t] as const),
  );

  const { data: preds } = await supabase
    .from("soccer_predictions")
    .select("match_id, market, side, line, confidence")
    .in("match_id", targets.map((m) => m.id))
    .order("confidence", { ascending: false });
  const predsByMatch = new Map<number, PredictionRow[]>();
  for (const p of (preds ?? []) as PredictionRow[]) {
    const list = predsByMatch.get(p.match_id) ?? [];
    list.push(p);
    predsByMatch.set(p.match_id, list);
  }

  const ai = new GoogleGenAI({ apiKey });

  // One Gemini call per match, all in flight at once — these are independent
  // and otherwise serialise into the slowest part of the job.
  const drafted = await Promise.all(
    targets.map(async (m): Promise<SoccerNewsItem | null> => {
      const home = teamById.get(m.home_team_id);
      const away = teamById.get(m.away_team_id);
      if (!home || !away) return null;

      const topPicks = (predsByMatch.get(m.id) ?? []).slice(0, 3);
      const picksLine = topPicks
        .map(
          (p) =>
            `${sideLabel(p.market, p.side, p.line, home.name, away.name)} (${marketLabel(p.market)}, ${Math.round(p.confidence)}% confidence)`,
        )
        .join("; ");

      const prompt = [
        "You are the TrustMeBro engine writing a one-paragraph (2–3 short sentences, ≤ 360 characters) preview for a World Cup match.",
        "Tone: terse, data-driven, no fluff, no hype words like 'epic' or 'must-watch'.",
        "Don't invent injuries, transfers, or news. Stick to the matchup and the picks below.",
        "Don't quote any real journalist. This is the engine's own take.",
        "",
        `Match: ${home.name} vs ${away.name}`,
        m.stage ? `Stage: ${m.stage}${m.grp ? ` (${m.grp})` : ""}` : null,
        `Date: ${m.date}`,
        topPicks.length > 0 ? `Top picks: ${picksLine}` : "No engine picks generated for this match yet.",
        "",
        "Write only the preview text. No headline, no quote marks, no attribution.",
      ]
        .filter(Boolean)
        .join("\n");

      let text: string;
      try {
        const resp = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { temperature: 0.4, maxOutputTokens: 220 },
        });
        text = (resp.text ?? "").trim();
      } catch {
        return null;
      }
      if (!text) return null;
      if (text.length > 360) text = text.slice(0, 357).trimEnd() + "…";

      const published = m.datetime ?? new Date(`${m.date}T12:00:00Z`).toISOString();

      return {
        source: "engine",
        source_id: `match:${m.id}:${m.date}`,
        source_url: "/football",
        outlet: "TrustMeBro Engine",
        author: "TrustMeBro Engine",
        headline: `${home.abbreviation} vs ${away.abbreviation} — engine preview`,
        summary: text,
        image_url: null,
        match_id: m.id,
        team_ids: [m.home_team_id, m.away_team_id],
        player_names: [],
        is_engine_take: true,
        published_at: published,
        raw: { model: MODEL, picks_seeded: topPicks.length },
      };
    }),
  );

  return drafted.filter((x): x is SoccerNewsItem => x !== null);
}
