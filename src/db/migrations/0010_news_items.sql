-- News feed items — real-writer commentary pulled from RSS / NewsAPI plus
-- AI-generated "engine takes" as a labelled fallback. Distinct from `signals`
-- (which is engine-input only); these are user-facing copy on /news.
create table news_items (
  id bigserial primary key,
  source text not null,                 -- 'rss:espn', 'newsapi', 'engine'
  source_id text not null,              -- de-dupe key per source (url hash, guid, etc.)
  source_url text,
  outlet text,                          -- 'ESPN', 'Bleacher Report', 'Yahoo Sports', 'TrustMeBro Engine'
  author text,                          -- 'Zach Lowe', null, 'TrustMeBro Engine'
  headline text,
  summary text not null,                -- 1-3 sentence pitch
  game_id integer references games(id) on delete set null,
  team_ids integer[] not null default '{}',
  player_ids integer[] not null default '{}',
  is_engine_take boolean not null default false,
  published_at timestamptz not null,
  captured_at timestamptz not null default now(),
  raw jsonb,
  unique (source, source_id)
);

create index news_items_published_idx on news_items(published_at desc);
create index news_items_game_idx on news_items(game_id, published_at desc);
create index news_items_engine_idx on news_items(is_engine_take, published_at desc);

alter table news_items enable row level security;
create policy "read news_items" on news_items for select using (true);

grant select on news_items to anon, authenticated;
grant insert, update, delete on news_items to service_role;
grant usage, select on sequence news_items_id_seq to service_role;
