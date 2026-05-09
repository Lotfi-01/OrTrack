import { RadarProduct, SIGNAL_PRIORITY } from './types';

// RP1.1 — `buildRadarProducts` est retirée.
// La construction des `RadarProduct` est désormais faite dans
// `utils/radar/radar-query.ts:fetchRadarPrimeSnapshots` à partir du payload
// agrégé renvoyé par l'Edge Function `radar-prime`. Le client n'a plus à
// reconstituer les agrégats à partir de l'historique brut.

/**
 * Sélectionne 2 produits à mettre en avant pour un éventuel dashboard.
 * Pure : ne fait aucun fetch et ne dépend pas du statut Premium.
 */
export function selectDashboardProducts(
  radarProducts: RadarProduct[],
  portfolioProductIds: string[],
): RadarProduct[] {
  const ownedWithSignal = radarProducts
    .filter(p => portfolioProductIds.includes(p.productId))
    .filter(p => p.signal !== null)
    .sort((a, b) => {
      const diff = SIGNAL_PRIORITY[a.signal ?? 'null'] - SIGNAL_PRIORITY[b.signal ?? 'null'];
      return diff !== 0 ? diff : a.label.localeCompare(b.label, 'fr');
    });

  if (ownedWithSignal.length >= 2) return ownedWithSignal.slice(0, 2);

  const ownedCalibrating = radarProducts
    .filter(p => portfolioProductIds.includes(p.productId))
    .filter(p => p.signal === null);

  const ownedAll = [...ownedWithSignal, ...ownedCalibrating];
  if (ownedAll.length >= 2) return ownedAll.slice(0, 2);

  const strongSignal = radarProducts
    .filter(p => !portfolioProductIds.includes(p.productId))
    .filter(p => p.signal === 'low' || p.signal === 'high')
    .sort((a, b) => {
      const diff = SIGNAL_PRIORITY[a.signal ?? 'null'] - SIGNAL_PRIORITY[b.signal ?? 'null'];
      return diff !== 0 ? diff : a.label.localeCompare(b.label, 'fr');
    });

  const merged = [...ownedAll, ...strongSignal];
  if (merged.length >= 2) return merged.slice(0, 2);

  const FALLBACK_IDS = ['krugerrand_1oz', 'maple_leaf_1oz'];
  const fallback = FALLBACK_IDS
    .map(id => radarProducts.find(p => p.productId === id))
    .filter((p): p is RadarProduct => Boolean(p))
    .filter(p => !merged.some(m => m.productId === p.productId));

  return [...merged, ...fallback].slice(0, 2);
}
