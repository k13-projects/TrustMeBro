-- Migration 0029: soccer_coupon_legs — support user-picked (non-engine) legs.
-- Forward-only, one concern.
--
-- Per docs/handoffs/user-coupons-plan_2026-09-14.md section 1: a coupon leg
-- today *is* an engine prediction row (soccer_prediction_id is a required
-- FK). A user-chosen outcome from the rates board has no prediction to point
-- at, so the FK becomes nullable and the leg grows its own copy of
-- match/market/side/line/odds/status — the leg's own columns become the
-- source of truth for both leg sources, engine or user (settlement is fixed
-- to read them in migration 0030, not this one).
--
-- DEVIATION FROM THE PLAN (recorded per instructions): the plan's SQL simply
-- does `alter column soccer_prediction_id drop not null`, but that column is
-- still part of this table's primary key — `soccer_coupon_legs_pkey =
-- PRIMARY KEY (coupon_id, soccer_prediction_id)` (verified live before
-- writing this migration). Postgres physically cannot have a nullable
-- primary-key column; the ALTER as literally written in the plan fails with
-- "column ... is in a primary key". Fix: give the table a surrogate `id`
-- primary key, and preserve the old table's dedup guarantee (one row per
-- (coupon, prediction) for engine legs — the only legs with a prediction to
-- dedup on) as a partial unique index instead of the composite PK.

alter table soccer_coupon_legs
  add column id uuid not null default gen_random_uuid();

alter table soccer_coupon_legs drop constraint soccer_coupon_legs_pkey;
alter table soccer_coupon_legs add primary key (id);

-- Old PK's guarantee, scoped to the rows that actually have a prediction id.
create unique index soccer_coupon_legs_engine_leg_idx
  on soccer_coupon_legs(coupon_id, soccer_prediction_id)
  where soccer_prediction_id is not null;

alter table soccer_coupon_legs
  alter column soccer_prediction_id drop not null;

alter table soccer_coupon_legs
  add column match_id integer references soccer_matches(id),
  add column market soccer_market,
  add column side match_side,
  add column line numeric,
  add column odds_taken numeric,
  add column leg_source text not null default 'engine' check (leg_source in ('engine', 'user')),
  add column status bet_status not null default 'pending',
  add column settled_side match_side,
  add column settled_at timestamptz;

-- Backfill existing (all-engine) rows from their linked prediction so they
-- keep settling and ranking exactly as they do today.
update soccer_coupon_legs l
set match_id = p.match_id,
    market = p.market,
    side = p.side,
    line = p.line,
    odds_taken = p.best_odds,
    status = p.status,
    settled_side = p.settled_side,
    settled_at = p.settled_at
from soccer_predictions p
where p.id = l.soccer_prediction_id;

alter table soccer_coupon_legs
  alter column match_id set not null,
  alter column market set not null,
  alter column side set not null,
  alter column odds_taken set not null;

alter table soccer_coupon_legs
  add constraint soccer_coupon_legs_source_chk check (
    (leg_source = 'engine' and soccer_prediction_id is not null)
    or (leg_source = 'user' and soccer_prediction_id is null)
  );

-- Defense against a hostile/duplicate client: no coupon may carry the same
-- outcome twice, regardless of which leg source added it. coalesce() folds
-- the nullable `line` (match_winner/btts) into the key.
create unique index soccer_coupon_legs_outcome_idx
  on soccer_coupon_legs(coupon_id, match_id, market, side, coalesce(line, -999999));

create index soccer_coupon_legs_match_idx on soccer_coupon_legs(match_id);
create index soccer_coupon_legs_pending_idx
  on soccer_coupon_legs(match_id) where status = 'pending';
