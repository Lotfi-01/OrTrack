-- RP1.1 — Radar Prime data layer.
-- Crée les 4 tables `rp_*` qui remplacent l'accès mobile direct à `prime_daily`.
-- RLS activée sur les 4 tables. Aucune policy `anon` ni `authenticated` n'est
-- créée : la lecture mobile passe exclusivement par l'Edge Function
-- `radar-prime` (qui utilise un client `service_role` côté serveur).
--
-- Cette migration NE touche PAS `prime_daily` — le mobile cesse simplement
-- de l'utiliser dans ce lot. Sa RLS de production reste à vérifier
-- manuellement dans Supabase Studio.
--
-- Local replay only. Ne jamais lancer `supabase db push` dans ce lot.

begin;

-- ── 1. Fail-fast guard ─────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.rp_products') is not null then
    raise exception 'public.rp_products already exists. Use migration repair for remote environments.';
  end if;
  if to_regclass('public.rp_import_batches') is not null then
    raise exception 'public.rp_import_batches already exists. Use migration repair for remote environments.';
  end if;
  if to_regclass('public.rp_prime_observations') is not null then
    raise exception 'public.rp_prime_observations already exists. Use migration repair for remote environments.';
  end if;
  if to_regclass('public.rp_prime_snapshots') is not null then
    raise exception 'public.rp_prime_snapshots already exists. Use migration repair for remote environments.';
  end if;
end $$;

-- ── 2. Extensions ──────────────────────────────────────────────────────────
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ── 3. rp_products ─────────────────────────────────────────────────────────
create table public.rp_products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  label           text not null,
  metal           text not null,
  category        text not null,
  fine_weight_g   numeric(12, 6) not null,
  country_scope   text not null default 'FR',
  display_order   integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint rp_products_metal_chk         check (metal = 'gold'),
  constraint rp_products_category_chk      check (category in ('coin', 'bar')),
  constraint rp_products_country_scope_chk check (country_scope = 'FR'),
  constraint rp_products_fine_weight_chk   check (fine_weight_g > 0)
);

create index rp_products_active_order_idx on public.rp_products (active, display_order);
create index rp_products_metal_category_idx on public.rp_products (metal, category);

comment on table public.rp_products is
  'Référentiel des produits Radar Prime suivis. Lecture exclusivement via Edge Function radar-prime.';

-- ── 4. rp_import_batches ───────────────────────────────────────────────────
create table public.rp_import_batches (
  id                    uuid primary key default gen_random_uuid(),
  imported_at           timestamptz not null default now(),
  imported_by           uuid,
  source_type           text not null,
  status                text not null,
  row_count             integer not null default 0,
  errors_json           jsonb not null default '[]'::jsonb,
  methodology_version   integer not null default 1,
  constraint rp_import_batches_source_type_chk check (source_type in ('manual_csv')),
  constraint rp_import_batches_status_chk      check (status in ('draft', 'validated', 'rejected', 'published')),
  constraint rp_import_batches_row_count_chk   check (row_count >= 0),
  constraint rp_import_batches_methodology_chk check (methodology_version >= 1)
);

create index rp_import_batches_imported_at_idx on public.rp_import_batches (imported_at desc);
create index rp_import_batches_status_idx on public.rp_import_batches (status);

comment on table public.rp_import_batches is
  'Traçabilité des imports Radar Prime. Réservé staff/service_role. Jamais exposé au mobile.';

-- ── 5. rp_prime_observations ───────────────────────────────────────────────
create table public.rp_prime_observations (
  id                   uuid primary key default gen_random_uuid(),
  batch_id             uuid not null references public.rp_import_batches(id) on delete restrict,
  product_id           uuid not null references public.rp_products(id) on delete restrict,
  observed_at          date not null,
  dealer_name          text not null,
  observed_price_eur   numeric(14, 2) not null,
  spot_eur_per_oz      numeric(14, 4) not null,
  melt_value_eur       numeric(14, 2) not null,
  premium_pct          numeric(8, 4) not null,
  quality_flags        jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  constraint rp_prime_observations_observed_price_chk check (observed_price_eur > 0),
  constraint rp_prime_observations_spot_chk           check (spot_eur_per_oz > 0),
  constraint rp_prime_observations_melt_chk           check (melt_value_eur > 0),
  constraint rp_prime_observations_premium_pct_chk    check (premium_pct > -50 and premium_pct < 200),
  constraint rp_prime_observations_uniq               unique (batch_id, product_id, observed_at, dealer_name)
);

create index rp_prime_observations_product_observed_idx
  on public.rp_prime_observations (product_id, observed_at desc);
create index rp_prime_observations_batch_idx
  on public.rp_prime_observations (batch_id);

comment on table public.rp_prime_observations is
  'Internal Radar Prime observations. Never exposed directly to mobile clients.';
comment on column public.rp_prime_observations.dealer_name is
  'Nom du revendeur. Strictement interne. Jamais retourné au client mobile.';

-- ── 6. rp_prime_snapshots ──────────────────────────────────────────────────
create table public.rp_prime_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references public.rp_products(id) on delete restrict,
  snapshot_date         date not null,
  median_premium_pct    numeric(8, 4) not null,
  p25_premium_pct       numeric(8, 4) not null,
  p75_premium_pct       numeric(8, 4) not null,
  observations_count    integer not null,
  freshness_days        integer not null,
  dispersion_iqr_pct    numeric(8, 4),
  status                text not null,
  confidence_level      text not null,
  created_at            timestamptz not null default now(),
  constraint rp_prime_snapshots_observations_chk check (observations_count >= 0),
  constraint rp_prime_snapshots_freshness_chk    check (freshness_days >= 0),
  constraint rp_prime_snapshots_status_chk
    check (status in ('low', 'normal', 'high', 'stale', 'insufficient_data')),
  constraint rp_prime_snapshots_confidence_chk
    check (confidence_level in ('low', 'medium', 'high')),
  constraint rp_prime_snapshots_uniq unique (product_id, snapshot_date)
);

create index rp_prime_snapshots_date_idx
  on public.rp_prime_snapshots (snapshot_date desc);
create index rp_prime_snapshots_product_date_idx
  on public.rp_prime_snapshots (product_id, snapshot_date desc);

comment on table public.rp_prime_snapshots is
  'Aggregated Radar Prime premium snapshots served through Edge Function only.';

-- ── 7. RLS activée sans aucune policy publique ─────────────────────────────
-- Aucune policy n'est créée pour `anon` ni `authenticated`. Les tables
-- restent inaccessibles via PostgREST côté client. La lecture mobile passe
-- exclusivement par la fonction `radar-prime` (service_role).
alter table public.rp_products            enable row level security;
alter table public.rp_import_batches      enable row level security;
alter table public.rp_prime_observations  enable row level security;
alter table public.rp_prime_snapshots     enable row level security;

-- Aucun GRANT large vers `anon` ni `authenticated`. Le service_role bypass
-- naturellement RLS dans Supabase pour les Edge Functions.

commit;
