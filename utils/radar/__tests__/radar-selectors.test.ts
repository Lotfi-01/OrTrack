import { buildRadarProducts, selectDashboardProducts } from '../radar-selectors';
import { RadarProduct } from '../types';

// Helper to create a minimal RadarProduct for testing
function makeProduct(overrides: Partial<RadarProduct> & { productId: string }): RadarProduct {
  return {
    label: overrides.productId,
    metal: 'gold',
    category: 'piece',
    currentPrimePct: 10,
    avgPrimePct: 8,
    minPrimePct: 2,
    maxPrimePct: 15,
    percentile: 50,
    signal: 'normal',
    dataQuality: 'ok',
    history: null,
    ...overrides,
  };
}

describe('buildRadarProducts', () => {
  test('product in config with no Supabase data → missing + signal null', () => {
    const products = buildRadarProducts([], [], undefined);
    const krug = products.find(p => p.productId === 'krugerrand_1oz');
    expect(krug).toBeDefined();
    expect(krug!.dataQuality).toBe('missing');
    expect(krug!.signal).toBeNull();
    expect(krug!.currentPrimePct).toBeNull();
  });

  test('product with valid data → stats calculated', () => {
    const current = [{ product_id: 'krugerrand_1oz', metal: 'gold', price_date: '2025-04-05', prime_pct: 8 }];
    const history = Array.from({ length: 10 }, (_, i) => ({
      product_id: 'krugerrand_1oz',
      price_date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      prime_pct: 5 + i,
      metal: 'gold',
    }));
    const products = buildRadarProducts(current, history, undefined);
    const krug = products.find(p => p.productId === 'krugerrand_1oz');
    expect(krug!.currentPrimePct).toBe(8);
    expect(krug!.avgPrimePct).not.toBeNull();
    expect(krug!.dataQuality).toBe('ok');
  });

  test('product with currentPrimePct out of bounds → currentPrimePct null', () => {
    const current = [{ product_id: 'krugerrand_1oz', metal: 'gold', price_date: '2025-04-05', prime_pct: 99 }];
    const products = buildRadarProducts(current, [], undefined);
    const krug = products.find(p => p.productId === 'krugerrand_1oz');
    expect(krug!.currentPrimePct).toBeNull();
  });

  test('product with valid history but no currentPrimePct → signal null', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      product_id: 'krugerrand_1oz',
      price_date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      prime_pct: 5 + i,
      metal: 'gold',
    }));
    const products = buildRadarProducts([], history, undefined);
    const krug = products.find(p => p.productId === 'krugerrand_1oz');
    expect(krug!.signal).toBeNull();
  });

  test('missing metal mapping → throws', () => {
    // Temporarily inject a fake product into PRIME_CONFIG
    const { PRIME_CONFIG } = require('@/constants/prime-config');
    PRIME_CONFIG['fake_product_test'] = { minPrimePct: -5, maxPrimePct: 25, minSampleSize: 7, signalWindowDays: 90, calibrationDays: 30 };
    try {
      expect(() => buildRadarProducts([], [])).toThrow(/missing mapping/i);
    } finally {
      delete PRIME_CONFIG['fake_product_test'];
    }
  });
});

describe('selectDashboardProducts', () => {
  test('0 owned, no strong signals → fallback krugerrand + maple', () => {
    const products = [
      makeProduct({ productId: 'krugerrand_1oz', signal: 'normal' }),
      makeProduct({ productId: 'maple_leaf_1oz', signal: 'normal' }),
      makeProduct({ productId: 'philharmonique_1oz', signal: 'normal' }),
    ];
    const result = selectDashboardProducts(products, []);
    expect(result).toHaveLength(2);
    expect(result[0]!.productId).toBe('krugerrand_1oz');
    expect(result[1]!.productId).toBe('maple_leaf_1oz');
  });

  test('1 owned + strong signal → owned + strong', () => {
    const products = [
      makeProduct({ productId: 'krugerrand_1oz', signal: 'normal' }),
      makeProduct({ productId: 'maple_leaf_1oz', signal: 'low' }),
      makeProduct({ productId: 'philharmonique_1oz', signal: 'high' }),
    ];
    const result = selectDashboardProducts(products, ['krugerrand_1oz']);
    expect(result).toHaveLength(2);
    expect(result[0]!.productId).toBe('krugerrand_1oz');
    expect(result[1]!.productId).toBe('maple_leaf_1oz'); // low has priority 0
  });

  test('2 owned → 2 owned sorted by signal', () => {
    const products = [
      makeProduct({ productId: 'krugerrand_1oz', signal: 'normal' }),
      makeProduct({ productId: 'maple_leaf_1oz', signal: 'low' }),
    ];
    const result = selectDashboardProducts(products, ['krugerrand_1oz', 'maple_leaf_1oz']);
    expect(result).toHaveLength(2);
    expect(result[0]!.signal).toBe('low');
  });

  test('all owned calibrating → included before fallback', () => {
    const products = [
      makeProduct({ productId: 'krugerrand_1oz', signal: null, dataQuality: 'insufficient_history' }),
      makeProduct({ productId: 'maple_leaf_1oz', signal: null, dataQuality: 'insufficient_history' }),
    ];
    const result = selectDashboardProducts(products, ['krugerrand_1oz', 'maple_leaf_1oz']);
    expect(result).toHaveLength(2);
  });

  test('tie-break alphabetical at equal signal', () => {
    const products = [
      makeProduct({ productId: 'maple_leaf_1oz', label: 'Maple Leaf 1oz', signal: 'low' }),
      makeProduct({ productId: 'krugerrand_1oz', label: 'Krugerrand 1oz', signal: 'low' }),
    ];
    const result = selectDashboardProducts(products, ['krugerrand_1oz', 'maple_leaf_1oz']);
    expect(result[0]!.label).toBe('Krugerrand 1oz');
    expect(result[1]!.label).toBe('Maple Leaf 1oz');
  });
});
