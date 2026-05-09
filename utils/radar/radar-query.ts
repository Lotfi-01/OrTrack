import { supabase } from '@/lib/supabase';
import { DataQuality, RadarMetal, RadarProduct, RadarSignal } from './types';

// RP1.1 — Le mobile n'accède plus jamais directement à `prime_daily`.
// Toute la donnée Premium passe par l'Edge Function `radar-prime` qui
// vérifie l'authentification et l'entitlement Premium côté serveur, puis
// renvoie un payload agrégé. `dealer_name` et observations brutes ne sont
// jamais envoyés au client.
//
// Format Edge Function (version 1) :
//   {
//     version: 1,
//     snapshotDate: 'YYYY-MM-DD' | null,
//     products: [{ slug, label, metal, category, medianPremiumPct,
//                  p25PremiumPct, p75PremiumPct, observationsCount,
//                  freshnessDays, status, confidenceLevel }]
//   }

export type RadarPrimeFetchError =
  | { kind: 'unauthorized' }
  | { kind: 'premium_required' }
  | { kind: 'unsupported_version' }
  | { kind: 'invalid_payload' }
  | { kind: 'server_error'; message: string };

export class RadarPrimeError extends Error {
  readonly detail: RadarPrimeFetchError;
  constructor(detail: RadarPrimeFetchError) {
    super(detail.kind);
    this.name = 'RadarPrimeError';
    this.detail = detail;
  }
}

interface RadarPrimeSnapshotsResult {
  products: RadarProduct[];
  latestDate: string | null;
}

interface EdgeFunctionProduct {
  slug: unknown;
  label: unknown;
  metal: unknown;
  category: unknown;
  medianPremiumPct: unknown;
  p25PremiumPct: unknown;
  p75PremiumPct: unknown;
  observationsCount: unknown;
  freshnessDays: unknown;
  status: unknown;
  confidenceLevel: unknown;
}

interface EdgeFunctionPayload {
  version: unknown;
  snapshotDate: unknown;
  products: unknown;
}

const SUPPORTED_STATUSES = new Set([
  'low',
  'normal',
  'high',
  'stale',
  'insufficient_data',
]);

function statusToSignal(status: string): RadarSignal | null {
  if (status === 'low' || status === 'normal' || status === 'high') return status;
  return null;
}

function statusToDataQuality(status: string): DataQuality {
  if (status === 'low' || status === 'normal' || status === 'high') return 'ok';
  if (status === 'stale') return 'stale';
  if (status === 'insufficient_data') return 'insufficient_history';
  return 'missing';
}

function categoryToInternal(category: string): 'piece' | 'lingot' | null {
  if (category === 'coin') return 'piece';
  if (category === 'bar') return 'lingot';
  return null;
}

function metalToInternal(metal: string): RadarMetal | null {
  if (metal === 'gold') return 'gold';
  return null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function mapProduct(raw: EdgeFunctionProduct): RadarProduct | null {
  if (!isNonEmptyString(raw.slug)) return null;
  if (!isNonEmptyString(raw.label)) return null;
  if (!isNonEmptyString(raw.metal)) return null;
  if (!isNonEmptyString(raw.category)) return null;
  if (!isNonEmptyString(raw.status)) return null;
  if (!SUPPORTED_STATUSES.has(raw.status)) return null;

  const metal = metalToInternal(raw.metal);
  const category = categoryToInternal(raw.category);
  if (!metal || !category) return null;

  const median = isFiniteNumber(raw.medianPremiumPct) ? raw.medianPremiumPct : null;
  const p25 = isFiniteNumber(raw.p25PremiumPct) ? raw.p25PremiumPct : null;
  const p75 = isFiniteNumber(raw.p75PremiumPct) ? raw.p75PremiumPct : null;

  // Pour les statuts non-données (`stale`, `insufficient_data`), aucune
  // valeur ne doit s'afficher.
  const isDataStatus = raw.status === 'low' || raw.status === 'normal' || raw.status === 'high';

  return {
    productId: raw.slug,
    label: raw.label,
    metal,
    category,
    currentPrimePct: isDataStatus ? median : null,
    avgPrimePct: isDataStatus ? median : null,
    minPrimePct: isDataStatus ? p25 : null,
    maxPrimePct: isDataStatus ? p75 : null,
    percentile: null,
    signal: statusToSignal(raw.status),
    dataQuality: statusToDataQuality(raw.status),
    history: null,
  };
}

function parsePayload(payload: unknown): RadarPrimeSnapshotsResult {
  if (!payload || typeof payload !== 'object') {
    throw new RadarPrimeError({ kind: 'invalid_payload' });
  }
  const obj = payload as EdgeFunctionPayload;
  if (obj.version !== 1) {
    throw new RadarPrimeError({ kind: 'unsupported_version' });
  }
  const latestDate = isNonEmptyString(obj.snapshotDate) ? obj.snapshotDate : null;
  if (!Array.isArray(obj.products)) {
    throw new RadarPrimeError({ kind: 'invalid_payload' });
  }
  const products: RadarProduct[] = [];
  for (const raw of obj.products) {
    if (!raw || typeof raw !== 'object') continue;
    const mapped = mapProduct(raw as EdgeFunctionProduct);
    if (mapped) products.push(mapped);
  }
  return { products, latestDate };
}

/**
 * Récupère les snapshots Radar Prime depuis l'Edge Function.
 *
 * À n'appeler que côté Premium client confirmé. La validation finale reste
 * faite serveur ; en cas de Free/inconnu, l'Edge Function répond 403 et
 * cette fonction lève une `RadarPrimeError({ kind: 'premium_required' })`.
 *
 * Pas de fallback. Pas de cache. Le caller est responsable de la mise en
 * cache et du gating client.
 */
export async function fetchRadarPrimeSnapshots(): Promise<RadarPrimeSnapshotsResult> {
  if (!supabase) {
    throw new RadarPrimeError({ kind: 'server_error', message: 'Supabase client not initialized' });
  }

  const { data, error } = await supabase.functions.invoke('radar-prime', {
    method: 'POST',
  });

  if (error) {
    // FunctionsHttpError expose le statut via `context.status` (selon version).
    // On lit aussi `data?.error` quand renvoyé par l'Edge Function en JSON.
    const status = (error as unknown as { context?: { status?: number } }).context?.status;
    const code = (data as { error?: unknown } | null | undefined)?.error;
    if (status === 401 || code === 'unauthorized') {
      throw new RadarPrimeError({ kind: 'unauthorized' });
    }
    if (status === 403 || code === 'premium_required') {
      throw new RadarPrimeError({ kind: 'premium_required' });
    }
    throw new RadarPrimeError({
      kind: 'server_error',
      message: error.message ?? 'unknown_error',
    });
  }

  return parsePayload(data);
}
