-- Migration 0026: following clubs / national teams. Forward-only, idempotent.
--
-- A viewer can follow any team; the football home then leads with their
-- matches, picks and news. Same identity split as score predictions (0024):
-- signed-in users own their rows under RLS, guests are written through the
-- service role keyed by their guest-name cookie.

create table if not exists soccer_team_follows (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null references soccer_teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  guest_name text,
  created_at timestamptz not null default now(),
  check (user_id is not null or guest_name is not null)
);

create unique index if not exists soccer_team_follows_user_idx
  on soccer_team_follows(team_id, user_id) where user_id is not null;
create unique index if not exists soccer_team_follows_guest_idx
  on soccer_team_follows(team_id, guest_name) where guest_name is not null;
create index if not exists soccer_team_follows_user_list_idx
  on soccer_team_follows(user_id) where user_id is not null;
create index if not exists soccer_team_follows_guest_list_idx
  on soccer_team_follows(guest_name) where guest_name is not null;

alter table soccer_team_follows enable row level security;

drop policy if exists "user reads own follows" on soccer_team_follows;
create policy "user reads own follows" on soccer_team_follows
  for select using (user_id = auth.uid());
drop policy if exists "user inserts own follows" on soccer_team_follows;
create policy "user inserts own follows" on soccer_team_follows
  for insert with check (user_id = auth.uid());
drop policy if exists "user deletes own follows" on soccer_team_follows;
create policy "user deletes own follows" on soccer_team_follows
  for delete using (user_id = auth.uid());

grant select on soccer_team_follows to anon, authenticated;
grant insert, delete on soccer_team_follows to authenticated;
grant select, insert, update, delete on soccer_team_follows to service_role;

-- How many people follow each team — powers a "most followed" hint in search.
create or replace view soccer_team_follow_counts as
select team_id, count(*)::integer as followers
from soccer_team_follows
group by team_id;

grant select on soccer_team_follow_counts to anon, authenticated;
