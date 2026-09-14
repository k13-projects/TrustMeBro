import { ImageResponse } from "next/og";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import {
  getMatchById,
  getPredictionsForMatch,
  getRounds,
  roundLabelFor,
  type MatchRow,
} from "@/lib/sports/soccer/queries";
import { sideLabel } from "@/lib/sports/soccer/labels";
import { PROJECT_TIMEZONE } from "@/lib/date";
import { loadShareFonts } from "@/lib/og/font";
import { SHARE_HEIGHT, SHARE_THEME, SHARE_WIDTH } from "@/lib/og/theme";
import { CompetitionStrip, CrestBadge, Footer } from "@/lib/og/blocks";

export const alt = "Match preview";
export const size = { width: SHARE_WIDTH, height: SHARE_HEIGHT };
export const contentType = "image/png";

type Props = { params: Promise<{ id: string }> };

function dateLine(datetime: string): string {
  return new Date(datetime).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: PROJECT_TIMEZONE,
  });
}

function timeLine(datetime: string): string {
  return (
    new Date(datetime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: PROJECT_TIMEZONE,
    }) + " PT"
  );
}

function CenterColumn({ match }: { match: MatchRow }) {
  if (match.state === "post") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 64, color: "#fff" }}>
          {match.home_score}–{match.away_score}
        </div>
        <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontSize: 20, color: "rgba(255,255,255,0.55)" }}>
          FULL TIME
        </div>
      </div>
    );
  }
  if (match.state === "in") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 64, color: "#fff" }}>
          {match.home_score}–{match.away_score}
        </div>
        <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontSize: 20, color: "#FB7185" }}>
          LIVE {match.clock ?? ""}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 30, color: "#fff" }}>
        {match.datetime ? dateLine(match.datetime) : "Kickoff TBD"}
      </div>
      {match.datetime ? (
        <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontSize: 22, color: "rgba(255,255,255,0.55)" }}>
          {timeLine(match.datetime)}
        </div>
      ) : null}
    </div>
  );
}

export default async function Image({ params }: Props) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) {
    return new Response("Not found", { status: 404 });
  }
  const match = await getMatchById(matchId);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  const [rounds, predictions, fonts] = await Promise.all([
    getRounds(match.competition),
    getPredictionsForMatch(matchId),
    loadShareFonts(),
  ]);

  const meta = COMPETITIONS[match.competition];
  const theme = SHARE_THEME[meta.theme];
  const roundLabel = roundLabelFor(match, rounds);
  const topPick = predictions.find((p) => p.status === "pending") ?? predictions[0] ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: 64,
          background: `linear-gradient(135deg, ${theme.bg} 0%, ${theme.bgTo} 100%)`,
        }}
      >
        <CompetitionStrip meta={meta} theme={theme} caption={roundLabel} />

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 56,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: 300 }}>
            <CrestBadge crest={match.home.crest} abbr={match.home.abbreviation} size={120} />
            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontWeight: 700,
                fontSize: 32,
                color: "#fff",
                textAlign: "center",
              }}
            >
              {match.home.name}
            </div>
          </div>

          <CenterColumn match={match} />

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: 300 }}>
            <CrestBadge crest={match.away.crest} abbr={match.away.abbreviation} size={120} />
            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontWeight: 700,
                fontSize: 32,
                color: "#fff",
                textAlign: "center",
              }}
            >
              {match.away.name}
            </div>
          </div>
        </div>

        {match.venue ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              fontFamily: "Barlow Condensed",
              fontSize: 18,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            {match.venue}
          </div>
        ) : null}

        {topPick ? (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderRadius: 999,
                border: `2px solid ${theme.accent}`,
                padding: "10px 24px",
                fontFamily: "Barlow Condensed",
                fontSize: 22,
                color: "#fff",
              }}
            >
              <span style={{ display: "flex", fontWeight: 700, color: theme.accent }}>Engine:</span>
              <span style={{ display: "flex" }}>
                {sideLabel(topPick.market, topPick.side, topPick.line, topPick.home, topPick.away)} ·{" "}
                {Math.round(topPick.confidence)}% · {topPick.best_odds.toFixed(2)}
              </span>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", marginTop: 24 }}>
          <Footer />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
