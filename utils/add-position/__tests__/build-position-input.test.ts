import type { Product } from '@/constants/products';
import type { SilverMvpProduct } from '@/constants/silver-products';

import { buildPositionInput } from '../build-position-input';

const CATALOG_PRODUCT: Product = {
  label: 'Napoléon 20F',
  weightG: 5.81,
  category: 'piece',
};

const CUSTOM_WEIGHT_PRODUCT: Product = {
  label: 'Autre',
  weightG: null,
  category: 'autre',
};

const SILVER_MVP_PRODUCT: SilverMvpProduct = {
  id: 'silver-maple-leaf-1oz',
  label: 'Silver Maple Leaf 1 oz',
  metal: 'argent',
  weightG: 31.1035,
  category: 'piece',
  popular: true,
  vatRate: 0.20,
  premiumMinPct: 0,
  premiumMaxPct: 80,
};

describe('buildPositionInput — produit catalogue', () => {
  it('mappe tous les champs du payload', () => {
    const payload = buildPositionInput({
      id: 'abc123',
      metal: 'or',
      product: CATALOG_PRODUCT,
      weightG: 5.81,
      quantity: 2,
      purchasePrice: 850,
      purchaseDate: '15/03/2024',
      note: 'achat anniversaire',
      createdAt: '2024-03-15T10:00:00.000Z',
      spotAtPurchase: 64.5,
      productId: undefined,
    });
    expect(payload).toEqual({
      id: 'abc123',
      metal: 'or',
      product: 'Napoléon 20F',
      weightG: 5.81,
      quantity: 2,
      purchasePrice: 850,
      purchaseDate: '15/03/2024',
      createdAt: '2024-03-15T10:00:00.000Z',
      note: 'achat anniversaire',
      spotAtPurchase: 64.5,
      productId: undefined,
    });
  });
});

describe('buildPositionInput — produit argent MVP', () => {
  it('utilise le label du produit MVP et conserve productId', () => {
    const payload = buildPositionInput({
      id: 'silver-1',
      metal: 'argent',
      product: SILVER_MVP_PRODUCT,
      weightG: 31.1035,
      quantity: 1,
      purchasePrice: 35,
      purchaseDate: '01/01/2024',
      note: '',
      createdAt: '2024-01-01T00:00:00.000Z',
      spotAtPurchase: 30,
      productId: 'silver-maple-leaf-1oz',
    });
    expect(payload.product).toBe('Silver Maple Leaf 1 oz');
    expect(payload.productId).toBe('silver-maple-leaf-1oz');
    expect(payload.metal).toBe('argent');
    expect(payload.weightG).toBe(31.1035);
  });
});

describe('buildPositionInput — poids custom', () => {
  it('mappe weightG tel que reçu (number arbitraire)', () => {
    const payload = buildPositionInput({
      id: 'p1',
      metal: 'or',
      product: CUSTOM_WEIGHT_PRODUCT,
      weightG: 7.78,
      quantity: 1,
      purchasePrice: 600,
      purchaseDate: '01/01/2024',
      note: '',
      createdAt: '2024-01-01T00:00:00.000Z',
      spotAtPurchase: null,
      productId: undefined,
    });
    expect(payload.product).toBe('Autre');
    expect(payload.weightG).toBe(7.78);
  });
});

describe('buildPositionInput — note', () => {
  const baseParams = {
    id: 'p1',
    metal: 'or' as const,
    product: CATALOG_PRODUCT,
    weightG: 5.81,
    quantity: 1,
    purchasePrice: 600,
    purchaseDate: '01/01/2024',
    createdAt: '2024-01-01T00:00:00.000Z',
    spotAtPurchase: null,
    productId: undefined,
  };

  it('note vide retourne undefined', () => {
    const payload = buildPositionInput({ ...baseParams, note: '' });
    expect(payload.note).toBeUndefined();
  });

  it('note avec espaces uniquement retourne undefined', () => {
    const payload = buildPositionInput({ ...baseParams, note: '   ' });
    expect(payload.note).toBeUndefined();
  });

  it('note remplie est trimmée', () => {
    const payload = buildPositionInput({ ...baseParams, note: '  hello  ' });
    expect(payload.note).toBe('hello');
  });
});

describe('buildPositionInput — date d achat', () => {
  it('purchaseDate est trimmée', () => {
    const payload = buildPositionInput({
      id: 'p1',
      metal: 'or',
      product: CATALOG_PRODUCT,
      weightG: 5.81,
      quantity: 1,
      purchasePrice: 600,
      purchaseDate: '  15/03/2024  ',
      note: '',
      createdAt: '2024-01-01T00:00:00.000Z',
      spotAtPurchase: null,
      productId: undefined,
    });
    expect(payload.purchaseDate).toBe('15/03/2024');
  });
});

describe('buildPositionInput — formats numériques', () => {
  const baseParams = {
    id: 'p1',
    metal: 'or' as const,
    product: CATALOG_PRODUCT,
    weightG: 5.81,
    purchaseDate: '01/01/2024',
    note: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    spotAtPurchase: null,
    productId: undefined,
  };

  it('purchasePrice est conservé en number', () => {
    const payload = buildPositionInput({ ...baseParams, quantity: 1, purchasePrice: 1234.56 });
    expect(payload.purchasePrice).toBe(1234.56);
    expect(typeof payload.purchasePrice).toBe('number');
  });

  it('quantity est conservée en number', () => {
    const payload = buildPositionInput({ ...baseParams, quantity: 5, purchasePrice: 600 });
    expect(payload.quantity).toBe(5);
    expect(typeof payload.quantity).toBe('number');
  });
});

describe('buildPositionInput — spotAtPurchase', () => {
  const baseParams = {
    id: 'p1',
    metal: 'or' as const,
    product: CATALOG_PRODUCT,
    weightG: 5.81,
    quantity: 1,
    purchasePrice: 600,
    purchaseDate: '01/01/2024',
    note: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    productId: undefined,
  };

  it('null devient undefined', () => {
    const payload = buildPositionInput({ ...baseParams, spotAtPurchase: null });
    expect(payload.spotAtPurchase).toBeUndefined();
  });

  it('number est conservé', () => {
    const payload = buildPositionInput({ ...baseParams, spotAtPurchase: 64.5 });
    expect(payload.spotAtPurchase).toBe(64.5);
  });
});

describe('buildPositionInput — pureté', () => {
  it('ne mute pas les arguments', () => {
    const product = { ...CATALOG_PRODUCT };
    const productSnapshot = { ...product };
    const params = {
      id: 'p1',
      metal: 'or' as const,
      product,
      weightG: 5.81,
      quantity: 1,
      purchasePrice: 600,
      purchaseDate: '  15/03/2024  ',
      note: '  hello  ',
      createdAt: '2024-01-01T00:00:00.000Z',
      spotAtPurchase: null,
      productId: undefined,
    };
    const paramsSnapshot = { ...params };
    buildPositionInput(params);
    expect(product).toEqual(productSnapshot);
    expect(params).toEqual(paramsSnapshot);
  });
});
