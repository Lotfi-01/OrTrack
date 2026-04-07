import { RadarProduct, RadarMetal, getCategoryMetalLabel } from './types';

export interface ComparisonModel {
  groupLabel: string;
  products: { productId: string; label: string; percentile: number }[];
  sentence: string;
}

export function buildComparisonModel(
  products: RadarProduct[],
  metal: RadarMetal,
  category: 'piece' | 'lingot',
): ComparisonModel | null {
  const eligible = products.filter(
    p => p.metal === metal && p.category === category && p.dataQuality === 'ok' && p.percentile !== null && p.currentPrimePct !== null,
  );

  if (eligible.length < 2) return null;

  const sorted = [...eligible].sort((a, b) => (a.percentile ?? 0) - (b.percentile ?? 0));
  const groupLabel = getCategoryMetalLabel(category, metal);

  return {
    groupLabel,
    products: sorted.map(p => ({ productId: p.productId, label: p.label, percentile: p.percentile! })),
    sentence: buildComparisonSentence(sorted, groupLabel),
  };
}

export function buildComparisonSentence(
  sortedProducts: RadarProduct[],
  groupLabel: string,
): string {
  if (sortedProducts.length === 0) return '';

  const allNormal = sortedProducts.every(p => p.signal === 'normal');
  if (allNormal) return `Primes stables sur les ${groupLabel}`;

  const lowest = sortedProducts[0]!;
  return `Le ${lowest.label} a le percentile le plus bas (${lowest.percentile}/100) parmi les ${groupLabel}`;
}
