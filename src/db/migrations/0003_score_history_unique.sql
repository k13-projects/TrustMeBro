-- Defensive partial unique index so a re-run of settle-bets can't double-credit
-- the system score. Only enforced for settled outcomes (won/lost); voids and
-- pending rows are not relevant.
create unique index if not exists system_score_history_prediction_settled_idx
  on system_score_history (prediction_id)
  where outcome in ('won', 'lost');
