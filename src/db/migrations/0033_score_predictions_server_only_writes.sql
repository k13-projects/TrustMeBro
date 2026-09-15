-- Migration 0033: close the same value-trust bug shape as 0032, on
-- soccer_score_predictions (the "bros" score-call game). Forward-only.
--
-- Read: docs/handoffs/user-coupons-security_2026-09-15.md, finding F-4
-- (round-3 addendum) and docs/reports/TrustMeBro_Security-Audit_2026-09-15.html.
--
-- F-4: soccer_score_predictions (migration 0024) grants
-- insert/update/delete to `authenticated` and its UPDATE policy checks only
-- row ownership (`user_id = auth.uid()`), never which columns are being
-- written. A signed-in user can `UPDATE ... SET points = 3, graded_at =
-- now()` on their own row directly through PostgREST — no exploit beyond an
-- ordinary authenticated request — and it immediately reads as a real
-- graded perfect call on the public soccer_prediction_leaderboard, for a
-- match that was never played. Proved live by the auditor.
--
-- Same root cause as F-1/F-1-R on the coupon tables, same fix shape: stop
-- trying to re-express every invariant (who can grade, when a call can be
-- placed/edited) as an RLS predicate, and instead remove the client's write
-- grant entirely. After this migration a browser client holds SELECT only
-- on soccer_score_predictions. Every legitimate write goes through:
--   - POST /api/soccer/predictions (service role for BOTH identity kinds,
--     same change as 0032 made to POST /api/coupons — user_id already comes
--     only from getRequester()'s server-verified session, never client
--     input, so this doesn't weaken identity, it just removes the RLS grant
--     that made the direct-PostgREST self-award possible)
--   - DELETE /api/soccer/predictions (same route, same change)
--   - grade-calls.ts's gradeScoreCalls() (service role already; the only
--     writer of points/graded_at, and stays that way — see the trigger
--     below, which explicitly leaves grading writes alone)
--
-- DEFENSE IN DEPTH (binds even a service-role write, because it's a
-- trigger, not RLS, which service_role bypasses by design): a call may only
-- be inserted, or have its home_goals/away_goals edited, while the match is
-- still soccer_matches.state = 'pre'. This is the actual kickoff invariant
-- the API already checks via hasKickedOff(match.datetime) — now also
-- checked at the table, fresher than the API's own check by construction,
-- same shape as 0032's enforce_leg_prekickoff(). The trigger explicitly
-- does NOT block a grading write (points/graded_at only, home_goals/
-- away_goals unchanged) — that happens well after kickoff by design, and is
-- already the only thing left able to reach this table via service role
-- once the grant below is gone.

-- =============================================================================
-- 1. Revoke every direct client write. SELECT is untouched.
-- =============================================================================
revoke insert, update, delete on table soccer_score_predictions from authenticated, public;

-- Dead policies (no grant left to exercise them) — dropped so the audit
-- surface reads clean: SELECT-only is genuinely all that's left.
drop policy if exists "user inserts own score predictions" on soccer_score_predictions;
drop policy if exists "user updates own score predictions" on soccer_score_predictions;
drop policy if exists "user deletes own score predictions" on soccer_score_predictions;

-- =============================================================================
-- 2. Kickoff enforcement at the table, not only the API — and never on a
--    grading write (points/graded_at), which is legitimate post-kickoff.
-- =============================================================================
create or replace function enforce_score_prediction_prekickoff() returns trigger as $$
declare
  v_state text;
begin
  if tg_op = 'UPDATE'
     and new.home_goals = old.home_goals
     and new.away_goals = old.away_goals then
    return new;
  end if;

  select state into v_state from soccer_matches where id = new.match_id;
  if v_state is distinct from 'pre' then
    raise exception 'match_already_started';
  end if;
  return new;
end;
$$ language plpgsql;

-- Cosmetic (Postgres default-grants EXECUTE on new functions to PUBLIC; a
-- trigger-typed function can't actually be invoked outside trigger context
-- regardless, per the round-3 audit's note on the 0032 trigger — but there's
-- no reason to leave the grant sitting there looking like a door).
revoke execute on function enforce_score_prediction_prekickoff() from public;

drop trigger if exists soccer_score_predictions_prekickoff on soccer_score_predictions;
create trigger soccer_score_predictions_prekickoff
  before insert or update on soccer_score_predictions
  for each row execute function enforce_score_prediction_prekickoff();
