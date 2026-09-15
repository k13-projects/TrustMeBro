-- Migration 0034: a graded score call is part of the record — undeletable,
-- even by a service-role writer. Forward-only.
--
-- Product decision (Kazim, 2026-09-15, via the coordinator): coupon sharing
-- does NOT lock at kickoff (no change there — 0031's settled-coupon
-- un-share guard stays as-is). Separately: once a soccer_score_predictions
-- row has been graded, it must not be deletable — a user can keep choosing
-- what to *publish*, but can't erase a call from the record after the fact.
-- Deleting an *ungraded* call (changing your mind pre-kickoff) must keep
-- working — that isn't hiding anything.
--
-- This closes the incidental finding from the F-4 fix (0033): the DELETE
-- route only ever checked hasKickedOff(match.datetime), and no DB
-- constraint restricted DELETE at all. In real data `state`/`datetime`
-- normally advance together, so a post-kickoff delete was usually already
-- blocked by that check — but "usually" isn't a security property, and
-- grading is the actual invariant that matters here, not kickoff timing.
-- "Graded" means `points is not null` or `graded_at is not null` — the two
-- columns gradeScoreCalls() (src/lib/analysis/soccer/grade-calls.ts) always
-- writes together; checking either catches a partially-written row too.
--
-- Same shape as 0033's enforce_score_prediction_prekickoff(): a trigger,
-- not an RLS predicate, so it binds service_role as well as authenticated —
-- the actual bar the audit pattern in this project holds writes to.

create or replace function enforce_score_prediction_no_delete_after_grading() returns trigger as $$
begin
  if old.points is not null or old.graded_at is not null then
    raise exception 'call_already_graded';
  end if;
  return old;
end;
$$ language plpgsql;

-- Cosmetic, same reasoning as 0033: Postgres default-grants EXECUTE on a new
-- function to PUBLIC; a trigger-typed function can't be invoked outside
-- trigger context regardless, but there's no reason to leave the grant
-- looking like a door.
revoke execute on function enforce_score_prediction_no_delete_after_grading() from public;

drop trigger if exists soccer_score_predictions_no_delete_after_grading on soccer_score_predictions;
create trigger soccer_score_predictions_no_delete_after_grading
  before delete on soccer_score_predictions
  for each row execute function enforce_score_prediction_no_delete_after_grading();
