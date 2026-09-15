-- Migration 0031: coupon tables trust the caller's identity, not their
-- values — close the value-trust gap Irina's security audit proved live.
-- Forward-only.
--
-- Read: docs/reports/TrustMeBro_Security-Audit_2026-09-15.html (F-1, F-2/F-3).
--
-- F-1 (critical, proven live): the INSERT/UPDATE RLS policies on
-- soccer_coupon_legs and user_coupons check WHO is writing (auth.uid()) but
-- never WHAT they write. Any signed-in user, with only the anon key and
-- their own session, could skip POST /api/coupons and PostgREST-insert
-- straight into these tables with status='won', is_public=true, and a
-- fabricated result_payout already set, then call the over-permissioned
-- refresh_bro_stats() RPC themselves to land a forged leaderboard row.
--
-- This migration does five things:
--   1. soccer_coupon_legs INSERT policy now forces status='pending',
--      settled_side is null, settled_at is null — settlement (service role,
--      bypasses RLS) is the only writer of those columns from here on.
--   2. user_coupons INSERT policy now forces the same settlement-owned
--      columns (status/settled_at/result_payout) plus the sharing columns
--      (is_public/shared_at) to their safe defaults, AND — swept beyond the
--      two columns named in the audit repro — cross-checks payout_multiplier
--      and potential_payout against the real payout_multipliers table for
--      the row's own (pick_count, mode). Reason this earns a place in the
--      same migration: settleCouponsForSport()'s clean-sweep branch
--      (src/lib/scoring/settle-coupons.ts:150) pays out
--      `Number(coupon.potential_payout)` VERBATIM on a full win — a client
--      that bypasses the API and inserts a coupon with a forged
--      potential_payout, then attaches real (unmodified) legs that happen
--      to win legitimately, gets the forged payout paid for real by the
--      settlement cron, no further bypass needed. Same bug class as F-1,
--      reached through a different column.
--   3. UPDATE is revoked from `authenticated` on user_coupons entirely (it
--      had no column restriction — auth.uid()=user_id was the only check).
--   4. The share/unshare toggle (previously a raw client-side `.update()`
--      through that now-removed grant — see src/app/api/coupons/[id]/share/
--      route.ts) moves into a narrow SECURITY DEFINER RPC,
--      `set_coupon_public()`, that touches only is_public/shared_at and
--      carries F-2's uncontroversial half: refuses to un-share a coupon
--      that has already settled (status <> 'pending'). Whether sharing
--      itself should lock at kickoff is untouched — that's Kazim's call
--      per the audit, not decided here.
--   5. `execute` on `refresh_bro_stats()` is revoked from `authenticated`
--      AND from `public` — Postgres grants EXECUTE on a new function to
--      PUBLIC by default, and every role implicitly holds whatever PUBLIC
--      holds, so revoking only the named 0012 grant to `authenticated`
--      would not have actually closed this. The new RPC below explicitly
--      revokes its own PUBLIC default grant for the same reason.
--
-- NOT touched, deliberately: odds/line/kickoff verification (the audit
-- confirmed that half is correct and asked that it not be touched here);
-- the broader F-2 question of whether sharing should lock at kickoff
-- (product decision, not code, per the audit's own framing); leg_source's
-- existing tie to soccer_prediction_id nullability (already a check
-- constraint from migration 0029, not reopened here); a client's ability to
-- attach an arbitrary (unverified-price) leg to their own coupon before
-- settlement grades it against the real final score — that's bounded by
-- the same kickoff enforcement this migration doesn't touch, so fixing it
-- here would mean re-deriving kickoff logic at the DB layer, which is
-- exactly what was asked NOT to happen; flagged as a residual risk in the
-- handoff instead.

-- =============================================================================
-- 1. soccer_coupon_legs — INSERT must land as an ungraded, unsettled leg.
-- =============================================================================
drop policy if exists "user inserts own soccer coupon legs" on soccer_coupon_legs;
create policy "user inserts own soccer coupon legs"
  on soccer_coupon_legs for insert
  with check (
    exists (
      select 1 from user_coupons c
      where c.id = soccer_coupon_legs.coupon_id
        and c.user_id = auth.uid()
    )
    and status = 'pending'
    and settled_side is null
    and settled_at is null
  );

-- =============================================================================
-- 2. user_coupons — INSERT must land as a fresh, unsettled, unshared coupon
--    at a real payout for its own (pick_count, mode).
-- =============================================================================
drop policy if exists "user inserts own coupons" on user_coupons;
create policy "user inserts own coupons"
  on user_coupons for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and settled_at is null
    and result_payout is null
    and is_public = false
    and shared_at is null
    and abs(
      payout_multiplier - coalesce((
        select case user_coupons.mode
          when 'power' then pm.power_payout
          else pm.flex_payout
        end
        from payout_multipliers pm
        where pm.pick_count = user_coupons.pick_count
      ), -1)
    ) < 0.001
    and abs(potential_payout - round((stake * payout_multiplier)::numeric, 2)) < 0.02
  );

-- =============================================================================
-- 3. user_coupons — no unrestricted client UPDATE. Settlement writes through
--    service_role (bypasses RLS/grants entirely); sharing writes through the
--    RPC below.
-- =============================================================================
revoke update on table user_coupons from authenticated;
drop policy if exists "user updates own coupons" on user_coupons;

-- =============================================================================
-- 4. Narrow RPC for the share/unshare toggle. F-2's settled-coupon guard
--    lives here: you cannot un-share a coupon after it's graded.
-- =============================================================================
create or replace function set_coupon_public(p_coupon_id uuid, p_public boolean)
returns table (id uuid, is_public boolean, shared_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status bet_status;
begin
  select uc.user_id, uc.status into v_owner, v_status
  from user_coupons uc
  where uc.id = p_coupon_id;

  if v_owner is null or v_owner <> auth.uid() then
    return; -- not found / not yours — zero rows, same as the old not_found path
  end if;

  if p_public = false and v_status <> 'pending' then
    raise exception 'cannot_unshare_settled_coupon';
  end if;

  return query
    update user_coupons uc
    set is_public = p_public,
        shared_at = case when p_public then now() else null end
    where uc.id = p_coupon_id
    returning uc.id, uc.is_public, uc.shared_at;
end;
$$;

revoke all on function set_coupon_public(uuid, boolean) from public;
grant execute on function set_coupon_public(uuid, boolean) to authenticated;

-- =============================================================================
-- 5. refresh_bro_stats() — no legitimate client reason to call it; only the
--    settlement cron (service_role) does. Revoke from both the named
--    grantee and PUBLIC (functions default-grant EXECUTE to PUBLIC, which
--    every role holds unless it's explicitly revoked).
-- =============================================================================
revoke execute on function refresh_bro_stats() from public, authenticated;
