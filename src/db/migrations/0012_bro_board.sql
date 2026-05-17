-- Migration 0012: Bro Board — share flag, follow graph, aggregate stats
--
-- Adds the social plumbing on top of profiles (0011):
--   * is_public + shared_at on user_coupons so a user can opt-in per coupon
--   * public SELECT policies for shared coupons (and their picks)
--   * follows graph between authenticated users
--   * bro_stats materialized view (W/L/net units over shared+settled coupons)
--   * refresh_bro_stats() called from src/lib/scoring/settle-coupons.ts
--
-- Guests cannot post — we enforce that with a check constraint that requires
-- user_id whenever is_public=true. (Migration 0009 made user_id nullable to
-- support guest coupons, so without this guard a guest could flip the flag.)

-- =============================================================================
-- COUPON SHARE FLAG
-- =============================================================================
alter table user_coupons
  add column if not exists is_public boolean not null default false,
  add column if not exists shared_at timestamptz;

alter table user_coupons
  add constraint user_coupons_public_requires_user
  check (is_public = false or user_id is not null);

create index if not exists user_coupons_public_shared_idx
  on user_coupons(is_public, shared_at desc)
  where is_public = true;

-- Public read policies. The existing owner-RLS policy stays in place — these
-- are additive (Postgres ORs select policies together).
drop policy if exists "anyone reads public coupons" on user_coupons;
create policy "anyone reads public coupons"
  on user_coupons for select
  using (is_public = true);

drop policy if exists "anyone reads picks of public coupons" on user_coupon_picks;
create policy "anyone reads picks of public coupons"
  on user_coupon_picks for select
  using (
    exists (
      select 1 from user_coupons c
      where c.id = user_coupon_picks.coupon_id
        and c.is_public = true
    )
  );

-- =============================================================================
-- FOLLOW GRAPH
-- =============================================================================
create table follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on follows(followee_id, created_at desc);
create index follows_follower_idx on follows(follower_id, created_at desc);

alter table follows enable row level security;

create policy "anyone reads follows"
  on follows for select using (true);

create policy "user inserts own follows"
  on follows for insert
  with check (auth.uid() = follower_id);

create policy "user deletes own follows"
  on follows for delete
  using (auth.uid() = follower_id);

grant select on table follows to anon, authenticated;
grant insert, delete on table follows to authenticated;

-- =============================================================================
-- AGGREGATE STATS — bro_stats matview
-- =============================================================================
-- One row per user with at least one public coupon. Profile + leaderboard
-- queries read this directly instead of aggregating user_coupons on every
-- render. Refreshed by settle-coupons.ts at the end of each settlement pass.
create materialized view bro_stats as
select
  c.user_id,
  count(*) filter (where c.status in ('won','lost','void'))            as settled,
  count(*) filter (where c.status = 'won')                              as wins,
  count(*) filter (where c.status = 'lost')                             as losses,
  count(*) filter (where c.status = 'void')                             as voids,
  count(*) filter (where c.status = 'pending')                          as pending,
  coalesce(
    sum(c.result_payout - c.stake) filter (where c.status in ('won','lost','void')),
    0
  )::numeric                                                            as net_units,
  max(c.settled_at) filter (where c.status = 'won')                     as last_win_at,
  max(c.shared_at)                                                      as last_shared_at
from user_coupons c
where c.is_public = true and c.user_id is not null
group by c.user_id;

create unique index bro_stats_user_idx on bro_stats(user_id);

grant select on table bro_stats to anon, authenticated;

-- security definer so the cron caller (service role) can refresh without
-- needing per-role grants on the matview owner. concurrently requires the
-- unique index above.
create or replace function refresh_bro_stats() returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently bro_stats;
$$;

grant execute on function refresh_bro_stats() to service_role, authenticated;
