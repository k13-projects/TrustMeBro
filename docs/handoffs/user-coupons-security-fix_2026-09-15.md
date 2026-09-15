# User-Built Coupons — F-1 Security Fix (Mariana)

**Stage:** Engineering (backend-integrations) · **Date:** 2026-09-15 · **Branch:** `tmb_sep14_v11`
**Type:** One migration + one small route change, applied live. Fixes Irina's
F-1 (critical, proven live) and the code half of F-2, per
`docs/handoffs/user-coupons-security_2026-09-15.md` and
`docs/reports/TrustMeBro_Security-Audit_2026-09-15.html`.

---

## Status

**PASS.**

## Summary

F-1 was real and live: `soccer_coupon_legs` and `user_coupons` RLS checked
*who* was writing (`auth.uid()`), never *what* they wrote — any signed-in
user with the public anon key could bypass `POST /api/coupons` and forge a
win straight into the leaderboard. Fixed at the root with one migration
(`0031_coupon_write_value_trust.sql`):

1. `soccer_coupon_legs` INSERT now forces `status='pending', settled_side is
   null, settled_at is null` — settlement (service role) is the only writer
   of those columns.
2. `user_coupons` INSERT now forces the same settlement-owned columns
   (`status`/`settled_at`/`result_payout`) to safe defaults, **plus** the
   sharing columns (`is_public`/`shared_at`) to `false`/`null`, **plus** a
   cross-check of `payout_multiplier`/`potential_payout` against the real
   `payout_multipliers` table for the row's own `(pick_count, mode)`. That
   last one is beyond the two columns named in the audit repro: I found that
   `settleCouponsForSport()`'s clean-sweep branch
   (`src/lib/scoring/settle-coupons.ts:150`) pays out
   `Number(coupon.potential_payout)` **verbatim** on a full win. Without this
   check, a client could bypass the API, insert a coupon with a forged
   `potential_payout` (e.g. 999999) and legs it does nothing else dishonest
   to, and get paid the forged amount for real once those (unmodified) legs
   naturally won — no further bypass needed, the settlement cron does the
   forging for you. Same bug class as F-1, different column.
3. `UPDATE` is revoked from `authenticated` on `user_coupons` entirely (it
   had no column restriction before — `auth.uid()=user_id` was the only
   check).
4. Share/unshare moved from a raw client `.update()` (which relied on the
   grant just revoked) into a new `SECURITY DEFINER` RPC,
   `set_coupon_public()`. It carries F-2's uncontroversial half: refuses to
   un-share a coupon once its `status <> 'pending'`. Whether *sharing*
   itself should lock at kickoff is untouched — that's Kazim's call per the
   audit, not decided here.
5. `execute` on `refresh_bro_stats()` is revoked from **both**
   `authenticated` and `public`. Postgres grants `EXECUTE` on a new function
   to `PUBLIC` by default, and every role implicitly holds whatever `PUBLIC`
   holds — the original 2026-09-14 migration only granted-to (never
   revoked-from) `authenticated`, so revoking just that named grant would
   not have actually closed the hole. Caught this while writing the same
   revoke for my own new RPC and applied the same care to
   `refresh_bro_stats()`.

Not touched, deliberately (per the brief): odds/line/kickoff verification
(server-side, already correct per the audit); the broader F-2 product
question of whether sharing should lock at kickoff; `leg_source`'s existing
tie to `soccer_prediction_id` nullability (already a check constraint from
migration 0029, still sufficient).

## For Kazim

The hole a security review found — anyone signed in could fake a win on the
public leaderboard without actually betting anything — is closed on the
live database; I broke it myself with a throwaway test account first to
prove it's shut, then proved normal coupon creation and settlement still
work exactly as before, and cleaned up every trace of the test.

## Files

- `src/db/migrations/0031_coupon_write_value_trust.sql` (new, applied live)
- `src/app/api/coupons/[id]/share/route.ts` (rewritten: both directions now
  call `set_coupon_public()` instead of a raw client-side `.update()`)

## Verification — commands and results

