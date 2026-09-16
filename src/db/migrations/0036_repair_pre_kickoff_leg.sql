-- Data repair, 2026-09-16.
--
-- 1. One coupon leg (Hapoel Be'er Sheva v Dinamo Zagreb, Europa League MD1,
--    kickoff 2026-09-16 19:00 UTC) was graded "lost" at 2026-09-15 05:11 UTC,
--    a full day before kickoff. It is a leftover from the Sep 15 provider
--    fallback test: the match was briefly marked finished at 0-0, the leg
--    settlement ran, and the match was reverted afterwards but the leg was
--    not. Settlement skips non-pending legs, so it would never re-grade and
--    the whole coupon would grade wrong. Put it back to pending so the real
--    result settles it.
--
-- 2. The provider-health row still carries the test's error text while
--    status is ok. Clear it so /api/health and the banner say nothing stale.

update soccer_coupon_legs
   set status = 'pending', settled_at = null
 where id = '747d86bc-f659-4913-b26f-fe71868cc037'
   and status = 'lost'
   and exists (
     select 1 from soccer_matches m
      where m.id = soccer_coupon_legs.match_id and m.finished = false
   );

update soccer_provider_health
   set last_error = null
 where status = 'ok'
   and last_error = 'simulated outage for testing';

select refresh_bro_stats();
