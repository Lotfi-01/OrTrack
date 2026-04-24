import {
  SILVER_MVP_PRODUCT_IDS,
  SILVER_MVP_PRODUCTS,
  getSilverMvpProductById,
  isSilverMvpProductId,
} from '../silver-products';

const EXPECTED_IDS = [
  'silver-maple-leaf-1oz',
  'american-silver-eagle-1oz',
  'vienna-philharmonic-silver-1oz',
  '50-francs-hercule-silver',
  '10-francs-hercule-silver',
  '5-francs-semeuse-silver',
];

describe('SILVER_MVP_PRODUCTS', () => {
  it('exposes the 6 MVP silver SKUs', () => {
    expect(SILVER_MVP_PRODUCTS).toHaveLength(6);
    expect(SILVER_MVP_PRODUCTS.map(product => product.label)).toEqual([
      'Silver Maple Leaf 1 oz',
      'American Silver Eagle 1 oz',
      'Vienna Philharmonic 1 oz',
      '50 Francs Hercule',
      '10 Francs Hercule',
      '5 Francs Semeuse',
    ]);
  });

  it('keeps stable productIds', () => {
    expect(SILVER_MVP_PRODUCT_IDS).toEqual(EXPECTED_IDS);
    for (const id of EXPECTED_IDS) {
      expect(isSilverMvpProductId(id)).toBe(true);
      expect(getSilverMvpProductById(id)?.id).toBe(id);
    }
  });

  it('uses the real codebase metal and product category values', () => {
    expect(SILVER_MVP_PRODUCTS.every(product => product.metal === 'argent')).toBe(true);
    expect(SILVER_MVP_PRODUCTS.every(product => product.category === 'piece')).toBe(true);
  });

  it('sets vatRate 0.20 on the 3 modern bullion SKUs', () => {
    for (const id of EXPECTED_IDS.slice(0, 3)) {
      expect(getSilverMvpProductById(id)?.vatRate).toBe(0.20);
    }
  });

  it('keeps vatRate null on the 3 demonetized French SKUs', () => {
    for (const id of EXPECTED_IDS.slice(3)) {
      const product = getSilverMvpProductById(id);
      expect(product?.vatRate).toBeNull();
      expect(product?.premiumMinPct).toBeNull();
      expect(product?.premiumMaxPct).toBeNull();
    }
  });
});
