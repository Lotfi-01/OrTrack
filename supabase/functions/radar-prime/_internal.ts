// RP1.2 — logique pure utilisée par l'Edge Function radar-prime.
//
// Ce module contient :
//   - le parsing du payload RevenueCat REST API ;
//   - la stratégie de cache in-memory.
//
// Il est extrait pour être testable hors Deno via Jest. Il n'a aucune
// dépendance Deno ni Supabase. Toute évolution du parsing doit rester
// compatible avec ce contrat.

export type PremiumStatus = 'premium' | 'free' | 'unknown';

export const ENTITLEMENT_NAME = 'premium';
export const ENTITLEMENT_CACHE_TTL_MS = 60_000;
export const REVENUECAT_TIMEOUT_MS = 5_000;

interface RevenueCatEntitlement {
  expires_date?: string | null;
  product_identifier?: string;
}

interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatEntitlement>;
}

interface RevenueCatBody {
  subscriber?: RevenueCatSubscriber;
}

/**
 * Détermine le statut Premium à partir d'un payload RevenueCat REST API.
 *
 * Règles fail-closed (cf. spec RP1.2) :
 *   - payload manquant ou invalide → 'unknown'
 *   - entitlement absent → 'free'
 *   - entitlement expiré (`expires_date < now`) → 'free'
 *   - entitlement présent et non-expiré (ou lifetime, `expires_date` null) → 'premium'
 *
 * `nowMs` est passé en paramètre pour rester pure et testable.
 */
export function parseRevenueCatEntitlement(
  body: unknown,
  nowMs: number,
  entitlementName: string = ENTITLEMENT_NAME,
): PremiumStatus {
  if (!body || typeof body !== 'object') return 'unknown';
  const sub = (body as RevenueCatBody).subscriber;
  if (!sub || typeof sub !== 'object') return 'unknown';

  const ents = sub.entitlements;
  if (ents === undefined || ents === null) return 'unknown';
  if (typeof ents !== 'object' || Array.isArray(ents)) return 'unknown';

  const ent = (ents as Record<string, unknown>)[entitlementName];
  if (!ent || typeof ent !== 'object') return 'free';

  const expires = (ent as RevenueCatEntitlement).expires_date;
  if (expires === null || expires === undefined) {
    // Lifetime / non-expiring entitlement.
    return 'premium';
  }
  if (typeof expires !== 'string') return 'unknown';

  const expiresMs = Date.parse(expires);
  if (!Number.isFinite(expiresMs)) return 'unknown';
  if (expiresMs <= nowMs) return 'free';
  return 'premium';
}

// ─── Cache simple in-memory ─────────────────────────────────────────────────

interface CacheEntry {
  status: 'premium' | 'free';
  expiresAt: number;
}

export interface EntitlementCache {
  get(userId: string, nowMs: number): 'premium' | 'free' | null;
  set(userId: string, status: 'premium' | 'free', nowMs: number): void;
  clear(): void;
}

export function createEntitlementCache(
  ttlMs: number = ENTITLEMENT_CACHE_TTL_MS,
): EntitlementCache {
  const store = new Map<string, CacheEntry>();
  return {
    get(userId: string, nowMs: number): 'premium' | 'free' | null {
      const entry = store.get(userId);
      if (!entry) return null;
      if (entry.expiresAt <= nowMs) {
        store.delete(userId);
        return null;
      }
      return entry.status;
    },
    set(userId: string, status: 'premium' | 'free', nowMs: number): void {
      store.set(userId, { status, expiresAt: nowMs + ttlMs });
    },
    clear(): void {
      store.clear();
    },
  };
}
