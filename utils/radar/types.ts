export type RadarSignal = 'low' | 'normal' | 'high';

export type DataQuality = 'ok' | 'insufficient_history' | 'gaps' | 'missing';

export type RadarMetal = 'gold' | 'silver' | 'platinum' | 'palladium';

export type RadarWindowDays = 90;

export interface RadarProduct {
  productId: string;
  label: string;
  metal: RadarMetal;
  category: 'piece' | 'lingot';
  currentPrimePct: number | null;
  avgPrimePct: number | null;
  minPrimePct: number | null;
  maxPrimePct: number | null;
  percentile: number | null;
  signal: RadarSignal | null;
  dataQuality: DataQuality;
  history: { date: string; primePct: number }[] | null;
}

export interface UseRadarProductsResult {
  products: RadarProduct[];
  latestDate: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseRadarProductsParams {
  metal?: RadarMetal;
  days?: RadarWindowDays;
}

export const SIGNAL_PRIORITY: Record<RadarSignal | 'null', number> = {
  low: 0,
  high: 1,
  normal: 2,
  null: 3,
};

// ── Mappings produit ────────────────────────────────────────────────────

export const RADAR_PRODUCT_LABELS: Record<string, string> = {
  krugerrand_1oz: 'Krugerrand 1oz',
  maple_leaf_1oz: 'Maple Leaf 1oz',
  philharmonique_1oz: 'Philharmonique 1oz',
  lingot_10g: 'Lingot 10g',
  lingot_100g: 'Lingot 100g',
  lingot_1kg: 'Lingot 1kg',
};

export const RADAR_PRODUCT_METALS: Record<string, RadarMetal> = {
  krugerrand_1oz: 'gold',
  maple_leaf_1oz: 'gold',
  philharmonique_1oz: 'gold',
  lingot_10g: 'gold',
  lingot_100g: 'gold',
  lingot_1kg: 'gold',
};

export function getProductCategory(productId: string): 'piece' | 'lingot' {
  return productId.startsWith('lingot') ? 'lingot' : 'piece';
}

const CATEGORY_LABELS: Record<'piece' | 'lingot', string> = {
  piece: 'pièces',
  lingot: 'lingots',
};

const METAL_LABELS: Record<RadarMetal, string> = {
  gold: 'or',
  silver: 'argent',
  platinum: 'platine',
  palladium: 'palladium',
};

export function getCategoryMetalLabel(
  category: 'piece' | 'lingot',
  metal: RadarMetal,
): string {
  return `${CATEGORY_LABELS[category]} ${METAL_LABELS[metal]}`;
}
