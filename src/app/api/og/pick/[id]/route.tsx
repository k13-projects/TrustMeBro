import { ImageResponse } from "next/og";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { getPredictionById } from "@/lib/sports/soccer/share-queries";
import { sideLabel } from "@/lib/sports/soccer/labels";
import { loadShareFonts } from "@/lib/og/font";
import { SHARE_HEIGHT, SHARE_THEME, SHARE_WIDTH } from "@/lib/og/theme";
import { BankoBadge, CompetitionStrip, CrestBadge, ConfidenceRing, Footer, ResultStamp } from "@/lib/og/blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const pick = await getPredictionById(id);
  if (!pick) {
    return new Response("Not found", { status: 404 });
  }

  const fonts = await loadShareFonts();
  const meta = COMPETITIONS[pick.competition];
  const theme = SHARE_THEME[meta.theme];
  const pickText = sideLabel(pick.market, pick.side, pick.line, pick.home, pick.away);
  const resultStatus = pick.status === "won" || pick.status === "lost" || pick.status === "void" ? pick.status : null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          width: "100%",
          height: "100%",
          padding: 64,
          background: `linear-gradient(135deg, ${theme.bg} 0%, ${theme.bgTo} 100%)`,
        }}
      >
        {resultStatus ? <ResultStamp status={resultStatus} /> : null}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <CompetitionStrip meta={meta} theme={theme} />
          {pick.is_banko ? <BankoBadge /> : null}
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 180 }}>
                <CrestBadge crest={pick.home_crest} abbr={pick.home_abbr} size={80} />
                <div
                  style={{
                    display: "flex",
                    fontFamily: "Barlow Condensed",
                    fontWeight: 700,
                    fontSize: 22,
                    color: "#fff",
                    textAlign: "center",
                  }}
                >
                  {pick.home}
                </div>
              </div>
              <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontSize: 24, color: "rgba(255,255,255,0.35)" }}>
                vs
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 180 }}>
                <CrestBadge crest={pick.away_crest} abbr={pick.away_abbr} size={80} />
                <div
                  style={{
                    display: "flex",
                    fontFamily: "Barlow Condensed",
                    fontWeight: 700,
                    fontSize: 22,
                    color: "#fff",
                    textAlign: "center",
                  }}
                >
                  {pick.away}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontWeight: 700,
                fontSize: 48,
                color: theme.accent,
                textAlign: "center",
              }}
            >
              {pickText}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div
                style={{
                  display: "flex",
                  fontFamily: "Barlow Condensed",
                  fontSize: 24,
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                Best price
              </div>
              <div
                style={{
                  display: "flex",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.08)",
                  padding: "6px 18px",
                  fontFamily: "Barlow Condensed",
                  fontWeight: 700,
                  fontSize: 28,
                  color: "#fff",
                }}
              >
                {pick.best_odds.toFixed(2)}
              </div>
            </div>
          </div>

          <ConfidenceRing value={pick.confidence} accent={theme.accent} />
        </div>

        <div style={{ display: "flex" }}>
          <Footer />
        </div>
      </div>
    ),
    { width: SHARE_WIDTH, height: SHARE_HEIGHT, fonts },
  );
}
