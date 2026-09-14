# Lessons

Corrections and hard-won rules for this project. Append; never rewrite history.

## 2026-09-13 — ESPN blocks Vercel on `site.api.espn.com`; use `site.web.api.espn.com`
- **What happened:** From 2026-09-10 every server-side ESPN call from production
  returned 403 "Access Denied" (Akamai). Local dev kept working, so the daily
  sync/settle crons failed silently for three days and four finished matches
  sat at "Halftime". The World Cup never hit this because it ended in July.
- **Rule:** All ESPN "site" API calls go through `site.web.api.espn.com` (same
  paths, same payloads) with a fallback to the other host on 403. Never trust
  "works locally" for third-party feeds; verify from prod (`/api/soccer/live`
  surfaces the upstream error text).
- **Safety nets now in place:** every competition sync re-reads matches that
  kicked off 3h+ ago and aren't final; a failed on-visit refresh does not
  update `last_run_at`, so it retries on the next visit.
