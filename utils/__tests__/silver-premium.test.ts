import { computeSilverMvpPremiumWarning } from '../silver-premium';

describe('computeSilverMvpPremiumWarning', () => {
  it('bases validation on the stable SKU id', () => {
    const warning = computeSilverMvpPremiumWarning({
      productId: 'silver-maple-leaf-1oz',
      unitPriceTTC: 200,
      spotEur: 100,
    });

    expect(warning).not.toBeNull();
    expect(warning?.productId).toBe('silver-maple-leaf-1oz');
    expect(warning?.direction).toBe('above');
  });

  it('respects different bounds for two modern SKUs', () => {
    const mapleWarning = computeSilverMvpPremiumWarning({
      productId: 'silver-maple-leaf-1oz',
      unitPriceTTC: 200,
      spotEur: 100,
    });
    const eagleWarning = computeSilverMvpPremiumWarning({
      productId: 'american-silver-eagle-1oz',
      unitPriceTTC: 200,
      spotEur: 100,
    });

    expect(mapleWarning?.direction).toBe('above');
    expect(eagleWarning).toBeNull();
  });

  it('returns a warning object without blocking creation', () => {
    expect(() => computeSilverMvpPremiumWarning({
      productId: 'vienna-philharmonic-silver-1oz',
      unitPriceTTC: 250,
      spotEur: 100,
    })).not.toThrow();

    const warning = computeSilverMvpPremiumWarning({
      productId: 'vienna-philharmonic-silver-1oz',
      unitPriceTTC: 250,
      spotEur: 100,
    });
    expect(warning).toMatchObject({ direction: 'above', minPct: 0, maxPct: 80 });
  });

  it('short-circuits null premium bounds and does not invent fallbacks', () => {
    const warning = computeSilverMvpPremiumWarning({
      productId: '50-francs-hercule-silver',
      unitPriceTTC: 1000,
      spotEur: 100,
    });

    expect(warning).toBeNull();
  });
});
