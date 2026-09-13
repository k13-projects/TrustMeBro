-- Migration 0025: who actually won a match, per ESPN — needed for two-legged
-- ties that finish level on aggregate and go to extra time / penalties, where
-- the scores alone can't say who went through. Forward-only, idempotent.
alter table soccer_matches
  add column if not exists winner_team_id integer references soccer_teams(id);
