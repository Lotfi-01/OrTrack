// positions-io depends on isValidPosition from hooks/use-positions, which
// imports AsyncStorage at module load. Mock it so the test does not hit the
// native bridge — the AsyncStorage API is never actually called in these
// tests, only the pure validator is reached.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  getAllKeys: jest.fn(async () => []),
  multiRemove: jest.fn(async () => undefined),
  clear: jest.fn(async () => undefined),
}));

import {
  EXPORT_APP_NAME,
  EXPORT_SCHEMA_VERSION,
  exportPayload,
  parseImportPayload,
  serializeExportPayload,
} from '../positions-io';
import type { Position } from '@/types/position';

function makePos(overrides: Partial<Position> = {}): Position {
  return {
    id: overrides.id ?? 'p1',
    metal: overrides.metal ?? 'or',
    product: overrides.product ?? 'Napoléon 20F',
    weightG: overrides.weightG ?? 5.81,
    quantity: overrides.quantity ?? 1,
    purchasePrice: overrides.purchasePrice ?? 500,
    purchaseDate: overrides.purchaseDate ?? '01/01/2020',
    createdAt: overrides.createdAt ?? '2020-01-01T00:00:00.000Z',
    note: overrides.note,
    spotAtPurchase: overrides.spotAtPurchase,
    primeAtPurchase: overrides.primeAtPurchase,
    spotSource: overrides.spotSource,
    productId: overrides.productId,
  };
}

const VALID_SETTINGS = {
  currency: 'EUR' as const,
  notifPriceAlert: false,
  notifDailyVariation: false,
  notifWeeklyReport: true,
};

// ── exportPayload ──────────────────────────────────────────────────────────

describe('exportPayload', () => {
  test('builds a v1 wrapper with app, schemaVersion, ISO exportedAt, positions', () => {
    const payload = exportPayload([makePos()]);
    expect(payload.app).toBe(EXPORT_APP_NAME);
    expect(payload.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(payload.positions).toHaveLength(1);
    expect(payload.settings).toBeUndefined();
  });

  test('excludes settings when not provided', () => {
    const payload = exportPayload([makePos()]);
    expect('settings' in payload).toBe(false);
  });

  test('includes settings when valid', () => {
    const payload = exportPayload([makePos()], VALID_SETTINGS);
    expect(payload.settings).toEqual(VALID_SETTINGS);
  });

  test('drops settings when malformed', () => {
    const payload = exportPayload([makePos()], { currency: 'JPY', foo: 42 });
    expect(payload.settings).toBeUndefined();
  });

  test('drops settings when notifPriceAlert is not a boolean', () => {
    const payload = exportPayload([makePos()], {
      ...VALID_SETTINGS,
      notifPriceAlert: 'yes',
    });
    expect(payload.settings).toBeUndefined();
  });

  test('filters invalid positions silently (sanitized export)', () => {
    const valid = makePos({ id: 'ok' });
    const invalid = { id: 'bad', metal: 'unobtanium' };
    const payload = exportPayload([valid, invalid as unknown as Position]);
    expect(payload.positions).toHaveLength(1);
    expect(payload.positions[0].id).toBe('ok');
  });

  test('produces an empty positions array for empty input', () => {
    const payload = exportPayload([]);
    expect(payload.positions).toEqual([]);
  });
});

// ── serializeExportPayload ────────────────────────────────────────────────

describe('serializeExportPayload', () => {
  test('is valid JSON round-trippable', () => {
    const payload = exportPayload([makePos()], VALID_SETTINGS);
    const str = serializeExportPayload(payload);
    expect(() => JSON.parse(str)).not.toThrow();
    const back = JSON.parse(str);
    expect(back.app).toBe(EXPORT_APP_NAME);
    expect(back.positions[0].id).toBe('p1');
  });
});

// ── parseImportPayload ────────────────────────────────────────────────────

describe('parseImportPayload — v1 wrapper', () => {
  test('accepts a freshly exported payload', () => {
    const payload = exportPayload([makePos({ id: 'a' }), makePos({ id: 'b' })]);
    const res = parseImportPayload(serializeExportPayload(payload));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.version).toBe('v1');
    expect(res.result.positions).toHaveLength(2);
    expect(res.result.rejected).toBe(0);
    expect(res.result.total).toBe(2);
  });

  test('carries settings when valid', () => {
    const payload = exportPayload([makePos()], VALID_SETTINGS);
    const res = parseImportPayload(serializeExportPayload(payload));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.settings).toEqual(VALID_SETTINGS);
  });

  test('omits settings when payload has none', () => {
    const payload = exportPayload([makePos()]);
    const res = parseImportPayload(serializeExportPayload(payload));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.settings).toBeUndefined();
  });

  test('drops malformed settings silently but keeps positions', () => {
    const wrapper = {
      app: 'OrTrack',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      positions: [makePos()],
      settings: { currency: 'JPY', notifPriceAlert: 'nope' },
    };
    const res = parseImportPayload(JSON.stringify(wrapper));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.positions).toHaveLength(1);
    expect(res.result.settings).toBeUndefined();
  });

  test('counts rejected entries mixed with valid ones', () => {
    const wrapper = {
      app: 'OrTrack',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      positions: [
        makePos({ id: 'a' }),
        { id: 'bad1', metal: 'unobtanium' },
        makePos({ id: 'b' }),
        { foo: 'not-a-position' },
      ],
    };
    const res = parseImportPayload(JSON.stringify(wrapper));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.positions.map(p => p.id)).toEqual(['a', 'b']);
    expect(res.result.rejected).toBe(2);
    expect(res.result.total).toBe(4);
  });

  test('ignores unknown top-level fields', () => {
    const wrapper = {
      app: 'OrTrack',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      positions: [makePos()],
      extra: 'ignored',
      nested: { bar: 1 },
    };
    const res = parseImportPayload(JSON.stringify(wrapper));
    expect(res.ok).toBe(true);
  });
});

