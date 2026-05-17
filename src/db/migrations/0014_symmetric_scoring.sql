-- Migration 0014: Symmetric +1 / -1 scoring + leg-aware coupon score
--
-- Two scoring rules changed per the user (2026-05-16):
--
--   1. Engine picks: lost goes from -0.5 to -1.0. "Düz hesap" — clean
--      symmetric math so the running ledger is instantly readable.
--
--   2. Coupons: introduce a leg-aware score column on bro_stats that
--      treats the parlay as Power-style all-or-nothing on the win side
--      and per-leg on the loss side:
--        - all legs hit         → +legs_won  (e.g. 2-pick won = +2)
--        - any leg missed       → -legs_lost (e.g. 2-pick 1H/1M = -1,
--                                              2-pick 0H/2M = -2)
--        - everything voided    →  0
--      This way a bro's "score" is a single number that captures both
--      whether they cashed and how badly the losing slips bled.
--
-- One-time backfill: replay every settled prediction in chronological
-- order under the new rule so the dashboard score lines up. The 0003
-- partial unique index on system_score_history(prediction_id) where
-- outcome in ('won','lost') still keeps us idempotent.

-- =============================================================================
-- 1. RPC update — symmetric deltas
-- =============================================================================
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
    when 'lost' then -1.0
    else 0
  end;
  v_score numeric;
  v_wins int;
  v_losses int;
  v_voids int;
begin
  update system_score
     set score = system_score.score + v_delta,
         wins = system_score.wins + (case when p_outcome = 'won'  then 1 else 0 end),
         losses = system_score.losses + (case when p_outcome = 'lost' then 1 else 0 end),
         voids = system_score.voids + (case when p_outcome = 'void' then 1 else 0 end),
         updated_at = now()
   where id = true
   returning system_score.score, system_score.wins, system_score.losses, system_score.voids
   into v_score, v_wins, v_losses, v_voids;

  if p_outcome in ('won', 'lost') then
    insert into system_score_history (prediction_id, delta, outcome, score_after)
    values (p_prediction_id, v_delta, p_outcome, v_score)
    on conflict do nothing;
  end if;

  return query select v_score, v_wins, v_losses, v_voids;
end;
$$;

-- =============================================================================
-- 2. Backfill — replay every settled prediction with the new rule
-- =============================================================================
do $backfill$
declare
  rec record;
  v_score numeric := 0;
  v_wins int := 0;
  v_losses int := 0;
  v_voids int := 0;
begin
  -- Reset live state. Truncate clears the history table; the running
  -- counters on system_score are reset back to zero and replayed below.
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
    set score = v_score,
        wins = v_wins,
        losses = v_losses,
        voids = v_voids,
        updated_at = now()
    where id = true;
end
$backfill$;

-- =============================================================================
-- 3. bro_stats matview — drop + recreate with leg-aware `score` column
-- =============================================================================
drop materialized view if exists bro_stats;

create materialized view bro_stats as
with leg_outcomes as (
  -- One row per settled, public coupon with its leg breakdown.
  select
    c.id          as coupon_id,
    c.user_id,
    c.status      as coupon_status,
    c.stake,
    c.result_payout,
    c.shared_at,
    c.settled_at,
    count(*) filter (where p.status = 'won')  as legs_won,
    count(*) filter (where p.status = 'lost') as legs_lost,
    count(*)                                   as legs_total
  from user_coupons c
  join user_coupon_picks pk on pk.coupon_id = c.id
  join predictions p        on p.id        = pk.prediction_id
  where c.is_public = true
    and c.user_id is not null
    and c.status in ('won','lost','void')
  group by c.id
),
public_users as (
  select distinct user_id
  from user_coupons
  where is_public = true and user_id is not null
),
totals as (
  select
    user_id,
    count(*)                                            as settled,
    count(*) filter (where coupon_status = 'won')        as wins,
    count(*) filter (where coupon_status = 'lost')       as losses,
    count(*) filter (where coupon_status = 'void')       as voids,
    coalesce(sum(result_payout - stake), 0)::numeric    as net_units,
    max(settled_at) filter (where coupon_status = 'won') as last_win_at,
    coalesce(sum(
      case
        when legs_lost > 0 then -legs_lost::numeric
        when legs_won  = 0 then 0::numeric
        else                    legs_won::numeric
      end
    ), 0)::numeric                                      as score
  from leg_outcomes
  group by user_id
),
pending_counts as (
  select user_id, count(*) as pending
  from user_coupons
  where is_public = true and user_id is not null and status = 'pending'
  group by user_id
),
last_shared as (
  select user_id, max(shared_at) as last_shared_at
  from user_coupons
  where is_public = true and user_id is not null
  group by user_id
)
select
  u.user_id,
  coalesce(t.settled, 0)                  as settled,
  coalesce(t.wins, 0)                     as wins,
  coalesce(t.losses, 0)                   as losses,
  coalesce(t.voids, 0)                    as voids,
  coalesce(p.pending, 0)                  as pending,
  coalesce(t.net_units, 0)::numeric       as net_units,
  coalesce(t.score, 0)::numeric           as score,
  t.last_win_at,
  ls.last_shared_at
from public_users u
left join totals          t  on t.user_id  = u.user_id
left join pending_counts  p  on p.user_id  = u.user_id
left join last_shared     ls on ls.user_id = u.user_id;

create unique index bro_stats_user_idx  on bro_stats(user_id);
create index        bro_stats_score_idx on bro_stats(score desc, last_shared_at desc nulls last);

grant select on table bro_stats to anon, authenticated;
