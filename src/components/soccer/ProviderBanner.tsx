import { after } from "next/server";
import { AlertTriangle } from "lucide-react";
import { probePrimarySource } from "@/lib/sports/soccer/espn";
import {
  getProviderHealth,
  PRIMARY_SOURCE,
  SOURCE_LABEL,
} from "@/lib/sports/soccer/provider-health";

// Says so, on the page, when scores are not coming from the usual source.
// The alternative is what happened in September: everything looked normal
// while the data quietly stopped moving.
export async function ProviderBanner() {
  const health = await getProviderHealth();
  if (!health || health.status !== "degraded") return null;

  // While we are on a fallback, every page view quietly retries the primary
  // after the response has shipped, so the site returns to it the moment the
  // outage ends rather than waiting for the next scheduled job.
  after(() => probePrimarySource());

  const since = new Date(health.since);
  const minutes = Math.max(1, Math.round((Date.now() - since.getTime()) / 60_000));
  const howLong =
    minutes < 60
      ? `${minutes} min`
      : minutes < 60 * 48
        ? `${Math.round(minutes / 60)}h`
        : `${Math.round(minutes / (60 * 24))} days`;

  return (
    <div
      role="status"
      className="mx-auto mt-4 flex max-w-7xl items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 sm:px-6"
    >
      <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-300" />
      <p className="text-sm text-amber-100/90">
        <span className="font-semibold">Scores are coming from a backup feed.</span>{" "}
        {SOURCE_LABEL[PRIMARY_SOURCE]} has been unreachable for {howLong}, so
        results and live scores may lag, and new odds and picks may be delayed.
        Everything already graded is unaffected.
      </p>
    </div>
  );
}
