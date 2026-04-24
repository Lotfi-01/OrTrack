import { computeSilverBreakdown } from '../silver-breakdown';

describe('computeSilverBreakdown', () => {
  it('computes TTC, estimated ex-VAT amount and VAT impact for vatRate 0.20', () => {
    const result = computeSilverBreakdown({
      unitPriceTTC: 100,
      quantity: 2,
      vatRate: 0.20,
    });

    expect(result.totalPaidTTC).toBe(200);
    expect(result.estimatedExVatAmount).toBeCloseTo(166.6666667);
    expect(result.estimatedVatImpact).toBeCloseTo(33.3333333);
  });

  it('keeps VAT-derived values null when vatRate is null', () => {
    const result = computeSilverBreakdown({
      unitPriceTTC: 50,
      quantity: 3,
      vatRate: null,
    });

    expect(result.totalPaidTTC).toBe(150);
    expect(result.estimatedExVatAmount).toBeNull();
    expect(result.estimatedVatImpact).toBeNull();
  });

  it('throws on invalid base inputs instead of masking corrupted data', () => {
    expect(() => computeSilverBreakdown({ unitPriceTTC: 0, quantity: 1, vatRate: 0.20 })).toThrow('unitPriceTTC');
    expect(() => computeSilverBreakdown({ unitPriceTTC: 10, quantity: -1, vatRate: 0.20 })).toThrow('quantity');
    expect(() => computeSilverBreakdown({ unitPriceTTC: Number.NaN, quantity: 1, vatRate: 0.20 })).toThrow('unitPriceTTC');
  });
});
