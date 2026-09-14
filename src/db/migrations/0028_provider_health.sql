-- Migration 0028: upstream data-provider health. Forward-only, idempotent.
--
-- On 2026-09-10 ESPN's edge began refusing our server-side calls and nothing
-- said so: the daily sync and settlement failed silently for three days and
-- four finished matches sat unresolved. This records which source is serving
-- data, so the site can say so on the page and an alert can fire on the
-- transition rather than the outage being discovered by accident.

create table if not exists soccer_provider_health (
  id boolean primary key default true check (id),
  status text not null default 'ok' check (status in ('ok', 'degraded')),
  active_source text not null default 'espn-site-web',
  since timestamptz not null default now(),
  last_ok_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into soccer_provider_health (id) values (true) on conflict do nothing;

-- One row per outage, so "how often does this happen" is answerable.
create table if not exists soccer_provider_incidents (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  source text,
  error text
);

create index if not exists soccer_provider_incidents_open_idx
  on soccer_provider_incidents(started_at desc) where ended_at is null;

alter table soccer_provider_health enable row level security;
alter table soccer_provider_incidents enable row level security;

drop policy if exists "read provider health" on soccer_provider_health;
create policy "read provider health" on soccer_provider_health for select using (true);
drop policy if exists "read provider incidents" on soccer_provider_incidents;
create policy "read provider incidents" on soccer_provider_incidents for select using (true);

grant select on soccer_provider_health, soccer_provider_incidents to anon, authenticated;
grant select, insert, update on soccer_provider_health to service_role;
grant select, insert, update on soccer_provider_incidents to service_role;
