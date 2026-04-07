export interface ProductPrimeConfig {
  minPrimePct: number;
  maxPrimePct: number;
  minSampleSize: number;
  signalWindowDays: number;
  calibrationDays: number;
}

export const CONFIG_VERSION = 1;

export const PRIME_CONFIG: Record<string, ProductPrimeConfig> = {
  krugerrand_1oz: { minPrimePct: -5, maxPrimePct: 25, minSampleSize: 7, signalWindowDays: 90, calibrationDays: 30 },
  maple_leaf_1oz: { minPrimePct: -5, maxPrimePct: 25, minSampleSize: 7, signalWindowDays: 90, calibrationDays: 30 },
  philharmonique_1oz: { minPrimePct: -5, maxPrimePct: 25, minSampleSize: 7, signalWindowDays: 90, calibrationDays: 30 },
  lingot_10g: { minPrimePct: -3, maxPrimePct: 15, minSampleSize: 7, signalWindowDays: 90, calibrationDays: 30 },
  lingot_100g: { minPrimePct: -3, maxPrimePct: 12, minSampleSize: 7, signalWindowDays: 90, calibrationDays: 30 },
  lingot_1kg: { minPrimePct: -2, maxPrimePct: 8, minSampleSize: 7, signalWindowDays: 90, calibrationDays: 30 },
};

export const DEFAULT_PRIME_CONFIG: ProductPrimeConfig = {
  minPrimePct: -5,
  maxPrimePct: 30,
  minSampleSize: 2,
  signalWindowDays: 90,
  calibrationDays: 7,
};

export function getPrimeConfig(productSlug: string): ProductPrimeConfig {
  return PRIME_CONFIG[productSlug] ?? DEFAULT_PRIME_CONFIG;
}
