-- Transition-only migration for alert ownership.
-- This prepares owner-based data ownership but does not activate effective
-- owner security. Backend access remains transitional until authenticated
-- mobile writes and target RLS policies are deployed.
-- Target RLS policies are intentionally not enabled in this migration.
-- alerts.push_token is legacy Expo notification transport, not ownership.
-- app_installs.device_id is a legacy installation identifier, not business
-- identity and not a strong device identity.

begin;

alter table public.alerts
  add column if not exists owner_id uuid,
  add column if not exists triggered_at timestamptz;

alter table public.push_tokens
  add column if not exists owner_id uuid,
  add column if not exists revoked_at timestamptz;

alter table public.app_installs
  add column if not exists owner_id uuid;

-- NOT VALID is intentional in this transition migration. These constraints are
-- enforced for new writes but are not yet validated against historical rows.
-- Historical rows may remain non-conforming until a later migration audits and
-- cleans data, then runs VALIDATE CONSTRAINT.

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.alerts'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and a.attname = 'owner_id'
  ) then
    alter table public.alerts
      add constraint alerts_owner_id_fkey
      foreign key (owner_id)
      references auth.users(id)
      on delete cascade
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.push_tokens'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and a.attname = 'owner_id'
  ) then
    alter table public.push_tokens
      add constraint push_tokens_owner_id_fkey
      foreign key (owner_id)
      references auth.users(id)
      on delete cascade
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.app_installs'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and a.attname = 'owner_id'
  ) then
    alter table public.app_installs
      add constraint app_installs_owner_id_fkey
      foreign key (owner_id)
      references auth.users(id)
      on delete cascade
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'alerts_owner_or_legacy_push_token'
      and conrelid = 'public.alerts'::regclass
  ) then
    alter table public.alerts
      add constraint alerts_owner_or_legacy_push_token
      check (
        owner_id is not null
        or (push_token is not null and length(btrim(push_token)) > 0)
      )
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'alerts_target_price_positive'
      and conrelid = 'public.alerts'::regclass
  ) then
    alter table public.alerts
      add constraint alerts_target_price_positive
      check (target_price > 0)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'alerts_condition_supported'
      and conrelid = 'public.alerts'::regclass
  ) then
    alter table public.alerts
      add constraint alerts_condition_supported
      check (condition in ('above', 'below'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'push_tokens_token_not_blank'
      and conrelid = 'public.push_tokens'::regclass
  ) then
    alter table public.push_tokens
      add constraint push_tokens_token_not_blank
      check (token is not null and length(btrim(token)) > 0)
      not valid;
  end if;
end $$;

create index if not exists alerts_owner_active_created_idx
  on public.alerts (owner_id, is_active, created_at desc)
  where owner_id is not null;

create index if not exists alerts_legacy_push_token_active_created_idx
  on public.alerts (push_token, is_active, created_at desc)
  where owner_id is null and push_token is not null;

create index if not exists push_tokens_owner_active_idx
  on public.push_tokens (owner_id)
  where owner_id is not null and revoked_at is null;

create index if not exists app_installs_owner_idx
  on public.app_installs (owner_id)
  where owner_id is not null;

-- SECURITY DEFINER depends on the function owner. This RPC must be deployed by
-- a trusted backend role, not by a weak or ambiguous role. It is SECURITY
-- DEFINER only to keep a future RLS-safe purge bounded by auth.uid().

create or replace function public.delete_current_user_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner_id uuid := auth.uid();
  deleted_alerts integer := 0;
  deleted_push_tokens integer := 0;
  deleted_app_installs integer := 0;
begin
  if current_owner_id is null then
    raise exception 'delete_current_user_data requires an authenticated user'
      using errcode = '28000';
  end if;

  delete from public.alerts
  where owner_id = current_owner_id;
  get diagnostics deleted_alerts = row_count;

  delete from public.push_tokens
  where owner_id = current_owner_id;
  get diagnostics deleted_push_tokens = row_count;

  delete from public.app_installs
  where owner_id = current_owner_id;
  get diagnostics deleted_app_installs = row_count;

  return jsonb_build_object(
    'alerts', deleted_alerts,
    'push_tokens', deleted_push_tokens,
    'app_installs', deleted_app_installs
  );
end;
$$;

revoke all on function public.delete_current_user_data() from public;
grant execute on function public.delete_current_user_data() to authenticated;

comment on column public.alerts.owner_id is
  'Business ownership for alerts. Null rows are legacy notification-token scoped rows and are not protected by owner RLS.';

comment on column public.alerts.push_token is
  'Legacy Expo notification routing token. This is transport data, not business ownership.';

comment on column public.push_tokens.owner_id is
  'Business owner for notification routing tokens. Null rows are legacy unowned tokens.';

comment on column public.push_tokens.revoked_at is
  'Soft revocation timestamp for notification tokens. Null means eligible for routing once owner-based delivery is implemented.';

comment on column public.app_installs.device_id is
  'Legacy installation identifier. Not business identity and not a strong device identity.';

comment on function public.delete_current_user_data() is
  'Deletes only rows owned by auth.uid(). Legacy rows without owner_id are intentionally excluded and remain until a separate claim or cleanup strategy exists.';

commit;
