-- Migration 0037: make the soccer ledger update atomic, and repair the drift
-- the old non-atomic path already caused.
--
-- The NBA side has always gone through apply_reward(), which does
-- `set score = score + delta` inside Postgres. The soccer side never got the
-- equivalent: settleSoccer() read soccer_ledgers.score into JavaScript, added
-- the delta there, and wrote the result back, once per prediction, with no
-- error check. Two settlement passes overlapping means both read the same
-- starting score and the later write silently discards the earlier one.
--
-- That was survivable while settlement only ever ran from one daily cron.
-- On 2026-09-16 settlement also became an on-visit job (settleOnVisit), so
-- any two visitors can now race it -- and it bit immediately: three Europa
-- League picks all graded "won", all three history rows recorded
-- score_after = 1, and the ledger finished at 1 instead of 3 while its own
-- wins counter correctly read 3. The wins/losses/voids counters were written
-- the same read-add-write way and are exposed to the same race; they only
-- happened to survive this time.
--
-- Fix: one SECURITY DEFINER function that does the whole thing in a single
-- statement, mirroring apply_reward. Callers no longer compute the new score.

create or replace function public.apply_soccer_reward(
  p_competition text,
  p_prediction_id uuid,
  p_outcome bet_status
) returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_delta numeric := case p_outcome
    when 'won'  then 1.0
    when 'lost' then -1.0
    else 0
  end;
  v_score numeric;
begin
  insert into soccer_ledgers (competition, score, wins, losses, voids, updated_at)
  values (
    p_competition,
    v_delta,
    case when p_outcome = 'won'  then 1 else 0 end,
    case when p_outcome = 'lost' then 1 else 0 end,
    case when p_outcome = 'void' then 1 else 0 end,
    now()
  )
  on conflict (competition) do update
     set score      = soccer_ledgers.score  + v_delta,
         wins       = soccer_ledgers.wins   + (case when p_outcome = 'won'  then 1 else 0 end),
         losses     = soccer_ledgers.losses + (case when p_outcome = 'lost' then 1 else 0 end),
         voids      = soccer_ledgers.voids  + (case when p_outcome = 'void' then 1 else 0 end),
         updated_at = now()
  returning soccer_ledgers.score into v_score;

  -- Void is a no-op on the score, so it earns no history row -- same rule
  -- apply_reward follows for the NBA ledger.
  if p_outcome in ('won', 'lost') then
    insert into soccer_system_score_history
      (competition, prediction_id, delta, outcome, score_after)
    values
      (p_competition, p_prediction_id, v_delta, p_outcome, v_score)
    on conflict do nothing;
  end if;

  return v_score;
end;
$function$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, so
-- revoking only the named role would leave the door open -- the same trap
-- refresh_bro_stats hit in the 2026-09-15 audit. Revoke from PUBLIC first.
revoke all on function public.apply_soccer_reward(text, uuid, bet_status) from public;
grant execute on function public.apply_soccer_reward(text, uuid, bet_status) to service_role;

-- Repair 1: the running-total column in the history table. Recomputed as a
-- true running sum of deltas per competition, so the /score chart ends where
-- the headline ledger says it does. A no-op wherever it is already right
-- (verified: World Cup and Champions League are untouched by this).
with ordered as (
  select
    id,
    sum(delta) over (
      partition by competition
      order by recorded_at, id
      rows between unbounded preceding and current row
    ) as running
  from soccer_system_score_history
)
update soccer_system_score_history h
   set score_after = o.running
  from ordered o
 where o.id = h.id
   and h.score_after is distinct from o.running;

-- Repair 2: the ledger score itself. "Düz hesap" -- score = wins - losses
-- (CLAUDE.md, 2026-05-16 symmetric scoring). The wins/losses counters were
-- verified against soccer_predictions before writing this migration and
-- agree exactly, so they are the trustworthy side of the disagreement.
update soccer_ledgers
   set score = wins - losses,
       updated_at = now()
 where score is distinct from (wins - losses);
