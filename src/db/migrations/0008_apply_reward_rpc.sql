-- Migration 0008: apply_reward RPC for atomic engine score writes
--
-- The TS implementation of applyReward in src/lib/scoring/reward.ts did three
-- round-trips (read system_score → update → insert history) with no
-- transaction. If the second write failed, the live score and the audit log
-- could drift. The 0003 partial unique index on system_score_history blocks
-- double-credit on retry, but doesn't reconcile a single drift.
--
-- This function performs the score update and history insert inside one
-- statement-level transaction. SECURITY DEFINER lets us call it from the
-- service-role client without granting DML on system_score to anon.

create or replace function apply_reward(
  p_prediction_id uuid,
  p_outcome bet_status
) returns table (score numeric, wins int, losses int, voids int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric := case p_outcome
    when 'won'  then 1.0
    when 'lost' then -0.5
    else 0
  end;
  v_score numeric;
  v_wins int;
  v_losses int;
  v_voids int;
begin
  -- Singleton row; the WHERE id = true serializes concurrent calls via row
  -- lock for the duration of the implicit txn.
  update system_score
     set score = system_score.score + v_delta,
         wins = system_score.wins + (case when p_outcome = 'won'  then 1 else 0 end),
         losses = system_score.losses + (case when p_outcome = 'lost' then 1 else 0 end),
         voids = system_score.voids + (case when p_outcome = 'void' then 1 else 0 end),
         updated_at = now()
   where id = true
   returning system_score.score, system_score.wins, system_score.losses, system_score.voids
   into v_score, v_wins, v_losses, v_voids;

  -- 0003's partial unique index on (prediction_id, outcome) where outcome in
  -- ('won','lost') still keeps us idempotent across retries of settle-bets.
  insert into system_score_history (prediction_id, delta, outcome, score_after)
  values (p_prediction_id, v_delta, p_outcome, v_score)
  on conflict do nothing;

  return query select v_score, v_wins, v_losses, v_voids;
end;
$$;

revoke all on function apply_reward(uuid, bet_status) from public, anon, authenticated;
grant execute on function apply_reward(uuid, bet_status) to service_role;
