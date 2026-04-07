import { buildComparisonModel, buildComparisonSentence } from '../radar-comparison';
import { getCategoryMetalLabel, RadarProduct } from '../types';

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

describe('buildComparisonModel', () => {
  test('< 2 eligible → null', () => {
    const products = [makeProduct({ productId: 'a', metal: 'gold', category: 'piece' })];
    expect(buildComparisonModel(products, 'gold', 'piece')).toBeNull();
  });

  test('3 eligible → sorted by percentile ASC', () => {
    const products = [
      makeProduct({ productId: 'c', percentile: 80, metal: 'gold', category: 'piece' }),
      makeProduct({ productId: 'a', percentile: 20, metal: 'gold', category: 'piece' }),
      makeProduct({ productId: 'b', percentile: 50, metal: 'gold', category: 'piece' }),
    ];
    const model = buildComparisonModel(products, 'gold', 'piece');
    expect(model).not.toBeNull();
    expect(model!.products[0]!.percentile).toBe(20);
    expect(model!.products[2]!.percentile).toBe(80);
  });

  test('product excluded if dataQuality !== ok', () => {
    const products = [
      makeProduct({ productId: 'a', percentile: 20, metal: 'gold', category: 'piece' }),
      makeProduct({ productId: 'b', percentile: 50, metal: 'gold', category: 'piece', dataQuality: 'gaps' }),
      makeProduct({ productId: 'c', percentile: 80, metal: 'gold', category: 'piece' }),
    ];
    const model = buildComparisonModel(products, 'gold', 'piece');
    expect(model!.products).toHaveLength(2);
  });
});

describe('buildComparisonSentence', () => {
  test('all normal → stable message', () => {
    const products = [
      makeProduct({ productId: 'a', signal: 'normal' }),
      makeProduct({ productId: 'b', signal: 'normal' }),
    ] as RadarProduct[];
    expect(buildComparisonSentence(products, 'pièces or')).toBe('Primes stables sur les pièces or');
  });

  test('mixed signals → lowest percentile message', () => {
    const products = [
      makeProduct({ productId: 'a', label: 'Krugerrand', signal: 'low', percentile: 10 }),
      makeProduct({ productId: 'b', label: 'Maple', signal: 'normal', percentile: 50 }),
    ] as RadarProduct[];
    expect(buildComparisonSentence(products, 'pièces or')).toContain('Krugerrand');
    expect(buildComparisonSentence(products, 'pièces or')).toContain('10/100');
  });
});

describe('getCategoryMetalLabel', () => {
  test('piece + gold → pièces or', () => expect(getCategoryMetalLabel('piece', 'gold')).toBe('pièces or'));
  test('lingot + silver → lingots argent', () => expect(getCategoryMetalLabel('lingot', 'silver')).toBe('lingots argent'));
});
