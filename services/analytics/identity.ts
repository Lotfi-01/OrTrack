import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  ANALYTICS_DEVICE_SECURE_STORE_KEY,
  STORAGE_KEYS,
} from '@/constants/storage-keys';
import { reportError } from '@/utils/error-reporting';

// In-memory caches: avoid hitting SecureStore / AsyncStorage on every event.
let cachedDeviceId: string | null = null;
let cachedInstallId: string | null = null;
let cachedSessionId: string | null = null;

let identityDisabled = false;

// Re-export for callers that need the physical SecureStore key — notably the
// local-wipe routine. Keeping a single shared constant keeps writes and the
// wipe-time delete in lock-step.
export { ANALYTICS_DEVICE_SECURE_STORE_KEY };

// TODO: 30-minute background inactivity session reset. We currently keep the
// same sessionId for the entire app runtime. When AppState transitions to
// 'background' for >= 30 minutes we should generate a fresh sessionId on the
// next foreground transition. Track elapsed background time at the AppState
// listener level (not here) once a global app-state hook exists.
function generateUuid(): string {
  return Crypto.randomUUID();
}

async function loadOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ANALYTICS_DEVICE_SECURE_STORE_KEY);
  if (existing && existing.length > 0) return existing;

  const generated = generateUuid();
  await SecureStore.setItemAsync(ANALYTICS_DEVICE_SECURE_STORE_KEY, generated);
  return generated;
}

async function loadOrCreateInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEYS.analyticsInstallId);
  if (existing && existing.length > 0) return existing;

  const generated = generateUuid();
  await AsyncStorage.setItem(STORAGE_KEYS.analyticsInstallId, generated);
  return generated;
}

export type AnalyticsIdentity = {
  deviceId: string;
  installId: string;
  sessionId: string;
};

export async function getAnalyticsIdentity(): Promise<AnalyticsIdentity> {
  if (identityDisabled) {
    throw new Error('analytics_identity_disabled');
  }

  try {
    if (!cachedDeviceId) {
      cachedDeviceId = await loadOrCreateDeviceId();
    }
    if (!cachedInstallId) {
      cachedInstallId = await loadOrCreateInstallId();
    }
    if (!cachedSessionId) {
      cachedSessionId = generateUuid();
    }

    return {
      deviceId: cachedDeviceId,
      installId: cachedInstallId,
      sessionId: cachedSessionId,
    };
  } catch (error) {
    identityDisabled = true;
    reportError(error, { scope: 'analytics', action: 'identity_init' });
    throw error;
  }
}

export function isAnalyticsIdentityDisabled(): boolean {
  return identityDisabled;
}

// Memory-only reset. Does NOT touch SecureStore or AsyncStorage — callers
// (e.g. the local-wipe routine) are responsible for deleting persisted
// identifiers separately. After this call, the next getAnalyticsIdentity()
// invocation will re-read SecureStore / AsyncStorage and, finding nothing,
// generate a fresh device id, install id, and session id.
export function resetAnalyticsIdentityCache(): void {
  cachedDeviceId = null;
  cachedInstallId = null;
  cachedSessionId = null;
  identityDisabled = false;
}
