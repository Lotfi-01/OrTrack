import { PRIME_CONFIG } from '@/constants/prime-config';
import {
  RadarProduct,
  RadarMetal,
  SIGNAL_PRIORITY,
  RADAR_PRODUCT_LABELS,
  RADAR_PRODUCT_METALS,
  getProductCategory,
} from './types';
import { isValidRadarPoint, detectDataQuality } from './radar-quality';
import { computePercentile, deriveSignal, computeAvgMinMax } from './radar-stats';

interface CurrentRow {
  product_id: string;
  metal: string;
  prime_pct: number;
  price_date: string;
}

interface HistoryRow {
  product_id: string;
  price_date: string;
  prime_pct: number;
}

export function buildRadarProducts(
  currentRows: CurrentRow[],
  historyRows: HistoryRow[],
  metalFilter?: RadarMetal,
): RadarProduct[] {
  const currentByProduct = new Map<string, CurrentRow>();
  for (const row of currentRows) currentByProduct.set(row.product_id, row);

  const historyByProduct = new Map<string, HistoryRow[]>();
  for (const row of historyRows) {
    const arr = historyByProduct.get(row.product_id) ?? [];
    arr.push(row);
    historyByProduct.set(row.product_id, arr);
  }

  const products: RadarProduct[] = [];

  for (const productId of Object.keys(PRIME_CONFIG)) {
    const metal = RADAR_PRODUCT_METALS[productId] as RadarMetal | undefined;
    if (!metal) {
      throw new Error(`RADAR_PRODUCT_METALS missing mapping for "${productId}". Every key in PRIME_CONFIG must have a corresponding entry.`);
    }

    if (metalFilter && metal !== metalFilter) continue;

    const label = RADAR_PRODUCT_LABELS[productId];
    if (!label) {
      throw new Error(`RADAR_PRODUCT_LABELS missing mapping for "${productId}". Every key in PRIME_CONFIG must have a corresponding entry.`);
    }

    const category = getProductCategory(productId);
    const currentRow = currentByProduct.get(productId);
    const rawHistory = historyByProduct.get(productId) ?? [];

    const validHistory = rawHistory
      .filter(h => isValidRadarPoint(h.prime_pct, productId))
      .map(h => ({ date: h.price_date, primePct: h.prime_pct }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dataQuality = detectDataQuality(validHistory.length > 0 ? validHistory : null);

    const primePcts = validHistory.map(h => h.primePct);
    const { avg, min, max } = computeAvgMinMax(primePcts);

    const currentPrimePct = currentRow
      ? (isValidRadarPoint(currentRow.prime_pct, productId)
          ? Math.round(currentRow.prime_pct * 100) / 100
          : null)
      : null;

    const percentile = currentPrimePct !== null
      ? computePercentile(currentPrimePct, primePcts)
      : null;

    const signal = deriveSignal(percentile, dataQuality === 'ok');

    products.push({
      productId,
      label,
      metal,
      category,
      currentPrimePct,
      avgPrimePct: avg,
      minPrimePct: min,
      maxPrimePct: max,
      percentile,
      signal,
      dataQuality,
      history: validHistory.length > 0 ? validHistory : null,
    });
  }

  return products;
}

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
