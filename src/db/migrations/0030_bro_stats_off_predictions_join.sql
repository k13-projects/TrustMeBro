-- Migration 0030: bro_stats reads soccer leg status off the leg itself.
-- Forward-only.
--
-- THE LANDMINE (docs/handoffs/user-coupons-plan_2026-09-14.md section 2):
-- bro_stats (migration 0019) inner-joins soccer_coupon_legs to
-- soccer_predictions on soccer_prediction_id to read leg status. A user leg
-- (migration 0029) has soccer_prediction_id = null, so that join silently
-- drops every user leg from the matview — a coupon with one user leg would
-- rank as if that leg didn't exist, or never leave `pending` in leg_outcomes
-- if it's the deciding leg. Fix: read soccer_coupon_legs.status directly
-- (migration 0029 put it there, backfilled for every existing engine leg,
-- and src/lib/scoring/settle-coupons.ts now keeps it current going forward).
-- The join to soccer_predictions is dropped entirely for the soccer branch —
-- not narrowed to a left join, removed, since nothing here needs the
-- prediction row anymore.
--
-- NBA branch is untouched: NBA has no user-leg concept, its legs still only
-- ever come from predictions.

drop materialized view if exists bro_stats;

create materialized view bro_stats as
with legs as (
  -- NBA legs
  select
    c.id          as coupon_id,
    c.user_id,
    c.sport,
    c.status      as coupon_status,
    c.stake,
    c.result_payout,
    c.shared_at,
    c.settled_at,
    p.status      as leg_status
  from user_coupons c
  join user_coupon_picks pk on pk.coupon_id = c.id
  join predictions p        on p.id         = pk.prediction_id
  where c.is_public = true and c.user_id is not null and c.sport = 'nba'
  union all
  -- Soccer legs — status lives on the leg itself (engine AND user legs),
  -- no join to soccer_predictions needed or wanted.
  select
    c.id,
    c.user_id,
    c.sport,
    c.status,
    c.stake,
    c.result_payout,
    c.shared_at,
    c.settled_at,
    sl.status
  from user_coupons c
  join soccer_coupon_legs sl on sl.coupon_id = c.id
  where c.is_public = true and c.user_id is not null and c.sport = 'soccer'
),
leg_outcomes as (
  -- One row per settled, public coupon with its leg breakdown.
  select
    coupon_id,
    user_id,
    sport,
    coupon_status,
    stake,
    result_payout,
    shared_at,
    settled_at,
    count(*) filter (where leg_status = 'won')  as legs_won,
    count(*) filter (where leg_status = 'lost') as legs_lost,
    count(*)                                     as legs_total
  from legs
  where coupon_status in ('won','lost','void')
  group by coupon_id, user_id, sport, coupon_status, stake, result_payout, shared_at, settled_at
),
public_users as (
  select distinct user_id, sport
  from user_coupons
  where is_public = true and user_id is not null
),
totals as (
  select
    user_id,
    sport,
    count(*)                                             as settled,
    count(*) filter (where coupon_status = 'won')         as wins,
    count(*) filter (where coupon_status = 'lost')        as losses,
    count(*) filter (where coupon_status = 'void')        as voids,
    coalesce(sum(result_payout - stake), 0)::numeric     as net_units,
    max(settled_at) filter (where coupon_status = 'won')  as last_win_at,
    coalesce(sum(
      case
        when legs_lost > 0 then -legs_lost::numeric
        when legs_won  = 0 then 0::numeric
        else                    legs_won::numeric
      end
    ), 0)::numeric                                       as score
  from leg_outcomes
  group by user_id, sport
),
pending_counts as (
  select user_id, sport, count(*) as pending
  from user_coupons
  where is_public = true and user_id is not null and status = 'pending'
  group by user_id, sport
),
last_shared as (
  select user_id, sport, max(shared_at) as last_shared_at
  from user_coupons
  where is_public = true and user_id is not null
  group by user_id, sport
)
select
  u.user_id,
  u.sport,
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
left join totals          t  on t.user_id  = u.user_id and t.sport  = u.sport
left join pending_counts  p  on p.user_id  = u.user_id and p.sport  = u.sport
left join last_shared     ls on ls.user_id = u.user_id and ls.sport = u.sport;

-- Unique index is required for `refresh materialized view concurrently`.
create unique index bro_stats_user_sport_idx on bro_stats(user_id, sport);
create index bro_stats_score_idx
  on bro_stats(sport, score desc, last_shared_at desc nulls last);

grant select on table bro_stats to anon, authenticated;
