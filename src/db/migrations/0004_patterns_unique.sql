-- Allow upserting (player, pattern_type, market) so the prediction engine can
-- refresh detected patterns each day without piling up duplicate rows.
-- Some patterns are not market-specific (e.g. rest-day dips) — for those the
-- market column will be NULL and the unique constraint treats NULLs as
-- distinct, which is the behavior we want (one row per market per type).
alter table patterns
  add constraint patterns_player_type_market_unique
  unique (player_id, pattern_type, market);
