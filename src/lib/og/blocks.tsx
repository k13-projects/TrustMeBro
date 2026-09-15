import type { CompetitionMeta } from "@/lib/sports/soccer/competitions";
import { BRAND_GOLD, type ShareTheme } from "./theme";

// Shared JSX pieces for the football share cards (match/pick/coupon
// ImageResponse renders). Plain functions, not client components — these run
// server-side at request time inside next/og and get resolved by satori like
// any other React function component.

const FONT = "Barlow Condensed";

export function Wordmark() {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: 1,
        color: BRAND_GOLD,
      }}
    >
      TrustMeBro
    </div>
  );
}

export function Footer() {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: "auto",
      }}
    >
      <div style={{ display: "flex", fontFamily: FONT, fontSize: 20, color: "rgba(255,255,255,0.45)" }}>
        tmb.k13projects.com
      </div>
      <Wordmark />
    </div>
  );
}

export function CompetitionStrip({
  meta,
  theme,
  caption,
}: {
  meta: CompetitionMeta;
  theme: ShareTheme;
  caption?: string | null;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={meta.logo} width={56} height={56} alt="" style={{ objectFit: "contain" }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: FONT, fontWeight: 700, fontSize: 30, color: theme.accent }}>
          {meta.fullName}
        </div>
        {caption ? (
          <div style={{ display: "flex", fontFamily: FONT, fontSize: 18, color: "rgba(255,255,255,0.55)" }}>
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Crest/flag with an initials fallback when the source URL is missing — the
// card must still read cleanly even without artwork.
export function CrestBadge({
  crest,
  abbr,
  size,
}: {
  crest: string | null;
  abbr: string;
  size: number;
}) {
  if (crest) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={crest} width={size} height={size} alt="" style={{ objectFit: "contain" }} />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: size / 2,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.2)",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: size * 0.32,
        color: "rgba(255,255,255,0.7)",
      }}
    >
      {(abbr || "?").slice(0, 3).toUpperCase()}
    </div>
  );
}

// Fixed-ring confidence badge — a colored circle with the percentage. Not a
// proportional arc (conic-gradient support in satori is unreliable), but it
// reads clearly as "how sure the engine is" at a glance.
export function ConfidenceRing({ value, accent }: { value: number; accent: string }) {
  return (
    <div
      style={{
        display: "flex",
        width: 120,
        height: 120,
        borderRadius: 60,
        border: `6px solid ${accent}`,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ display: "flex", fontFamily: FONT, fontWeight: 700, fontSize: 40, color: "#fff" }}>
        {Math.round(value)}%
      </div>
      <div style={{ display: "flex", fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
        confidence
      </div>
    </div>
  );
}

export function BankoBadge() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        background: BRAND_GOLD,
        padding: "8px 20px",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 22,
        color: "#0A0A0C",
      }}
    >
      🔒 BANKO
    </div>
  );
}

const STAMP_COLOR: Record<"won" | "lost" | "void", string> = {
  won: "#22C55E",
  lost: "#FB7185",
  void: "rgba(255,255,255,0.5)",
};

// A rotated corner stamp for settled picks — the visual equivalent of the
// WON/LOST badges already used across the app's pick rows.
export function ResultStamp({ status }: { status: "won" | "lost" | "void" }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: 150,
        right: 64,
        transform: "rotate(8deg)",
        border: `4px solid ${STAMP_COLOR[status]}`,
        borderRadius: 12,
        padding: "6px 22px",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 32,
        letterSpacing: 2,
        color: STAMP_COLOR[status],
      }}
    >
      {status.toUpperCase()}
    </div>
  );
}