All against the live database (`DATABASE_URL`), using a throwaway auth user
+ the public anon key exactly as a browser session would authenticate
(mirrors Irina's method), plus a real request to the real cron route for
the end-to-end settlement proof. Full throwaway script was
`scripts/_verify_0031.ts`, deleted after the run — not part of the shipped
diff.

**Applied:**
```
node --env-file=.env.local scripts/db-migrate.mjs src/db/migrations/0031_coupon_write_value_trust.sql
✓ Migration applied.
```

**Attacks — all now fail:**

| Attack | Result |
|---|---|
| Direct `user_coupons` insert, `status:'won', result_payout:999999, is_public:true` (the exact audit repro) | **Rejected** — RLS policy violation |
| Direct `user_coupons` insert, `status:'pending'` but `payout_multiplier:999999, potential_payout:999999` (the sweep beyond the repro) | **Rejected** — RLS policy violation |
| Direct `soccer_coupon_legs` insert onto own coupon, `status:'won'` | **Rejected** — RLS policy violation |
| Direct `UPDATE` on own `user_coupons` row (`status:'won', result_payout:99999`) | **Rejected** — 0 rows affected (no UPDATE grant) |
| `rpc('refresh_bro_stats')` as `authenticated` | **Rejected** — permission denied |
| `rpc('set_coupon_public', {p_public:false})` on a coupon fabricated (service-role) as already `status:'won', is_public:true` | **Rejected** — `cannot_unshare_settled_coupon` |

**Legitimate path — all still work:**

| Step | Result |
|---|---|
| Correctly-priced pending coupon insert (`pick_count:2, mode:'power', stake:10, payout_multiplier:3, potential_payout:30`) | **Accepted** |
| Mixed engine+user leg insert onto that coupon, exact shape `POST /api/coupons` builds | **Accepted**, both rows landed |
| `set_coupon_public(id, true)` then `(id, false)` on the still-`pending` coupon | **Both accepted** — share/unshare works while pending |
| Real `GET /api/cron/soccer/settle-bets?competition=uefa.champions` (real request scope, real `CRON_SECRET`, scoped to one live competition) after marking the fixture's matches finished | **200 ok** |
| Resulting leg statuses | both legs → `won` |
| Resulting coupon | `status:'won', result_payout:30` (the locked-in payout) |
| `admin.rpc('refresh_bro_stats')` (service role) | **Succeeds** |

**Cleanup / baseline, before vs. after (byte-identical):**
```
user_coupons = 22 (both)
soccer_coupon_legs = 14 total, 14 leg_source='engine' (both)
bro_stats: all 4 rows identical, incl. net_units/score, before and after
```
Throwaway auth user, matches (`900000001`/`900000002`), prediction, and both
test coupons were deleted; `refresh_bro_stats()` re-run afterward. Zero
stray rows.

**Build gates:**
```
npx tsc --noEmit   → clean
npm run lint       → clean
npm run build      → clean (Next 16 / Turbopack)
```

## Risks

- **Residual, explicitly out of scope for this migration:** a client can
  still bypass the API and attach an arbitrary leg (any `match_id`/
  `market`/`side`/`line`/`odds_taken`, unverified against real odds) to
  their own coupon, because RLS now forces `status='pending'` but doesn't
  re-derive the odds/line consensus the way the API route does. On its own
  this isn't a forgery vector — a leg's win/loss is graded against the real
  final score, independent of the stored `odds_taken` — but combined with
  bypassing the app's kickoff check (also DB-unenforced, and explicitly out
  of scope per the brief — "the audit confirmed that half is correct"), a
  client could in principle attach a pending leg for a match that has
  *already* finished, engineered to the known outcome, and have the next
  settlement pass grade it a free win. This mirrors the audit's own F-6
  (kickoff check has a sub-second race at the API layer) — same underlying
  gap, just reached by skipping the API outright rather than racing it.
  Closing it at the DB layer means re-deriving kickoff/match-state logic in
  SQL, which is exactly what this pass was told not to touch. Flagging for a
  fast-follow, not fixing silently.
- The multiplier/payout check in the new INSERT policy re-derives
  `payout_multipliers` at write time; if that table's seeded rates ever
  change without a matching migration bump, existing legitimate inserts
  keep working (the app and the policy both read the same table live) —
  no drift risk there.
- `node_modules/server-only` had to be temporarily stubbed to run
  `settle-coupons.ts` logic outside the Next.js runtime during verification
  (it's a Next-internal alias with no real npm package behind it); removed
  after the test run, not part of the shipped diff, not a new dependency.

## Next

`release-engineer` (Kate) via the Michael/security sign-off gate — recommend
looping `security-auditor` (Irina) back in first to confirm F-1/F-3 read as
closed and to weigh in on the residual risk noted above before `hm++`. F-2's
broader product question (should sharing lock at kickoff) still needs
Kazim's call; the settled-coupon guard half is done.

## Human gate

**Yes, one item, already flagged by the audit and unchanged by this fix:**
F-2's broader question — should the share/unshare decision lock at kickoff,
before the outcome is knowable — is still Kazim's to make. Nothing else here
needs his sign-off: no irreversible step, no money, no scope change beyond
the security fix itself.
