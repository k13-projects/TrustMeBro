-- Migration 0013: Bro Board presence
--
-- Adds last_seen_at to profiles so the Active Bros sidebar at /bros can split
-- the directory into "online now" vs "everyone else". last_seen_at is touched
-- by the root layout when an authenticated bro hits any page (rate-limited to
-- one UPDATE per 60s per user inside touchPresence()).
--
-- Defaulted to now() so existing rows show up as fresh on backfill — they'd
-- otherwise look stale forever and never appear "online" until their next
-- login.

alter table profiles
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists profiles_last_seen_idx
  on profiles(last_seen_at desc);
