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

## 2026-09-14 — An upstream can fail silently; make it impossible
- **Rule:** any third-party data source gets (a) a fallback, (b) a recorded
  health state, (c) something visible on the page when the fallback is live,
  and (d) an alert on the transition. A provider that fails quietly looks
  exactly like a quiet week.
- **Always return to the primary.** The fallback is never sticky: every call
  tries the primary first, and while degraded each page view re-probes it in
  the background so recovery needs no human and no cron.
- **Test the fallback by breaking something real.** The recovery path was
  proved by setting a finished match back to 0–0 "Halftime" and watching the
  backup feed restore 1–0 Full Time, not by reading the code.

## 2026-09-14 — A fallback source needs an independent failure domain, and its name table needs to be measured
- **Rule:** a "fallback" on the same infrastructure as the primary is not a
  fallback. `cdn.espn.com` was rejected for this reason (it also ignores the
  `dates` param and returns the same six matches for every query, which would
  have served wrong data silently). UEFA's own feed at `match.uefa.com` is the
  real thing: the organising body, no key, no account, no shared failure domain.
- **Prove name reconciliation with a number, not a reading.** Matching a new
  source's fixtures to our rows was 78% on first run and looked fine in the
  code. A throwaway route that counted matched-vs-missed across every finished
  match, printing the actual misses, took it to 96% in three passes. Build the
  measurement, then delete it.
- **Alias tables can contain cycles, and a cycle is invisible.**
  `"red star belgrade": "crvena zvezda"` and `"crvena zvezda": "red star
  belgrade"` both existed. Each name canonicalised to the other, so the two
  spellings could never compare equal, and that club had been unmatchable for
  as long as the pair had been there. Any time `CLUB_ALIASES` grows, assert no
  alias value is itself an alias key.
- **Read the source's own score shape before trusting it.** UEFA exposes
  `regular`, `total`, `aggregate` and `penalty`. `total` includes extra time
  (Rapid v Hearts is 1-1 regular, 2-2 total) and is the one we want;
  `aggregate` is the two-legged tie, not the match, and using it would have
  quietly corrupted knockout results.
- **Unmatched is not always unmatchable.** The 18 remaining Conference League
  misses are July qualifiers for five clubs ESPN never gave us a row for. There
  is nothing for a score to attach to, so that is an upstream coverage gap and
  not a bug to chase.
- **The account is in `~/.claude.json`, not in the context line** (2026-09-14,
  refined 2026-09-15). The session's injected "user's email address is …" line is a
  snapshot from session start and does not follow an account switch. It read
  `algosift@gmail.com` while the terminal was live on `eren@tigerhospitalitygroup.com`
  — Kazim had switched to algosift and back, so the line was **stale, not wrong**.
  Since he switches whenever one account runs out of tokens, treat it as stale by
  default.
  Acting on it produced a false Gold-Rule caveat in the API/DB consumption audit:
  a Vercel verification was reported as blocked when it never was. Check
  `oauthAccount.emailAddress` in `~/.claude.json` before making any claim about
  which account is active — and pass the verified value to subagents, since one
  of them repeated the same wrong inference in its own report. The NBA question
  that caveat left open was ultimately answered from the data instead: newest
  `predictions` row was 2026-06-13 and `odds_snapshots` was empty, confirming the
  NBA crons are dormant.
- **Always hand over the local URL when something is ready to look at**
  (Kazim, 2026-09-14). Saying "it's on branch X, take a look" is not a
  handover — he has to go find the port, guess the route, and set a cookie to
  reach a competition-scoped page. Every message that reports work ready for
  his eyes must carry the actual clickable link(s): the page itself, plus the
  one or two states worth seeing (a filtered view, the surface it's reached
  from). Confirm the dev server is actually answering first, rather than
  assuming it survived a `.next` wipe or a restart. Applies to any "have a
  look" message, not just this project's football pages.
