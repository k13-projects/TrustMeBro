// Font loading for share-card ImageResponse renders. next/og (Satori) can't
// reach the app's Google-Fonts-via-next/font setup, so we fetch one weight of
// Barlow Condensed as raw TTF bytes at request time and cache the promise at
// module scope — every request on this server instance after the first reuses
// the same buffer instead of re-fetching.
//
// The Google Fonts CSS endpoint serves `.ttf`/`.otf` links (instead of woff2)
// to clients whose Accept header doesn't look like a modern browser, which is
// exactly what Node's `fetch` sends — this is the same trick the Vercel OG
// examples use.

export type ShareFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

let fontsPromise: Promise<ShareFont[]> | null = null;

async function fetchGoogleFontTtf(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
    const css = await fetch(cssUrl).then((res) => res.text());
    const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
    if (!match) return null;
    const res = await fetch(match[1]);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// Empty array on failure — callers pass it straight to ImageResponse's
// `fonts` option, which just falls back to satori's default sans. A share
// card with the wrong font beats a share card that 500s.
export function loadShareFonts(): Promise<ShareFont[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const bold = await fetchGoogleFontTtf("Barlow Condensed", 700);
      return bold ? [{ name: "Barlow Condensed", data: bold, weight: 700, style: "normal" as const }] : [];
    })();
  }
  return fontsPromise;
}

export const SHARE_FONT_FAMILY = "Barlow Condensed";
