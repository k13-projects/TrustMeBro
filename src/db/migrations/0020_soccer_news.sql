-- Soccer (World Cup) news feed. Migration 0020. Forward-only.
--
-- Parallels 0010_news_items (NBA) but lives in its own table: the NBA news_items
-- FKs point at games/players, and soccer tags subjects by country team + a
-- curated star-player name list (there is no soccer players table). One row per
-- (source, source_id) — idempotent re-ingest. image_url is nullable; the feed
-- falls back to the tagged country flag when a source ships no thumbnail.

create table soccer_news (
  id bigserial primary key,
  source text not null,                            -- 'rss:espnfc', 'rss:bbc', 'engine', ...
  source_id text not null,                         -- de-dupe key per source
  source_url text,
  outlet text,
  author text,
  headline text,
  summary text not null,                           -- 1-3 sentence pitch
  image_url text,                                  -- card thumbnail (nullable -> fall back to flag)
  match_id integer references soccer_matches(id) on delete set null,
  team_ids integer[] not null default '{}',        -- soccer_teams ids (the "subject" countries)
  player_names text[] not null default '{}',       -- curated star names mentioned
  is_engine_take boolean not null default false,
  published_at timestamptz not null,
  captured_at timestamptz not null default now(),
  raw jsonb,
  unique (source, source_id)
);

create index soccer_news_published_idx on soccer_news(published_at desc);
create index soccer_news_match_idx on soccer_news(match_id, published_at desc);
create index soccer_news_team_idx on soccer_news using gin(team_ids);
create index soccer_news_engine_idx on soccer_news(is_engine_take, published_at desc);

alter table soccer_news enable row level security;
create policy "read soccer_news" on soccer_news for select using (true);
grant select on soccer_news to anon, authenticated;
grant insert, update, delete on soccer_news to service_role;
