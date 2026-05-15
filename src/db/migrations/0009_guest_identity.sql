-- Migration 0009: Guest identity (name-based, no auth)
--
-- The login flow now offers two paths: Google SSO (a real auth.users row,
-- RLS via auth.uid()) and "continue as guest" (a name in a cookie, no auth).
-- Bets and coupons need to carry either the auth user_id OR a guest_name so
-- both modes can share the same tables.
--
-- Security trade-off: anyone who picks an existing guest name sees that
-- guest's history. That is intentional — guest mode is convenience, not
-- security. The Google path remains the right answer for actual isolation.

-- user_bets: allow null user_id when guest_name is set, and vice versa.
alter table user_bets alter column user_id drop not null;
alter table user_bets add column if not exists guest_name text;
alter table user_bets
  add constraint user_bets_identity_chk
  check (user_id is not null or guest_name is not null);

-- user_coupons: same shape.
alter table user_coupons alter column user_id drop not null;
alter table user_coupons add column if not exists guest_name text;
alter table user_coupons
  add constraint user_coupons_identity_chk
  check (user_id is not null or guest_name is not null);

create index if not exists user_bets_guest_idx
  on user_bets(guest_name) where guest_name is not null;
create index if not exists user_coupons_guest_idx
  on user_coupons(guest_name) where guest_name is not null;

-- Guest reads/writes go through service-role (via API routes that check the
-- cookie), so user-facing RLS policies don't need new "guest" cases — the
-- service-role client bypasses RLS entirely. The existing auth.uid()-based
-- policies continue to protect signed-in users from each other.

-- Discoverable name picker: a tiny public table of recent guest profiles
-- the /login page can render as chips ("welcome back, Eren").
create table if not exists guest_profiles (
  name_lower text primary key,
  display_name text not null,
  bets_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table guest_profiles enable row level security;

-- Deliberately public — name discovery is the entire point.
drop policy if exists "anyone reads guest profiles" on guest_profiles;
create policy "anyone reads guest profiles"
  on guest_profiles for select using (true);

grant select on table guest_profiles to anon, authenticated;
