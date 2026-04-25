import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { reportError } from '@/utils/error-reporting';

import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './events';
import { getAnalyticsIdentity, isAnalyticsIdentityDisabled } from './identity';
import { sanitizeAnalyticsProperties } from './sanitizer';

// ─── Constants ───────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;
const NETWORK_TIMEOUT_MS = 5_000;
const QUEUE_MAX_EVENTS = 50;
const TRACK_EVENT_FUNCTION_PATH = '/functions/v1/track-event';

// TODO: persisted offline queue using MMKV/AsyncStorage so events survive
// process restarts. The current in-memory queue is dropped on app kill.
// TODO: batch flushes (send up to N queued events in a single request body)
// once the Edge Function supports a batch shape.
// TODO: enrich payload with network type (wifi/cellular) and first_launch flag
// when those signals become available without adding a new dependency.

// ─── Internal state ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const ANALYTICS_NETWORK_ENABLED =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY) &&
  SUPABASE_URL !== 'undefined' &&
  SUPABASE_ANON_KEY !== 'undefined' &&
  SUPABASE_URL.startsWith('https://');

const APP_VERSION = (Application.nativeApplicationVersion ?? '').slice(0, 32);

type QueuedEvent = {
  client_event_id: string;
  schema_version: number;
  event_name: AnalyticsEventName;
  properties: AnalyticsProperties;
  device_id: string;
  install_id: string;
  session_id: string;
  platform: string;
  app_version: string;
};

const queue: QueuedEvent[] = [];
let flushInFlight = false;
// Set while a flush is running. resetAnalyticsQueue() aborts it to cancel
// any in-flight network POST so no pre-wipe payload finishes its trip.
let flushAbortController: AbortController | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolvePlatform(): 'android' | 'ios' | 'web' | 'unknown' {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

function isKnownEventName(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(name);
}

async function postEvent(
  payload: QueuedEvent,
  externalSignal: AbortSignal | null,
): Promise<boolean> {
  if (!ANALYTICS_NETWORK_ENABLED) return false;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), NETWORK_TIMEOUT_MS);

  // Forward an external abort (e.g. from resetAnalyticsQueue) into the
  // request controller so the in-flight fetch is cancelled.
  const onExternalAbort = () => timeoutController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      timeoutController.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort);
    }
  }

  try {
    const response = await fetch(`${SUPABASE_URL}${TRACK_EVENT_FUNCTION_PATH}`, {
      method: 'POST',
      signal: timeoutController.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-ortrack-client': 'mobile',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // 4xx/5xx: drop the event from queue except on transient errors.
      // 429 and 5xx are transient; anything else is permanent.
      if (response.status === 429 || response.status >= 500) {
        return false;
      }
      return true;
    }

    return true;
  } catch (error) {
    reportError(error, { scope: 'analytics', action: 'post_event' });
    return false;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

async function flushQueue(): Promise<void> {
  if (flushInFlight) return;
  flushInFlight = true;
  flushAbortController = new AbortController();
  const signal = flushAbortController.signal;
  try {
    while (queue.length > 0 && !signal.aborted) {
      const next = queue[0];
      const ok = await postEvent(next, signal);
      if (signal.aborted) {
        // Reset happened mid-flight — leave the queue empty and exit.
        return;
      }
      if (!ok) {
        // Keep event at head of queue and stop trying for this flush.
        return;
      }
      queue.shift();
    }
  } finally {
    flushInFlight = false;
    flushAbortController = null;
  }
}

function enqueue(event: QueuedEvent): void {
  if (queue.length >= QUEUE_MAX_EVENTS) {
    // Drop oldest to make room for newest.
    queue.shift();
  }
  queue.push(event);
}

// Memory-only reset of the analytics queue. Drops every queued event and
// aborts the in-flight network POST (if any) so no pre-wipe payload can be
// transmitted. Note: a request whose bytes have already left the device
// cannot be unsent — abort cancels the local promise but the server may
// still receive it. This is the strongest client-side guarantee available.
export function resetAnalyticsQueue(): void {
  queue.length = 0;
  flushAbortController?.abort();
  flushAbortController = null;
  flushInFlight = false;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function trackEvent(
  eventName: AnalyticsEventName,
  properties?: AnalyticsProperties,
): Promise<void> {
  try {
    if (!isKnownEventName(eventName)) return;
    if (!ANALYTICS_NETWORK_ENABLED) return;
    if (isAnalyticsIdentityDisabled()) return;

    let identity;
    try {
      identity = await getAnalyticsIdentity();
    } catch {
      return;
    }

    const sanitized = sanitizeAnalyticsProperties(properties);

    const event: QueuedEvent = {
      client_event_id: Crypto.randomUUID(),
      schema_version: SCHEMA_VERSION,
      event_name: eventName,
      properties: sanitized,
      device_id: identity.deviceId,
      install_id: identity.installId,
      session_id: identity.sessionId,
      platform: resolvePlatform(),
      app_version: APP_VERSION,
    };

    enqueue(event);

    void flushQueue();
  } catch (error) {
    reportError(error, { scope: 'analytics', action: 'track_event' });
  }
}
