import { PRODUCTS } from '@/constants/products';
import { SILVER_MVP_PRODUCTS } from '@/constants/silver-products';

import { getVisibleCoinsForMetal } from '../visible-coins';

const GOLD_PRIORITY_SAMPLE = [
  'Napoléon 20F',
  'Krugerrand 1oz',
  'Souverain',
];
const POPULAR_GOLD_SAMPLE = ['Napoléon 20F'];
const SILVER_POPULAR_IDS_SAMPLE = ['silver-maple-leaf-1oz'];

const NO_PRIORITY: readonly string[] = [];
const NO_POPULAR: readonly string[] = [];

describe('getVisibleCoinsForMetal — Or', () => {
  it('place les pièces prioritaires en tête, dans l ordre fourni', () => {
    const result = getVisibleCoinsForMetal({
      metal: 'or',
      effectiveEditMode: false,
      goldPriorityOrder: GOLD_PRIORITY_SAMPLE,
      popularGoldCoinsOnAdd: POPULAR_GOLD_SAMPLE,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    expect(result.slice(0, GOLD_PRIORITY_SAMPLE.length).map(c => c.label)).toEqual(
      GOLD_PRIORITY_SAMPLE,
    );
  });

  it('flagge popular selon la whitelist locale', () => {
    const result = getVisibleCoinsForMetal({
      metal: 'or',
      effectiveEditMode: false,
      goldPriorityOrder: GOLD_PRIORITY_SAMPLE,
      popularGoldCoinsOnAdd: POPULAR_GOLD_SAMPLE,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    const napoleon = result.find(c => c.label === 'Napoléon 20F');
    const krugerrand = result.find(c => c.label === 'Krugerrand 1oz');
    expect(napoleon?.popular).toBe(true);
    expect(krugerrand?.popular).toBe(false);
  });

  it('inclut chaque pièce du catalogue Or exactement une fois', () => {
    const result = getVisibleCoinsForMetal({
      metal: 'or',
      effectiveEditMode: false,
      goldPriorityOrder: GOLD_PRIORITY_SAMPLE,
      popularGoldCoinsOnAdd: POPULAR_GOLD_SAMPLE,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    const expectedLabels = PRODUCTS.or.filter(p => p.category === 'piece').map(p => p.label);
    const labels = result.map(c => c.label);
    expect(labels).toHaveLength(expectedLabels.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const expected of expectedLabels) {
      expect(labels).toContain(expected);
    }
  });

  it('flagge popular: false pour les pièces hors priorité', () => {
    const result = getVisibleCoinsForMetal({
      metal: 'or',
      effectiveEditMode: false,
      goldPriorityOrder: ['Napoléon 20F'],
      popularGoldCoinsOnAdd: POPULAR_GOLD_SAMPLE,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    expect(result[0].label).toBe('Napoléon 20F');
    expect(result[0].popular).toBe(true);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].popular).toBe(false);
    }
  });
});

describe('getVisibleCoinsForMetal — Argent en création', () => {
  it('retourne SILVER_MVP_PRODUCTS et non PRODUCTS.argent', () => {
    const result = getVisibleCoinsForMetal({
      metal: 'argent',
      effectiveEditMode: false,
      goldPriorityOrder: NO_PRIORITY,
      popularGoldCoinsOnAdd: NO_POPULAR,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    expect(result).toHaveLength(SILVER_MVP_PRODUCTS.length);
    const ids = result.map(c => ('id' in c ? c.id : null)).filter((id): id is string => id !== null);
    expect(ids).toHaveLength(SILVER_MVP_PRODUCTS.length);
  });

  it('flagge popular selon la whitelist d ids fournie', () => {
    const result = getVisibleCoinsForMetal({
      metal: 'argent',
      effectiveEditMode: false,
      goldPriorityOrder: NO_PRIORITY,
      popularGoldCoinsOnAdd: NO_POPULAR,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    const target = result.find(c => 'id' in c && c.id === 'silver-maple-leaf-1oz');
    expect(target).toBeDefined();
    expect(target?.popular).toBe(true);
    for (const item of result) {
      if ('id' in item && item.id !== 'silver-maple-leaf-1oz') {
        expect(item.popular).toBe(false);
      }
    }
  });
});

describe('getVisibleCoinsForMetal — Argent en édition', () => {
  it('utilise PRODUCTS.argent (pas la liste MVP)', () => {
    const result = getVisibleCoinsForMetal({
      metal: 'argent',
      effectiveEditMode: true,
      goldPriorityOrder: NO_PRIORITY,
      popularGoldCoinsOnAdd: NO_POPULAR,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    const expectedLabels = new Set(
      PRODUCTS.argent.filter(p => p.category === 'piece').map(p => p.label),
    );
    expect(new Set(result.map(c => c.label))).toEqual(expectedLabels);
  });

  it('trie popular-first', () => {
    const result = getVisibleCoinsForMetal({
      metal: 'argent',
      effectiveEditMode: true,
      goldPriorityOrder: NO_PRIORITY,
      popularGoldCoinsOnAdd: NO_POPULAR,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    let seenNonPopular = false;
    for (const c of result) {
      if (!c.popular) {
        seenNonPopular = true;
      } else {
        expect(seenNonPopular).toBe(false);
      }
    }
  });
});

describe('getVisibleCoinsForMetal — Platine et Palladium', () => {
  it.each(['platine', 'palladium'] as const)(
    'utilise PRODUCTS[%s] filtré sur category=piece',
    (metal) => {
      const result = getVisibleCoinsForMetal({
        metal,
        effectiveEditMode: false,
        goldPriorityOrder: NO_PRIORITY,
        popularGoldCoinsOnAdd: NO_POPULAR,
        silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
      });
      const expectedLabels = new Set(
        PRODUCTS[metal].filter(p => p.category === 'piece').map(p => p.label),
      );
      expect(new Set(result.map(c => c.label))).toEqual(expectedLabels);
    },
  );
});

describe('getVisibleCoinsForMetal — pureté', () => {
  it('ne mute pas les constantes sources entre appels successifs', () => {
    const goldSnapshot = PRODUCTS.or.map(p => ({ ...p }));
    const silverCatalogSnapshot = PRODUCTS.argent.map(p => ({ ...p }));
    const silverMvpSnapshot = SILVER_MVP_PRODUCTS.map(p => ({ ...p }));

    getVisibleCoinsForMetal({
      metal: 'or',
      effectiveEditMode: false,
      goldPriorityOrder: GOLD_PRIORITY_SAMPLE,
      popularGoldCoinsOnAdd: POPULAR_GOLD_SAMPLE,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    getVisibleCoinsForMetal({
      metal: 'argent',
      effectiveEditMode: false,
      goldPriorityOrder: NO_PRIORITY,
      popularGoldCoinsOnAdd: NO_POPULAR,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });
    getVisibleCoinsForMetal({
      metal: 'argent',
      effectiveEditMode: true,
      goldPriorityOrder: NO_PRIORITY,
      popularGoldCoinsOnAdd: NO_POPULAR,
      silverPopularBadgeProductIds: SILVER_POPULAR_IDS_SAMPLE,
    });

    expect(PRODUCTS.or).toEqual(goldSnapshot);
    expect(PRODUCTS.argent).toEqual(silverCatalogSnapshot);
    expect(SILVER_MVP_PRODUCTS).toEqual(silverMvpSnapshot);
  });
});
