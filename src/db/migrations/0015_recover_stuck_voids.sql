-- Migration 0015: Recover stuck voids (settled-before-ingest bug)
--
-- Two Final playoff games (401871157, 401871338, both 2026-05-15) had their
-- box scores ingested AFTER /api/cron/settle-bets ran, so 125 picks were
-- voided as "DNP" before any stats existed and then got stuck — settlePending
-- only re-touches `pending` rows. See .claude/ENGINE_STRATEGY.md Phase 1.
--
-- The forward-fix in src/lib/scoring/settle.ts now DEFERS grading a Final game
-- that has zero ingested stat rows (leaves it pending), so this can't recur.
-- This migration repairs the rows that were already stuck.
--
-- Approach: re-grade the stuck voids against the now-present box scores, then
-- replay the canonical engine-score backfill (identical to migration 0014) so
-- system_score + system_score_history are rebuilt consistently from the
-- corrected predictions table — fixing score, wins, losses, voids, and the
-- chronological history in one shot.

-- 1. Re-grade stuck voids on Final games where the player now has a box score.
with graded as (
  select
    p.id,
    p.pick,
    p.line,
    case p.market
      when 'points'      then s.points
      when 'rebounds'    then s.rebounds
      when 'assists'     then s.assists
      when 'threes_made' then s.fg3m
      when 'pra'         then coalesce(s.points, 0) + coalesce(s.rebounds, 0) + coalesce(s.assists, 0)
    end as v
  from predictions p
  join games g             on g.id = p.game_id
  join player_game_stats s on s.game_id = p.game_id and s.player_id = p.player_id
  where p.status = 'void'
    and lower(g.status) like '%final%'
    and s.minutes is not null
    and s.minutes > 0
)
update predictions p
   set status = case
         when (p.pick = 'over'  and g.v > p.line)
           or (p.pick = 'under' and g.v < p.line) then 'won'::bet_status
         else 'lost'::bet_status
       end,
       result_value = g.v,
       settled_at = coalesce(p.settled_at, now())
  from graded g
 where p.id = g.id
   and g.v is not null
   and g.v <> p.line;   -- exact-line pushes correctly remain void

-- 2. Mirror the corrected outcome onto any user_bets that referenced them.
update user_bets ub
   set status = p.status,
       result_value = p.result_value,
       settled_at = p.settled_at
  from predictions p
 where ub.prediction_id = p.id
   and ub.status = 'void'
   and p.status in ('won', 'lost');

-- 3. Replay the canonical engine-score backfill (verbatim from migration 0014).
do $backfill$
declare
  rec record;
  v_score numeric := 0;
  v_wins int := 0;
  v_losses int := 0;
  v_voids int := 0;
begin
  truncate system_score_history;
  update system_score
    set score = 0, wins = 0, losses = 0, voids = 0, updated_at = now()
    where id = true;

  for rec in (
    select id, status, settled_at
    from predictions
    where status in ('won', 'lost', 'void')
      and settled_at is not null
    order by settled_at, id
  ) loop
    if rec.status = 'void' then
      v_voids := v_voids + 1;
    elsif rec.status = 'won' then
      v_score := v_score + 1.0;
      v_wins := v_wins + 1;
      insert into system_score_history
        (prediction_id, delta, outcome, score_after, recorded_at)
      values
        (rec.id, 1.0, 'won'::bet_status, v_score, rec.settled_at);
    else  -- lost
      v_score := v_score - 1.0;
      v_losses := v_losses + 1;
      insert into system_score_history
        (prediction_id, delta, outcome, score_after, recorded_at)
      values
        (rec.id, -1.0, 'lost'::bet_status, v_score, rec.settled_at);
    end if;
  end loop;

  update system_score
    set score = v_score, wins = v_wins, losses = v_losses, voids = v_voids, updated_at = now()
    where id = true;
end
$backfill$;
