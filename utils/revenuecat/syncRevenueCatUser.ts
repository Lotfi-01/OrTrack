import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

import { ensureSupabaseAuthUser } from '@/utils/auth/ensureSupabaseAuthUser';
import { initRevenueCat } from '@/services/revenuecat';

// RP1.2 — Aligne RevenueCat sur l'`auth.uid()` Supabase.
//
// Comportement attendu (cf. spec RP1.2) :
//   - appeler une seule fois au boot ;
//   - si RevenueCat est déjà aligné sur `auth.uid()` → ne pas appeler logIn ;
//   - sinon → `Purchases.logIn(auth.uid())` une seule fois ;
//   - ne jamais hardcoder Premium ;
//   - ne pas bloquer l'app en cas d'échec ;
//   - garder le platform check Android-only existant côté `services/revenuecat`.
//
// Le garde `boundOnce` empêche les appels multiples au sein d'un même
// process : un useEffect monté plusieurs fois (HMR, double-mount strict
// mode) ne ré-appelle pas `Purchases.logIn`. Le module garde aussi
// l'identifiant déjà aligné en cache pour court-circuiter les appels
// suivants même si le caller ré-invoque la fonction.

let boundOnce = false;
let lastBoundUserId: string | null = null;
let inflight: Promise<void> | null = null;

export class RevenueCatSyncError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RevenueCatSyncError';
    this.cause = cause;
  }
}

/**
 * Pour les tests uniquement : remet à zéro l'état module.
 * Ne pas appeler en runtime.
 */
export function __resetRevenueCatSyncStateForTests(): void {
  boundOnce = false;
  lastBoundUserId = null;
  inflight = null;
}

/**
 * Aligne l'App User ID RevenueCat sur l'`auth.uid()` Supabase.
 *
 * Idempotent : un appel concurrent réutilise la promesse en cours, et un
 * appel après alignement est un no-op tant que `auth.uid()` ne change pas.
 *
 * En cas d'échec :
 *   - log court (pas de PII, pas de secret) ;
 *   - lève `RevenueCatSyncError` pour permettre au caller d'observer ;
 *   - ne hardcode jamais Premium ;
 *   - laisse l'Edge Function gérer la décision finale d'accès.
 */
export async function syncRevenueCatWithSupabaseUser(): Promise<void> {
  if (inflight) return inflight;
  if (boundOnce && lastBoundUserId) {
    // Sync déjà fait au boot ; pas de re-logIn.
    return;
  }

  inflight = (async () => {
    try {
      const user = await ensureSupabaseAuthUser();

      // Plateformes non supportées par le SDK Purchases : on laisse le
      // gating au serveur. Pas d'appel RevenueCat sur iOS/web RP1.2.
      if (Platform.OS !== 'android') {
        boundOnce = true;
        lastBoundUserId = user.id;
        return;
      }

      await initRevenueCat();

      const customerInfo = await Purchases.getCustomerInfo();
      const currentRevenueCatUserId = customerInfo.originalAppUserId;

      if (currentRevenueCatUserId !== user.id) {
        await Purchases.logIn(user.id);
      }

      boundOnce = true;
      lastBoundUserId = user.id;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[radar-prime] revenuecat_sync_failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
      throw new RevenueCatSyncError('sync_failed', err);
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
