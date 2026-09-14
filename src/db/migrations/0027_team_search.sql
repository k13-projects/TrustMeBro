-- Migration 0027: accent-folded team names, so searching "atletico" finds
-- "Atlético Madrid". Forward-only, idempotent.
--
-- Postgres can't fold accents in a generated column (unaccent() isn't
-- immutable), so we keep a plain lowercase, accent-stripped column that the
-- sync writes alongside the name, and backfill what is already stored.

alter table soccer_teams add column if not exists name_search text;

update soccer_teams
set name_search = lower(
  translate(
    coalesce(name, '') || ' ' || coalesce(abbreviation, '') || ' ' || coalesce(country, ''),
    'áàâäãåéèêëíìîïóòôöõúùûüñçýÿšžđøåÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇÝŠŽĐØÅłŁ',
    'aaaaaaeeeeiiiiooooouuuuncyyszdoaAAAAAAEEEEIIIIOOOOOUUUUNCYSZDOAlL'
  )
)
where name_search is null or name_search = '';

-- A plain b-tree index is enough: the table is small (about a thousand rows)
-- and the query is a contains-match the planner will scan anyway.
create index if not exists soccer_teams_name_search_idx on soccer_teams(name_search);
