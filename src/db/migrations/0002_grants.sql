-- Migration 0002: Supabase role grants
--
-- When tables are created via raw psql (our migration runner) instead of the
-- Supabase SQL Editor, Supabase's automatic GRANT event triggers don't fire
-- and the standard roles end up with zero table privileges. This migration
-- restores the grants the dashboard would have applied.

-- Schema usage
grant usage on schema public to anon, authenticated, service_role;

-- Full DML for service_role (it bypasses RLS anyway, but needs the grant)
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Read access for anon + authenticated on every public table.
-- RLS policies are the actual gate on what rows each role sees.
grant select on all tables in schema public to anon, authenticated;
grant select on all sequences in schema public to anon, authenticated;

-- Authenticated users can write their own bets. RLS restricts to auth.uid().
grant insert, update, delete on table user_bets to authenticated;

-- Default privileges so any future table inherits these grants automatically.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant select on sequences to anon, authenticated;
