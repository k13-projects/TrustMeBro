-- Migration 0006: Reset system_score to a clean baseline.
--
-- The +1.0 / -0.5 ledger is meant to be a real-time picture of the engine's
-- per-pick performance. Any settlements that ran before the public-facing
-- launch are noise from development, not signal worth carrying forward.
-- After this migration the score reads 0.0 and starts accumulating from the
-- next settle-bets cron run.
--
-- This is intentionally destructive: it deletes the score history.

update system_score
set score = 0,
    wins = 0,
    losses = 0,
    voids = 0,
    updated_at = now()
where id = true;

truncate table system_score_history restart identity;
