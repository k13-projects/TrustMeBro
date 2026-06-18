-- Migration 0019: Bro Board goes multi-sport.
-- Forward-only.
--
-- The bro_stats matview (0012, redefined in 0014) only ever joined NBA legs
-- (user_coupons → user_coupon_picks → predictions). Now that soccer coupons
-- exist (0018), the Bro Board is driven by the global sport toggle: NBA shows
-- NBA leaderboards/feed, football shows football. So bro_stats becomes one row
-- per (user_id, sport), unioning each sport's leg table:
--   nba    → user_coupon_picks  → predictions
--   soccer → soccer_coupon_legs → soccer_predictions
--
-- The leg-aware scoring rule from 0014 is unchanged (all legs hit → +legs_won;
-- any leg missed → -legs_lost; all void → 0); it's just computed per sport.

-- =============================================================================
-- 1. Public read on soccer coupon legs (mirror user_coupon_picks from 0012)
-- =============================================================================
-- Direct loader reads of public soccer coupons' legs run as anon/authenticated,
-- so they need a public SELECT policy. (The matview itself runs as owner and
-- bypasses RLS.) SELECT is already granted to anon/authenticated via the
-- default privileges set in 0002.
drop policy if exists "anyone reads legs of public soccer coupons" on soccer_coupon_legs;
create policy "anyone reads legs of public soccer coupons"
  on soccer_coupon_legs for select
  using (
    exists (
      select 1 from user_coupons c
      where c.id = soccer_coupon_legs.coupon_id
        and c.is_public = true
    )
  );

-- =============================================================================
-- 2. bro_stats — one row per (user_id, sport)
-- =============================================================================
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
  -- Soccer legs
  select
    c.id,
    c.user_id,
    c.sport,
    c.status,
    c.stake,
    c.result_payout,
    c.shared_at,
    c.settled_at,
    sp.status
  from user_coupons c
  join soccer_coupon_legs sl on sl.coupon_id          = c.id
  join soccer_predictions sp on sp.id                 = sl.soccer_prediction_id
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
