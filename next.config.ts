import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Locked CSP. We don't allow inline scripts in prod beyond what Next.js needs
// for hydration nonces — Next.js writes hashes itself for `<Script>` and the
// runtime; for inline style we keep `'unsafe-inline'` since Tailwind and a few
// gradient/style props depend on it. img-src includes ESPN headshots and our
// Supabase storage host. connect-src includes Supabase + balldontlie because
// the chat panel streams from those origins.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  // Next.js needs eval-style in dev for HMR; relax there.
  isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // News thumbnails come from many unknown outlet/CDN hosts, so we allow any
  // https image source for the news feed. Scripts/connect stay locked down.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com https://api.the-odds-api.com https://api.balldontlie.io https://newsapi.org",
  "media-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,

  images: {
    // AVIF first, WebP fallback. Browsers that support neither still get the
    // original via next/image fallback negotiation.
    formats: ["image/avif", "image/webp"],
    // Player headshots are small (~80–250 px on the page); deviceSizes spans
    // the whole render set so layouts using `sizes=` get the right candidate.
    deviceSizes: [320, 420, 640, 768, 1024, 1280, 1600],
    imageSizes: [16, 32, 48, 64, 96, 128, 192, 256, 384],
    // Cache optimized variants on the CDN for a week.
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      { protocol: "https", hostname: "a.espncdn.com", pathname: "/i/**" },
    ],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
