import { ImageResponse } from "next/og";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { getEngineCouponById } from "@/lib/sports/soccer/share-queries";
import { couponKindLabel, sideLabel } from "@/lib/sports/soccer/labels";
import type { CouponView, PredictionDetail } from "@/lib/sports/soccer/queries";
import { loadShareFonts } from "@/lib/og/font";
import { SHARE_HEIGHT, SHARE_THEME, SHARE_WIDTH } from "@/lib/og/theme";
import { CompetitionStrip, CrestBadge, Footer } from "@/lib/og/blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function kindBadge(coupon: CouponView): string {
  if (coupon.kind === "surprise") return "🎁 SURPRISE";
  if (coupon.kind === "banko") return couponKindLabel.banko;
  const x = coupon.target_multiplier ?? Math.round(coupon.combined_odds);
  return `${x}×`;
}

function LegRow({ leg }: { leg: PredictionDetail }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        paddingTop: 10,
        paddingBottom: 10,
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
        <CrestBadge crest={leg.home_crest} abbr={leg.home_abbr} size={28} />
        <CrestBadge crest={leg.away_crest} abbr={leg.away_abbr} size={28} />
        <div
          style={{
            display: "flex",
            fontFamily: "Barlow Condensed",
            fontSize: 20,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          {leg.home_abbr || leg.home} v {leg.away_abbr || leg.away}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "Barlow Condensed",
          fontWeight: 700,
          fontSize: 22,
          color: "#fff",
        }}
      >
        {sideLabel(leg.market, leg.side, leg.line, leg.home, leg.away)}
      </div>
    </div>
  );
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const coupon = await getEngineCouponById(id);
  if (!coupon || coupon.legs.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const fonts = await loadShareFonts();
  const meta = COMPETITIONS[coupon.legs[0].competition];
  const theme = SHARE_THEME[meta.theme];
  const hitChance =
    coupon.combined_probability !== null ? Math.round(coupon.combined_probability * 100) : null;
  const legs = coupon.legs.slice(0, 6);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: 56,
          background: `linear-gradient(135deg, ${theme.bg} 0%, ${theme.bgTo} 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <CompetitionStrip meta={meta} theme={theme} />
          <div
            style={{
              display: "flex",
              borderRadius: 999,
              background: theme.accent,
              padding: "10px 24px",
              fontFamily: "Barlow Condensed",
              fontWeight: 700,
              fontSize: 26,
              color: "#0A0A0C",
            }}
          >
            {kindBadge(coupon)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 20 }}>
          <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 40, color: "#fff" }}>
            {coupon.combined_odds.toFixed(2)}× payout
          </div>
          {hitChance !== null ? (
            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontSize: 22,
                color: "rgba(255,255,255,0.55)",
              }}
            >
              ~{hitChance}% hit chance
            </div>
          ) : null}
          <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontSize: 22, color: "rgba(255,255,255,0.4)" }}>
            {coupon.legs.length} legs
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginTop: 16,
            flex: 1,
            gap: legs.length <= 3 ? 14 : 0,
          }}
        >
          {legs.map((leg) => (
            <LegRow key={leg.id} leg={leg} />
          ))}
        </div>

        <div style={{ display: "flex" }}>
          <Footer />
        </div>
      </div>
    ),
    { width: SHARE_WIDTH, height: SHARE_HEIGHT, fonts },
  );
}
