-- Migration 0024: Bro predictions game (score predictions per match).
-- Forward-only, idempotent. NOT YET APPLIED — lands with Wave 2.
--
-- Bros call the score of any football match before kickoff. After the final
-- whistle each call is graded: exact score = 3 points, right result (win /
-- draw / away) = 1, otherwise 0. One call per (match, identity); editable until
-- kickoff (enforced in the API). Signed-in users appear on the per-competition
-- leaderboard next to the engine; guests can play but stay private, same rule
-- as shared coupons (0012): a public row needs a real user_id.

create table if not exists soccer_score_predictions (
  id uuid primary key default gen_random_uuid(),
  match_id integer not null references soccer_matches(id) on delete cascade,
  competition text not null,
  user_id uuid references auth.users(id) on delete cascade,
  guest_name text,
  home_goals integer not null check (home_goals between 0 and 20),
  away_goals integer not null check (away_goals between 0 and 20),
  points integer,                       -- null until graded
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or guest_name is not null)
);

create unique index if not exists soccer_score_predictions_user_match_idx
  on soccer_score_predictions(match_id, user_id) where user_id is not null;
create unique index if not exists soccer_score_predictions_guest_match_idx
  on soccer_score_predictions(match_id, guest_name) where guest_name is not null;
create index if not exists soccer_score_predictions_match_idx
  on soccer_score_predictions(match_id);
create index if not exists soccer_score_predictions_comp_user_idx
  on soccer_score_predictions(competition, user_id) where user_id is not null;

drop trigger if exists soccer_score_predictions_updated on soccer_score_predictions;
create trigger soccer_score_predictions_updated before update on soccer_score_predictions
  for each row execute function set_updated_at();

alter table soccer_score_predictions enable row level security;

-- Owners manage their own calls (guests go through the service role).
drop policy if exists "user reads own score predictions" on soccer_score_predictions;
create policy "user reads own score predictions" on soccer_score_predictions
  for select using (user_id = auth.uid());
drop policy if exists "user inserts own score predictions" on soccer_score_predictions;
create policy "user inserts own score predictions" on soccer_score_predictions
  for insert with check (user_id = auth.uid());
drop policy if exists "user updates own score predictions" on soccer_score_predictions;
create policy "user updates own score predictions" on soccer_score_predictions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "user deletes own score predictions" on soccer_score_predictions;
create policy "user deletes own score predictions" on soccer_score_predictions
  for delete using (user_id = auth.uid());

-- Everyone can read signed-in bros' calls once the match has kicked off (the
-- leaderboard and the match page's "what the bros called" strip); before
-- kickoff a call stays private so nobody copies it.
drop policy if exists "anyone reads public calls after kickoff" on soccer_score_predictions;
create policy "anyone reads public calls after kickoff" on soccer_score_predictions
  for select using (
    user_id is not null
    and exists (
      select 1 from soccer_matches m
      where m.id = soccer_score_predictions.match_id
        and m.datetime <= now()
    )
  );

grant select on soccer_score_predictions to anon, authenticated;
grant insert, update, delete on soccer_score_predictions to authenticated;
grant select, insert, update, delete on soccer_score_predictions to service_role;

-- Per-competition leaderboard over graded calls by signed-in bros.
create or replace view soccer_prediction_leaderboard as
select
  p.competition,
  p.user_id,
  count(*)                                   as calls,
  count(*) filter (where p.points is not null) as graded,
  coalesce(sum(p.points), 0)                 as points,
  count(*) filter (where p.points = 3)       as exact_scores,
  count(*) filter (where p.points >= 1)      as right_results,
  max(p.graded_at)                           as last_graded_at
from soccer_score_predictions p
where p.user_id is not null
group by p.competition, p.user_id;

grant select on soccer_prediction_leaderboard to anon, authenticated;
