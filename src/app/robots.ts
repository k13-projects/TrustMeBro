import type { MetadataRoute } from "next";

// Personal tool — no search/AI indexing wanted. Bots (Baiduspider, Googlebot,
// OpenAI) were ~95% of our traffic and drained the Vercel Fast Data Transfer
// tier (see proxy.ts for the hard edge block that enforces this immediately;
// robots.txt is the polite signal well-behaved crawlers re-read within ~24h).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
