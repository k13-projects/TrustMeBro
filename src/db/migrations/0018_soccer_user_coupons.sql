-- Migration 0018: User coupons for soccer.
-- Forward-only.
--
-- The cart/coupon builder was NBA-only: user_coupon_picks.prediction_id is a
-- hard FK to predictions(id), so a soccer pick (which lives in
-- soccer_predictions) physically can't be stored there. Rather than overload
-- user_coupon_picks, we keep user_coupons as the shared parent (mode, stake,
-- payout, status, identity, sharing) and add a parallel leg table that
-- references soccer_predictions — same split philosophy as migration 0016.
--
-- A coupon is single-sport: NBA coupons keep their legs in user_coupon_picks,
-- soccer coupons in soccer_coupon_legs. The new `sport` column on user_coupons
-- tells settlement + history which leg table to read.

-- Which sport's legs this coupon holds. Existing rows are all NBA.
alter table user_coupons
  add column if not exists sport text not null default 'nba'
  check (sport in ('nba', 'soccer'));

create index if not exists user_coupons_sport_idx on user_coupons(sport);

-- Soccer legs for a user_coupon. Mirrors user_coupon_picks but FKs to
-- soccer_predictions so referential integrity holds for the soccer side.
create table if not exists soccer_coupon_legs (
  coupon_id uuid not null references user_coupons(id) on delete cascade,
  soccer_prediction_id uuid not null references soccer_predictions(id) on delete restrict,
  pick_order integer not null,
  primary key (coupon_id, soccer_prediction_id)
);

create index if not exists soccer_coupon_legs_prediction_idx
  on soccer_coupon_legs(soccer_prediction_id);

alter table soccer_coupon_legs enable row level security;

-- Visibility + writes flow from the parent coupon, exactly like
-- user_coupon_picks. Guests go through the service-role client (bypasses RLS);
-- these policies protect signed-in users from each other.
create policy "user reads own soccer coupon legs"
  on soccer_coupon_legs for select
  using (
    exists (
      select 1 from user_coupons c
      where c.id = soccer_coupon_legs.coupon_id
        and c.user_id = auth.uid()
    )
  );

create policy "user inserts own soccer coupon legs"
  on soccer_coupon_legs for insert
  with check (
    exists (
      select 1 from user_coupons c
      where c.id = soccer_coupon_legs.coupon_id
        and c.user_id = auth.uid()
    )
  );

create policy "user deletes own soccer coupon legs"
  on soccer_coupon_legs for delete
  using (
    exists (
      select 1 from user_coupons c
      where c.id = soccer_coupon_legs.coupon_id
        and c.user_id = auth.uid()
    )
  );

grant insert, delete on table soccer_coupon_legs to authenticated;
