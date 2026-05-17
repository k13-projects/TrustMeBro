-- Migration 0011: Bro Board — user profiles
--
-- Bro Board is the social section at /bros where authenticated users share
-- coupons they played, follow other users, and surface W/L on shared coupons.
-- Identity is auth-only (Google SSO) — guests can browse but not post or be
-- followed, because cookie-based guest identity can be claimed by anyone and
-- doesn't carry the durability a follow graph needs.
--
-- This migration adds the profiles table (handle, display name, bio, avatar).
-- Migration 0012 adds the share flag on coupons, the follow graph, and the
-- aggregate stat matview.

create extension if not exists citext;

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle citext not null unique check (
    char_length(handle::text) between 3 and 24
    and handle::text ~ '^[a-z0-9_]+$'
  ),
  display_name text not null,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_handle_idx on profiles(handle);

alter table profiles enable row level security;

-- Profiles are public — name discovery + profile pages need anonymous read.
create policy "anyone reads profiles"
  on profiles for select using (true);

create policy "user inserts own profile"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "user updates own profile"
  on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

grant select on table profiles to anon, authenticated;
grant insert, update on table profiles to authenticated;