describe('parseImportPayload — v0 legacy array', () => {
  test('accepts a bare array of positions', () => {
    const res = parseImportPayload(JSON.stringify([makePos({ id: 'a' })]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.version).toBe('v0');
    expect(res.result.positions).toHaveLength(1);
    expect(res.result.settings).toBeUndefined();
  });

  test('filters invalid entries in a v0 array', () => {
    const res = parseImportPayload(
      JSON.stringify([makePos({ id: 'a' }), { bogus: true }, makePos({ id: 'b' })]),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.positions).toHaveLength(2);
    expect(res.result.rejected).toBe(1);
    expect(res.result.total).toBe(3);
  });

  test('never returns settings for v0', () => {
    const res = parseImportPayload(JSON.stringify([makePos()]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.settings).toBeUndefined();
  });

  test('normalizes a plausible legacy position without metal like storage read', () => {
    const { metal, ...legacy } = makePos({ product: 'Napoléon 20F' });
    const res = parseImportPayload(JSON.stringify([legacy]));

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.positions[0]).toMatchObject({
      metal: 'or',
      product: 'Napoléon 20F',
    });
    expect(res.result.rejected).toBe(0);
  });

  test('keeps explicit silver metal and productId on import', () => {
    const res = parseImportPayload(JSON.stringify([
      makePos({
        metal: 'argent',
        product: 'Silver Maple Leaf 1 oz',
        productId: 'silver-maple-leaf-1oz',
      }),
    ]));

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.positions[0]).toMatchObject({
      metal: 'argent',
      productId: 'silver-maple-leaf-1oz',
    });
  });
});

describe('parseImportPayload — rejection paths', () => {
  test('returns invalid_json on malformed input', () => {
    const res = parseImportPayload('NOT_JSON{{{');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('invalid_json');
  });

  test('returns unrecognized_shape on a plain object without positions array', () => {
    const res = parseImportPayload(JSON.stringify({ hello: 'world' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('unrecognized_shape');
  });

  test('returns unrecognized_shape on a primitive', () => {
    const res = parseImportPayload(JSON.stringify(42));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('unrecognized_shape');
  });

  test('returns no_valid_position when wrapper has zero valid entries', () => {
    const wrapper = {
      app: 'OrTrack',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      positions: [{ bogus: true }, { id: 'b', metal: 'unobtanium' }],
    };
    const res = parseImportPayload(JSON.stringify(wrapper));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('no_valid_position');
  });

  test('returns no_valid_position when v0 array has zero valid entries', () => {
    const res = parseImportPayload(JSON.stringify([{ bogus: true }]));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('no_valid_position');
  });

  test('returns no_valid_position when positions array is empty', () => {
    const wrapper = {
      app: 'OrTrack',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      positions: [],
    };
    const res = parseImportPayload(JSON.stringify(wrapper));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('no_valid_position');
  });
});
