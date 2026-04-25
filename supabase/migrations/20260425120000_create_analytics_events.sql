-- Funnel analytics MVP.
-- Mobile clients never insert into analytics_events directly. Inserts are
-- performed by the `track-event` Edge Function using the service role.
-- Anon role has no access to either table.
--
-- TODO: when traffic grows, replace the per-device Postgres rate limit by a
-- Redis-backed sliding window or stricter Postgres counters with sharded
-- writes. The current 1-min, 60-event window is sized for early MVP traffic.

begin;

-- ─── analytics_events ──────────────────────────────────────────────────────

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null,
  schema_version integer not null default 1,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  device_id text not null,
  install_id text not null,
  session_id text not null,
  platform text not null,
  app_version text,
  created_at timestamptz not null default now(),
  constraint analytics_events_schema_version_chk
    check (schema_version >= 1 and schema_version <= 10),
  constraint analytics_events_event_name_len_chk
    check (char_length(event_name) between 1 and 80),
  constraint analytics_events_device_id_len_chk
    check (char_length(device_id) between 10 and 160),
  constraint analytics_events_install_id_len_chk
    check (char_length(install_id) between 10 and 160),
  constraint analytics_events_session_id_len_chk
    check (char_length(session_id) between 10 and 160),
  constraint analytics_events_app_version_len_chk
    check (app_version is null or char_length(app_version) <= 32),
  constraint analytics_events_platform_chk
    check (platform in ('android', 'ios', 'web', 'unknown')),
  constraint analytics_events_device_event_unique
    unique (device_id, client_event_id)
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_event_name_idx
  on public.analytics_events (event_name);

create index if not exists analytics_events_device_id_idx
  on public.analytics_events (device_id);

alter table public.analytics_events enable row level security;

-- No anon read/write. The Edge Function uses the service role, which bypasses
-- RLS. We intentionally do not declare any FOR-ALL policy for the anon role.

drop policy if exists analytics_events_anon_block_select on public.analytics_events;
drop policy if exists analytics_events_anon_block_insert on public.analytics_events;
drop policy if exists analytics_events_anon_block_update on public.analytics_events;
drop policy if exists analytics_events_anon_block_delete on public.analytics_events;

-- ─── analytics_rate_limits ─────────────────────────────────────────────────

create table if not exists public.analytics_rate_limits (
  device_id text primary key,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.analytics_rate_limits enable row level security;

drop policy if exists analytics_rate_limits_anon_block_select on public.analytics_rate_limits;
drop policy if exists analytics_rate_limits_anon_block_insert on public.analytics_rate_limits;
drop policy if exists analytics_rate_limits_anon_block_update on public.analytics_rate_limits;
drop policy if exists analytics_rate_limits_anon_block_delete on public.analytics_rate_limits;

-- ─── Rate limit function ───────────────────────────────────────────────────
-- Atomic INSERT ... ON CONFLICT DO UPDATE on the device_id primary key.
-- Returns true if the device is within its 60-events-per-minute window.

create or replace function public.check_analytics_rate_limit(p_device_id text)
returns boolean
language plpgsql
as $$
declare
  v_count integer;
  v_now timestamptz := now();
begin
  insert into public.analytics_rate_limits (device_id, window_start, count, updated_at)
  values (p_device_id, v_now, 1, v_now)
  on conflict (device_id) do update
  set
    count = case
      when public.analytics_rate_limits.window_start < v_now - interval '1 minute'
        then 1
      else public.analytics_rate_limits.count + 1
    end,
    window_start = case
      when public.analytics_rate_limits.window_start < v_now - interval '1 minute'
        then v_now
      else public.analytics_rate_limits.window_start
    end,
    updated_at = v_now
  returning count into v_count;

  return v_count <= 60;
end;
$$;

revoke all on function public.check_analytics_rate_limit(text) from public;
revoke all on function public.check_analytics_rate_limit(text) from anon;
revoke all on function public.check_analytics_rate_limit(text) from authenticated;
-- The track-event Edge Function uses the service role to call this RPC. The
-- broad revokes above strip the default `public` execute privilege, so the
-- service role must be granted execute explicitly or the RPC fails with
-- "permission denied for function check_analytics_rate_limit".
grant execute on function public.check_analytics_rate_limit(text) to service_role;

commit;
