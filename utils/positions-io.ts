import { normalizePersistedPosition } from '@/hooks/use-positions';
import type { Position } from '@/types/position';

export const EXPORT_SCHEMA_VERSION = 1;
export const EXPORT_APP_NAME = 'OrTrack';

// Shape currently persisted in AsyncStorage under @ortrack:settings.
// Kept deliberately narrow : only fields the user would want to carry
// across a fresh install. Device-scoped flags (biometric, privacy,
// onboarding, push token) are NEVER exported.
export type ExportableSettings = {
  currency: 'EUR' | 'USD' | 'CHF';
  notifPriceAlert: boolean;
  notifDailyVariation: boolean;
  notifWeeklyReport: boolean;
};

export type ExportPayloadV1 = {
  app: typeof EXPORT_APP_NAME;
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  positions: Position[];
  settings?: ExportableSettings;
};

export type ImportResult = {
  // Accepted positions, already normalized and filtered.
  positions: Position[];
  // Number of entries that failed validation (present in the file but rejected).
  rejected: number;
  // Total entries seen in the positions array (accepted + rejected).
  total: number;
  // Detected payload version. 'v1' = wrapped object, 'v0' = bare array.
  version: 'v0' | 'v1';
  // Settings extracted from a v1 payload, validated. Absent for v0.
  settings?: ExportableSettings;
};

export type ImportError =
  | { kind: 'invalid_json' }
  | { kind: 'unrecognized_shape' }
  | { kind: 'no_valid_position' };

// ── Export ────────────────────────────────────────────────────────────────

/**
 * Builds a sanitized, versioned export payload from in-memory data.
 *
 * - Positions are normalized through the same compatibility path as storage. Corrupt entries are
 *   silently dropped: an export must never propagate invalid data.
 * - Settings are optional. When present, they are type-checked and only
 *   the known fields are carried. Unknown or malformed settings are
 *   dropped rather than exported verbatim.
 * - exportedAt uses ISO 8601 UTC.
 */
export function exportPayload(
  positions: Position[],
  settings?: unknown,
): ExportPayloadV1 {
  const sanitizedPositions = positions
    .map(normalizePersistedPosition)
    .filter((p): p is Position => p !== null);
  const sanitizedSettings = validateExportableSettings(settings);
  const payload: ExportPayloadV1 = {
    app: EXPORT_APP_NAME,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    positions: sanitizedPositions,
  };
  if (sanitizedSettings) payload.settings = sanitizedSettings;
  return payload;
}

/** Serialize the payload to a JSON string suitable for Share / file write. */
export function serializeExportPayload(payload: ExportPayloadV1): string {
  return JSON.stringify(payload, null, 2);
}

// ── Import ────────────────────────────────────────────────────────────────

/**
 * Parses an external JSON blob into a validated ImportResult.
 *
 * Accepted inputs:
 *   - v1 wrapper: `{ app, schemaVersion, positions: [...], settings? }`
 *   - v0 legacy: a bare array `[ {...}, {...} ]` produced by older exports
 *
 * Validation semantics:
 *   - Each entry in the positions array passes through storage-compatible normalization.
 *     Accepted entries are counted; others increment `rejected`.
 *   - If zero valid positions remain, returns `no_valid_position` error
 *     so the caller can refuse the import.
 *   - Settings are optional, type-checked, and only returned for v1.
 *   - Unknown fields on the wrapper are ignored silently.
 */
export function parseImportPayload(
  raw: string,
): { ok: true; result: ImportResult } | { ok: false; error: ImportError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: { kind: 'invalid_json' } };
  }

  let rawPositions: unknown[];
  let version: 'v0' | 'v1';
  let rawSettings: unknown = undefined;

  if (Array.isArray(parsed)) {
    rawPositions = parsed;
    version = 'v0';
  } else if (
    parsed !== null &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as Record<string, unknown>).positions)
  ) {
    const obj = parsed as Record<string, unknown>;
    rawPositions = obj.positions as unknown[];
    version = 'v1';
    rawSettings = obj.settings;
  } else {
    return { ok: false, error: { kind: 'unrecognized_shape' } };
  }

  const accepted: Position[] = [];
  let rejected = 0;
  for (const entry of rawPositions) {
    const normalized = normalizePersistedPosition(entry);
    if (normalized) {
      accepted.push(normalized);
    } else {
      rejected++;
    }
  }

  if (accepted.length === 0) {
    return { ok: false, error: { kind: 'no_valid_position' } };
  }

  const settings = version === 'v1' ? validateExportableSettings(rawSettings) : undefined;

  const result: ImportResult = {
    positions: accepted,
    rejected,
    total: rawPositions.length,
    version,
  };
  if (settings) result.settings = settings;

  return { ok: true, result };
}

// ── Settings validator (local, narrow) ────────────────────────────────────

function validateExportableSettings(input: unknown): ExportableSettings | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const o = input as Record<string, unknown>;
  const currency = o.currency;
  if (currency !== 'EUR' && currency !== 'USD' && currency !== 'CHF') return undefined;
  if (typeof o.notifPriceAlert !== 'boolean') return undefined;
  if (typeof o.notifDailyVariation !== 'boolean') return undefined;
  if (typeof o.notifWeeklyReport !== 'boolean') return undefined;
  return {
    currency,
    notifPriceAlert: o.notifPriceAlert,
    notifDailyVariation: o.notifDailyVariation,
    notifWeeklyReport: o.notifWeeklyReport,
  };
}
