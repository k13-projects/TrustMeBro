-- Migration 0007: User coupons (saved parlays) + PrizePicks-style payout
-- multipliers.
--
-- user_coupons stores a saved N-pick combo the user assembled in the cart
-- drawer. user_coupon_picks is the join table. Settlement is downstream of
-- predictions.status: once every linked prediction is final, the coupon
-- flips to won/lost/void. The engine's system_score is NOT touched by
-- coupon settlement — coupons are user wagers, the score is the engine's
-- per-pick ledger.
--
-- payout_multipliers is the DB-backed source of truth for PrizePicks
-- Power/Flex rates per pick count. Seeded from the constants previously
-- hardcoded in src/lib/analysis/combos.ts. Update via the admin PATCH
-- endpoint when PrizePicks changes; the UI displays verified_at so users
-- know how fresh the rates are.

-- =============================================================================
-- USER COUPONS
-- =============================================================================
create table user_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('power', 'flex')),
  pick_count integer not null check (pick_count between 2 and 6),
  stake numeric not null check (stake > 0),
  payout_multiplier numeric not null check (payout_multiplier > 0),
  potential_payout numeric not null check (potential_payout > 0),
  status bet_status not null default 'pending',
  result_payout numeric,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_coupons_user_idx on user_coupons(user_id, created_at desc);
create index user_coupons_status_idx on user_coupons(status);

create table user_coupon_picks (
  coupon_id uuid not null references user_coupons(id) on delete cascade,
  prediction_id uuid not null references predictions(id) on delete restrict,
  pick_order integer not null,
  primary key (coupon_id, prediction_id)
);

create index user_coupon_picks_prediction_idx on user_coupon_picks(prediction_id);

alter table user_coupons enable row level security;
alter table user_coupon_picks enable row level security;

create policy "user reads own coupons"
  on user_coupons for select
  using (auth.uid() = user_id);

create policy "user inserts own coupons"
  on user_coupons for insert
  with check (auth.uid() = user_id);

create policy "user updates own coupons"
  on user_coupons for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user deletes own coupons"
  on user_coupons for delete
  using (auth.uid() = user_id);

-- coupon_picks visibility flows from the parent coupon
create policy "user reads own coupon picks"
  on user_coupon_picks for select
  using (
    exists (
      select 1 from user_coupons c
      where c.id = user_coupon_picks.coupon_id
        and c.user_id = auth.uid()
    )
  );

create policy "user inserts own coupon picks"
  on user_coupon_picks for insert
  with check (
    exists (
      select 1 from user_coupons c
      where c.id = user_coupon_picks.coupon_id
        and c.user_id = auth.uid()
    )
  );

create policy "user deletes own coupon picks"
  on user_coupon_picks for delete
  using (
    exists (
      select 1 from user_coupons c
      where c.id = user_coupon_picks.coupon_id
        and c.user_id = auth.uid()
    )
  );

create trigger user_coupons_updated before update on user_coupons
  for each row execute function set_updated_at();

grant insert, update, delete on table user_coupons to authenticated;
grant insert, delete on table user_coupon_picks to authenticated;

-- =============================================================================
-- PAYOUT MULTIPLIERS
-- =============================================================================
create table payout_multipliers (
  pick_count integer primary key check (pick_count between 2 and 6),
  power_payout numeric,
  flex_payout numeric,
  source text not null default 'prizepicks',
  verified_at timestamptz not null default now(),
  notes text,
  updated_at timestamptz not null default now()
);

alter table payout_multipliers enable row level security;

create policy "read payout_multipliers"
  on payout_multipliers for select using (true);

create trigger payout_multipliers_updated before update on payout_multipliers
  for each row execute function set_updated_at();

-- Seed values mirror the constants previously in src/lib/analysis/combos.ts.
-- Power requires every pick to hit. Flex pays smaller multiples when most
-- hit (only relevant for 3+ pick coupons).
insert into payout_multipliers (pick_count, power_payout, flex_payout) values
  (2, 3,    null),
  (3, 5,    2.25),
  (4, 10,   5),
  (5, 20,   10),
  (6, 37.5, 25)
on conflict do nothing;
