-- LOCAL REPLAY BASELINE ONLY.
-- Generated from the real production Supabase schema inspected on 2026-04-25.
-- These legacy tables existed remotely before local migrations were introduced.
-- Do not apply this migration to a remote Supabase project.
-- Do not run `supabase db push` for this task.
-- If committed, mark the migration as applied remotely with:
-- `supabase migration repair 20260416090000 --status applied`
-- This migration intentionally mirrors current legacy RLS policies and grants.
-- It does not improve security. It only restores local migration replayability.

begin;

-- 1. Fail-fast guard.
--    Stop immediately if public.alerts, public.push_tokens, or
--    public.app_installs already exists. Nothing else (extensions, tables,
--    indexes, policies, grants) must be created before this guard passes.
do $$
begin
  if to_regclass('public.alerts') is not null then
    raise exception 'Local replay baseline must not run because public.alerts already exists. Use migration repair for remote environments.';
  end if;

  if to_regclass('public.push_tokens') is not null then
    raise exception 'Local replay baseline must not run because public.push_tokens already exists. Use migration repair for remote environments.';
  end if;

  if to_regclass('public.app_installs') is not null then
    raise exception 'Local replay baseline must not run because public.app_installs already exists. Use migration repair for remote environments.';
  end if;
end $$;

-- 2. Extension setup.
--    Supabase keeps pgcrypto in the `extensions` schema. The default search
--    path resolves `gen_random_uuid()` through it, so column defaults stay
--    bare (no extensions.gen_random_uuid()) and local matches production.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 3. public.alerts ──────────────────────────────────────────────────────────

create table public.alerts (
  id uuid not null default gen_random_uuid(),
  push_token text not null,
  metal text not null,
  condition text not null,
  target_price numeric not null,
  currency text default 'EUR'::text,
  is_active boolean default true,
  triggered_at timestamptz,
  created_at timestamptz default now(),
  constraint alerts_pkey primary key (id),
  constraint alerts_condition_check
    check (condition = any (array['above'::text, 'below'::text])),
  constraint alerts_metal_check
    check (metal = any (array['or'::text, 'argent'::text, 'platine'::text, 'palladium'::text, 'cuivre'::text]))
);

create index idx_alerts_active
  on public.alerts using btree (is_active);

create index idx_alerts_token
  on public.alerts using btree (push_token);

alter table public.alerts enable row level security;

create policy "anon_insert_alerts"
on public.alerts
for insert
to anon
with check (true);

create policy "anon_select_alerts"
on public.alerts
for select
to anon
using (true);

create policy "anon_update_alerts"
on public.alerts
for update
to anon
using (true)
with check (true);

grant select, insert, update, delete, truncate, references, trigger
on table public.alerts to anon;

grant select, insert, update, delete, truncate, references, trigger
on table public.alerts to authenticated;

grant select, insert, update, delete, truncate, references, trigger
on table public.alerts to service_role;

-- 4. public.app_installs ────────────────────────────────────────────────────

create table public.app_installs (
  id uuid not null default gen_random_uuid(),
  device_id text not null,
  platform text,
  app_version text,
  installed_at timestamptz default now(),
  constraint app_installs_pkey primary key (id),
  constraint app_installs_device_id_key unique (device_id)
);

alter table public.app_installs enable row level security;

create policy "Allow all inserts"
on public.app_installs
for insert
to anon, authenticated
with check (true);

create policy "Allow anon select"
on public.app_installs
for select
to anon
using (true);

create policy "Allow read for authenticated"
on public.app_installs
for select
to authenticated
using (true);

grant select, insert, update, delete, truncate, references, trigger
on table public.app_installs to anon;

grant select, insert, update, delete, truncate, references, trigger
on table public.app_installs to authenticated;

grant select, insert, update, delete, truncate, references, trigger
on table public.app_installs to service_role;

-- 5. public.push_tokens ─────────────────────────────────────────────────────

create table public.push_tokens (
  id uuid not null default gen_random_uuid(),
  token text not null,
  created_at timestamptz default now(),
  constraint push_tokens_pkey primary key (id),
  constraint push_tokens_token_key unique (token)
);

alter table public.push_tokens enable row level security;

create policy "anon_upsert_tokens"
on public.push_tokens
for insert
to anon
with check (true);

create policy "anon_update_tokens"
on public.push_tokens
for update
to anon
using (true)
with check (true);

grant select, insert, update, delete, truncate, references, trigger
on table public.push_tokens to anon;

grant select, insert, update, delete, truncate, references, trigger
on table public.push_tokens to authenticated;

grant select, insert, update, delete, truncate, references, trigger
on table public.push_tokens to service_role;

commit;
