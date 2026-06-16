-- Engine-generated coupons — the headline soccer feature.
-- Migration 0017. Forward-only.
--
-- The engine publishes three kinds of coupons:
--   banko      → single most-trusted pick (highest confidence favorite)
--   multiplier → a parlay built to a target payout (2× / 3× / 5× / 10×)
--   surprise   → a longshot stack with a big multiplier ("win huge")
--
-- These are distinct from user-built `user_coupons` (the Bro Board). Legs
-- reference `soccer_predictions`. `sport` is carried for forward-compat when
-- the engine starts publishing NBA coupons too, but is 'soccer' for now.

create type engine_coupon_kind as enum ('banko', 'multiplier', 'surprise');

create table engine_coupons (
  id uuid primary key default gen_random_uuid(),
  sport text not null default 'soccer',
  kind engine_coupon_kind not null,
  target_multiplier numeric,            -- e.g. 2,3,5,10 for 'multiplier'; null for banko
  leg_count integer not null default 0,
  combined_odds numeric not null,       -- product of leg decimal odds
  combined_probability numeric,         -- product of leg de-vigged probabilities
  status bet_status not null default 'pending',
  legs_won integer not null default 0,
  legs_lost integer not null default 0,
  legs_void integer not null default 0,
  generated_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index engine_coupons_sport_kind_idx on engine_coupons(sport, kind);
create index engine_coupons_status_idx on engine_coupons(status);
create index engine_coupons_generated_idx on engine_coupons(generated_at desc);

create table engine_coupon_legs (
  coupon_id uuid not null references engine_coupons(id) on delete cascade,
  soccer_prediction_id uuid not null references soccer_predictions(id) on delete cascade,
  leg_order integer not null default 0,
  primary key (coupon_id, soccer_prediction_id)
);

create index engine_coupon_legs_prediction_idx on engine_coupon_legs(soccer_prediction_id);

alter table engine_coupons enable row level security;
alter table engine_coupon_legs enable row level security;

create policy "read engine_coupons" on engine_coupons for select using (true);
create policy "read engine_coupon_legs" on engine_coupon_legs for select using (true);

create trigger engine_coupons_updated before update on engine_coupons
  for each row execute function set_updated_at();
