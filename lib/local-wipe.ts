import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  STORAGE_KEYS,
  WIPE_SECURE_STORAGE_KEYS,
  WIPE_STORAGE_KEYS,
} from '@/constants/storage-keys';
import { awaitPendingPositionWrites, resetPositionsCache } from '@/hooks/use-positions';
import {
  resetAnalyticsIdentityCache,
  resetAnalyticsQueue,
} from '@/services/analytics';

// Single source of truth for the local "Supprimer mes données locales" flow.
// Both the Réglages screen and the wipe contract test invoke this routine
// so they cannot drift apart.
//
// Order is intentional:
//   1. drain in-flight position writes so a stale setItem cannot resurrect a
//      key after multiRemove
//   2. multiRemove every AsyncStorage-backed key + dynamic history caches
//   3. delete every SecureStore-backed key
//   4. reset analytics in-memory state (queue + identity cache) so no
//      pre-wipe IDs or queued events leak across the boundary
//   5. drop the positions in-memory cache so the next render starts clean
//
// Errors are not swallowed: any rejection bubbles up to the caller, which
// is responsible for telemetry and user feedback.
export async function runLocalDataWipe(): Promise<void> {
  await awaitPendingPositionWrites();

  const allKeys = await AsyncStorage.getAllKeys();
  const dynamicKeys = allKeys.filter(key =>
    key.startsWith(STORAGE_KEYS.historyCachePrefix),
  );

  await AsyncStorage.multiRemove([...WIPE_STORAGE_KEYS, ...dynamicKeys]);

  await Promise.all(
    WIPE_SECURE_STORAGE_KEYS.map(key => SecureStore.deleteItemAsync(key)),
  );

  resetAnalyticsQueue();
  resetAnalyticsIdentityCache();
  resetPositionsCache();
}
