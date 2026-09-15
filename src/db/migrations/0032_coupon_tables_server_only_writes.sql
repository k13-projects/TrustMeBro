-- Migration 0032: close the value-trust class structurally, not column by
-- column. Forward-only.
--
-- Read: docs/handoffs/user-coupons-security_2026-09-15.md ("Addendum,
-- 2026-09-15 — independent re-verification of 0031", finding F-1-R) and
-- docs/reports/TrustMeBro_Security-Audit_2026-09-15.html#verification-2026-09-15.
--
-- 0031 patched the two named columns (status/is_public) plus payout/
-- multiplier. Irina immediately found a third path through the *same* RLS
-- shape: attach a leg to a match that already finished, on the side that
-- already won, leave status unset (satisfies 0031's "must land pending"
-- check perfectly) — the real settlement cron then grades it an honest win.
-- Plus two more unbounded columns (stake, pick_count vs. actual leg count).
-- That's not three bugs, it's one bug shape repeating: these two tables
-- accept direct client INSERT/UPDATE/DELETE at all, so every invariant has
-- to be re-expressed as an RLS predicate, and any one we forget (or that a
-- state-based check like kickoff can't even be expressed as a static
-- predicate) is a hole. Patching predicates forever was exactly what Irina
-- and Kazim both flagged as the pattern to stop.
--
-- ROOT FIX: revoke insert/update/delete on user_coupons, user_coupon_picks,
-- and soccer_coupon_legs from `authenticated` (and `public`, belt-and-
-- suspenders — see the 0031 lesson on PUBLIC's default grants, applies
-- equally to table grants even though Postgres doesn't default-grant DML on
-- new tables the way it default-grants EXECUTE on new functions) entirely.
-- After this migration a browser client holds SELECT only on all three
-- tables. Every legitimate write goes through one of:
--   - POST /api/coupons (service role from here on for BOTH identity kinds —
--     see src/app/api/coupons/route.ts in this same pass; user_id already
--     comes from a server-verified session via getRequester()'s
--     supabase.auth.getUser(), never from client input, so routing the
--     authenticated path through supabaseAdmin() too doesn't weaken
--     identity — it removes the RLS-insert grant that made the anon-key
--     bypass possible in the first place)
--   - set_coupon_public() RPC (0031, SECURITY DEFINER, unchanged)
--   - the settlement crons (service role already; never touched RLS grants)
-- The SELECT policies (each user reads their own rows) are untouched.
--
-- DEFENSE IN DEPTH, in case a future bug ever re-opens a write path (a new
-- route, a debugging script pointed at the wrong client) — these bind even
-- a service-role write, because they're plain CHECK constraints / triggers,
-- not RLS (which service_role bypasses by design):
--   (a) stake ceiling as a table CHECK — the app's Zod `.max(10000)` already
--       agreed on this number; the DB now agrees too.
--   (b) a BEFORE INSERT trigger on soccer_coupon_legs refusing a leg whose
--       match has already left state='pre' — the actual root cause behind
--       F-1-R, now checked at the table itself at insert time (fresher than
--       the API's own check by definition, since it re-reads state at the
--       moment of insert rather than moments earlier — this also happens to
--       close the audit's separately-noted F-6 sub-second check-then-insert
--       race, as a side effect of fixing it at the right layer).
--
-- pick_count vs. actual attached leg count is NOT fixed here — a CHECK
-- constraint can't see sibling rows in another table, and a constraint
-- trigger would just be re-deriving the same "trust the settlement code,
-- not the stored row" property the audit's own suggested fix already gets
-- for free. Fixed instead in src/lib/scoring/settle-coupons.ts (same pass,
-- code not SQL): the clean-sweep payout branch now always recomputes from
-- the real count of legs found in the table via payout_multipliers, the
-- same re-pricing settlement already does for voided legs, rather than
-- trusting potential_payout/pick_count as written under any circumstance.

-- =============================================================================
-- 1. Revoke every direct client write. SELECT is untouched.
-- =============================================================================
revoke insert, update, delete on table user_coupons from authenticated, public;
revoke insert, update, delete on table user_coupon_picks from authenticated, public;
revoke insert, update, delete on table soccer_coupon_legs from authenticated, public;

-- Dead policies (no grant left to exercise them) — dropped so the audit
-- surface reads clean: SELECT-only is genuinely all that's left, not
-- "SELECT plus some unreachable INSERT policies that look like a door."
drop policy if exists "user inserts own coupons" on user_coupons;
drop policy if exists "user deletes own coupons" on user_coupons;
drop policy if exists "user inserts own coupon picks" on user_coupon_picks;
drop policy if exists "user deletes own coupon picks" on user_coupon_picks;
drop policy if exists "user inserts own soccer coupon legs" on soccer_coupon_legs;
drop policy if exists "user deletes own soccer coupon legs" on soccer_coupon_legs;

-- =============================================================================
-- 2a. Stake ceiling — binds even a service-role write.
-- =============================================================================
alter table user_coupons
  add constraint user_coupons_stake_ceiling check (stake <= 10000);

-- =============================================================================
-- 2b. Kickoff enforcement at the table, not only the API.
-- =============================================================================
create or replace function enforce_leg_prekickoff() returns trigger as $$
declare
  v_state text;
begin
  select state into v_state from soccer_matches where id = new.match_id;
  if v_state is distinct from 'pre' then
    raise exception 'match_already_started';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists soccer_coupon_legs_prekickoff on soccer_coupon_legs;
create trigger soccer_coupon_legs_prekickoff
  before insert on soccer_coupon_legs
  for each row execute function enforce_leg_prekickoff();
