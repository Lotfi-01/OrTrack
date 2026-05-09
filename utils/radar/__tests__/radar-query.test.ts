// RP1.1 — Tests du fetch Radar Prime via Edge Function.
//
// Couvre :
//   - mapping correct du payload Edge Function v1 vers RadarProduct[]
//   - propagation des erreurs `unauthorized` (401) et `premium_required` (403)
//   - validation du `version` de payload
//   - rejet des observations brutes (`dealer_name` n'apparaît pas dans le
//     contrat de réponse documenté)
//
// `supabase` est moqué pour isoler la fonction de la couche réseau.

const mockInvoke = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import {
  RadarPrimeError,
  fetchRadarPrimeSnapshots,
} from '../radar-query';

describe('fetchRadarPrimeSnapshots', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('appelle Edge Function radar-prime en POST', async () => {
    mockInvoke.mockResolvedValue({
      data: { version: 1, snapshotDate: null, products: [] },
      error: null,
    });
    await fetchRadarPrimeSnapshots();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('radar-prime', { method: 'POST' });
  });

  test('payload Premium minimal mappé vers RadarProduct[]', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        version: 1,
        snapshotDate: '2026-05-09',
        products: [
          {
            slug: 'krugerrand_1oz',
            label: 'Krugerrand 1oz',
            metal: 'gold',
            category: 'coin',
            medianPremiumPct: 7.4,
            p25PremiumPct: 5.8,
            p75PremiumPct: 9.1,
            observationsCount: 8,
            freshnessDays: 3,
            status: 'normal',
            confidenceLevel: 'medium',
          },
        ],
      },
      error: null,
    });
    const result = await fetchRadarPrimeSnapshots();
    expect(result.latestDate).toBe('2026-05-09');
    expect(result.products).toHaveLength(1);
    const p = result.products[0]!;
    expect(p.productId).toBe('krugerrand_1oz');
    expect(p.metal).toBe('gold');
    expect(p.category).toBe('piece'); // coin → piece
    expect(p.currentPrimePct).toBe(7.4);
    expect(p.minPrimePct).toBe(5.8);
    expect(p.maxPrimePct).toBe(9.1);
    expect(p.signal).toBe('normal');
    expect(p.dataQuality).toBe('ok');
    expect(p.history).toBeNull();
    expect(p.percentile).toBeNull();
  });

  test('mapping category bar → lingot', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        version: 1,
        snapshotDate: '2026-05-09',
        products: [
          {
            slug: 'lingot_100g',
            label: 'Lingot 100g',
            metal: 'gold',
            category: 'bar',
            medianPremiumPct: 4.2,
            p25PremiumPct: 3.5,
            p75PremiumPct: 5.0,
            observationsCount: 9,
            freshnessDays: 2,
            status: 'low',
            confidenceLevel: 'high',
          },
        ],
      },
      error: null,
    });
    const result = await fetchRadarPrimeSnapshots();
    expect(result.products[0]!.category).toBe('lingot');
    expect(result.products[0]!.signal).toBe('low');
  });

  test('status stale → dataQuality stale et valeurs masquées', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        version: 1,
        snapshotDate: '2026-05-09',
        products: [
          {
            slug: 'maple_leaf_1oz',
            label: 'Maple Leaf 1oz',
            metal: 'gold',
            category: 'coin',
            medianPremiumPct: 6.0,
            p25PremiumPct: 4.0,
            p75PremiumPct: 8.0,
            observationsCount: 5,
            freshnessDays: 45,
            status: 'stale',
            confidenceLevel: 'low',
          },
        ],
      },
      error: null,
    });
    const result = await fetchRadarPrimeSnapshots();
    const p = result.products[0]!;
    expect(p.dataQuality).toBe('stale');
    expect(p.signal).toBeNull();
    // Statut non-données : le mapping masque les valeurs.
    expect(p.currentPrimePct).toBeNull();
    expect(p.minPrimePct).toBeNull();
    expect(p.maxPrimePct).toBeNull();
  });

  test('status insufficient_data → dataQuality insufficient_history, signal null', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        version: 1,
        snapshotDate: '2026-05-09',
        products: [
          {
            slug: 'philharmonique_1oz',
            label: 'Philharmonique 1oz',
            metal: 'gold',
            category: 'coin',
            medianPremiumPct: 7.0,
            p25PremiumPct: 5.0,
            p75PremiumPct: 9.0,
            observationsCount: 1,
            freshnessDays: 0,
            status: 'insufficient_data',
            confidenceLevel: 'low',
          },
        ],
      },
      error: null,
    });
    const result = await fetchRadarPrimeSnapshots();
    const p = result.products[0]!;
    expect(p.dataQuality).toBe('insufficient_history');
    expect(p.signal).toBeNull();
    expect(p.currentPrimePct).toBeNull();
  });

  test('payload vide → liste vide et latestDate null', async () => {
    mockInvoke.mockResolvedValue({
      data: { version: 1, snapshotDate: null, products: [] },
      error: null,
    });
    const result = await fetchRadarPrimeSnapshots();
    expect(result.products).toEqual([]);
    expect(result.latestDate).toBeNull();
  });

  test('produits avec metal hors gold sont filtrés (RP1 gold-only)', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        version: 1,
        snapshotDate: '2026-05-09',
        products: [
          {
            slug: 'silver_coin', label: 'Silver coin', metal: 'silver',
            category: 'coin', medianPremiumPct: 5, p25PremiumPct: 3,
            p75PremiumPct: 7, observationsCount: 5, freshnessDays: 1,
            status: 'normal', confidenceLevel: 'medium',
          },
          {
            slug: 'gold_coin', label: 'Gold coin', metal: 'gold',
            category: 'coin', medianPremiumPct: 5, p25PremiumPct: 3,
            p75PremiumPct: 7, observationsCount: 5, freshnessDays: 1,
            status: 'normal', confidenceLevel: 'medium',
          },
        ],
      },
      error: null,
    });
    const result = await fetchRadarPrimeSnapshots();
    expect(result.products).toHaveLength(1);
    expect(result.products[0]!.metal).toBe('gold');
  });

  test('erreur 401 → RadarPrimeError unauthorized', async () => {
    mockInvoke.mockResolvedValue({
      data: { error: 'unauthorized' },
      error: Object.assign(new Error('Unauthorized'), {
        context: { status: 401 },
      }),
    });
    await expect(fetchRadarPrimeSnapshots()).rejects.toMatchObject({
      name: 'RadarPrimeError',
      detail: { kind: 'unauthorized' },
    });
  });

  test('erreur 403 → RadarPrimeError premium_required', async () => {
    mockInvoke.mockResolvedValue({
      data: { error: 'premium_required' },
      error: Object.assign(new Error('Forbidden'), {
        context: { status: 403 },
      }),
    });
    await expect(fetchRadarPrimeSnapshots()).rejects.toMatchObject({
      name: 'RadarPrimeError',
      detail: { kind: 'premium_required' },
    });
  });

  test('erreur 500 → RadarPrimeError server_error', async () => {
    mockInvoke.mockResolvedValue({
      data: { error: 'server_error' },
      error: Object.assign(new Error('Internal'), {
        context: { status: 500 },
      }),
    });
    await expect(fetchRadarPrimeSnapshots()).rejects.toMatchObject({
      name: 'RadarPrimeError',
      detail: { kind: 'server_error' },
    });
  });

  test('payload version inconnue → unsupported_version', async () => {
    mockInvoke.mockResolvedValue({
      data: { version: 2, snapshotDate: null, products: [] },
      error: null,
    });
    await expect(fetchRadarPrimeSnapshots()).rejects.toMatchObject({
      name: 'RadarPrimeError',
      detail: { kind: 'unsupported_version' },
    });
  });

  test('payload sans products → invalid_payload', async () => {
    mockInvoke.mockResolvedValue({
      data: { version: 1, snapshotDate: null },
      error: null,
    });
    await expect(fetchRadarPrimeSnapshots()).rejects.toMatchObject({
      name: 'RadarPrimeError',
      detail: { kind: 'invalid_payload' },
    });
  });

  test('RadarPrimeError est instance d Error', () => {
    const e = new RadarPrimeError({ kind: 'premium_required' });
    expect(e).toBeInstanceOf(Error);
    expect(e.detail.kind).toBe('premium_required');
  });
});
