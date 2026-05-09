import {
  parseRevenueCatEntitlement,
  createEntitlementCache,
  ENTITLEMENT_NAME,
} from '../_internal';

const NOW = Date.parse('2026-05-09T12:00:00Z');

describe('parseRevenueCatEntitlement', () => {
  test('payload null → unknown', () => {
    expect(parseRevenueCatEntitlement(null, NOW)).toBe('unknown');
  });

  test('payload non-objet → unknown', () => {
    expect(parseRevenueCatEntitlement('not-an-object', NOW)).toBe('unknown');
    expect(parseRevenueCatEntitlement(42, NOW)).toBe('unknown');
  });

  test('payload sans subscriber → unknown', () => {
    expect(parseRevenueCatEntitlement({}, NOW)).toBe('unknown');
  });

  test('payload sans entitlements field → unknown', () => {
    expect(parseRevenueCatEntitlement({ subscriber: {} }, NOW)).toBe('unknown');
  });

  test('entitlements vide → free (entitlement absent)', () => {
    expect(
      parseRevenueCatEntitlement({ subscriber: { entitlements: {} } }, NOW),
    ).toBe('free');
  });

  test('entitlement absent → free', () => {
    expect(
      parseRevenueCatEntitlement(
        { subscriber: { entitlements: { other: { expires_date: null } } } },
        NOW,
      ),
    ).toBe('free');
  });

  test('entitlement actif (lifetime, expires_date null) → premium', () => {
    expect(
      parseRevenueCatEntitlement(
        {
          subscriber: {
            entitlements: { premium: { expires_date: null, product_identifier: 'lifetime' } },
          },
        },
        NOW,
      ),
    ).toBe('premium');
  });

  test('entitlement actif (expires_date dans le futur) → premium', () => {
    expect(
      parseRevenueCatEntitlement(
        {
          subscriber: {
            entitlements: { premium: { expires_date: '2027-01-01T00:00:00Z' } },
          },
        },
        NOW,
      ),
    ).toBe('premium');
  });

  test('entitlement expiré → free', () => {
    expect(
      parseRevenueCatEntitlement(
        {
          subscriber: {
            entitlements: { premium: { expires_date: '2025-01-01T00:00:00Z' } },
          },
        },
        NOW,
      ),
    ).toBe('free');
  });

  test('entitlement expiré exactement à now → free (égalité = expiré)', () => {
    expect(
      parseRevenueCatEntitlement(
        {
          subscriber: {
            entitlements: { premium: { expires_date: new Date(NOW).toISOString() } },
          },
        },
        NOW,
      ),
    ).toBe('free');
  });

  test('expires_date invalide → unknown (fail-closed)', () => {
    expect(
      parseRevenueCatEntitlement(
        {
          subscriber: {
            entitlements: { premium: { expires_date: 'not-a-date' } },
          },
        },
        NOW,
      ),
    ).toBe('unknown');
  });

  test('expires_date typé incorrectement → unknown', () => {
    expect(
      parseRevenueCatEntitlement(
        {
          subscriber: {
            entitlements: { premium: { expires_date: 12345 as unknown as string } },
          },
        },
        NOW,
      ),
    ).toBe('unknown');
  });

  test('entitlements est un tableau → unknown (forme invalide)', () => {
    expect(
      parseRevenueCatEntitlement(
        { subscriber: { entitlements: [] as unknown } },
        NOW,
      ),
    ).toBe('unknown');
  });

  test('nom d entitlement custom respecté', () => {
    expect(
      parseRevenueCatEntitlement(
        {
          subscriber: {
            entitlements: { gold_tier: { expires_date: '2027-01-01T00:00:00Z' } },
          },
        },
        NOW,
        'gold_tier',
      ),
    ).toBe('premium');
  });

  test('constante ENTITLEMENT_NAME = premium', () => {
    expect(ENTITLEMENT_NAME).toBe('premium');
  });
});

describe('createEntitlementCache', () => {
  test('get retourne null sans set', () => {
    const cache = createEntitlementCache(60_000);
    expect(cache.get('u1', NOW)).toBeNull();
  });

  test('set + get dans la fenêtre TTL', () => {
    const cache = createEntitlementCache(60_000);
    cache.set('u1', 'premium', NOW);
    expect(cache.get('u1', NOW + 1000)).toBe('premium');
    expect(cache.get('u1', NOW + 59_999)).toBe('premium');
  });

  test('expiration à TTL exact → null + purge', () => {
    const cache = createEntitlementCache(60_000);
    cache.set('u1', 'premium', NOW);
    expect(cache.get('u1', NOW + 60_000)).toBeNull();
    // Une seconde lecture confirme la purge.
    expect(cache.get('u1', NOW + 60_000)).toBeNull();
  });

  test('cache free comme premium', () => {
    const cache = createEntitlementCache(60_000);
    cache.set('u1', 'free', NOW);
    expect(cache.get('u1', NOW + 1000)).toBe('free');
  });

  test('isolation par userId', () => {
    const cache = createEntitlementCache(60_000);
    cache.set('u1', 'premium', NOW);
    cache.set('u2', 'free', NOW);
    expect(cache.get('u1', NOW + 1000)).toBe('premium');
    expect(cache.get('u2', NOW + 1000)).toBe('free');
  });

  test('clear vide le cache', () => {
    const cache = createEntitlementCache(60_000);
    cache.set('u1', 'premium', NOW);
    cache.clear();
    expect(cache.get('u1', NOW + 1000)).toBeNull();
  });
});
