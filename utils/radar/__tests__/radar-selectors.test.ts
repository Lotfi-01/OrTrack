import { selectDashboardProducts } from '../radar-selectors';
import { RadarProduct } from '../types';

// RP1.1 — `buildRadarProducts` a été retirée du module. Les agrégats
// `RadarProduct` proviennent désormais de l'Edge Function `radar-prime`,
// mappée dans `utils/radar/radar-query.ts:fetchRadarPrimeSnapshots`.
// Les anciens tests ciblaient une signature qui consommait des lignes
// Supabase brutes (`prime_daily`) — ils ne reflètent plus le contrat.

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
