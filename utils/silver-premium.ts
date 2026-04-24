import { getSilverMvpProductById } from '@/constants/silver-products';
import { computePositionValue } from '@/utils/position-calc';

export type SilverPremiumWarning = {
  productId: string;
  premiumPct: number;
  referenceMetalValue: number;
  minPct: number;
  maxPct: number;
  direction: 'below' | 'above';
};

export type SilverPremiumValidationInput = {
  productId: string | null | undefined;
  unitPriceTTC: number;
  spotEur: number | null;
};

export function computeSilverMvpPremiumWarning(
  input: SilverPremiumValidationInput,
): SilverPremiumWarning | null {
  const product = getSilverMvpProductById(input.productId);
  if (!product) return null;
  if (product.premiumMinPct === null || product.premiumMaxPct === null) return null;
  if (input.spotEur === null || !Number.isFinite(input.spotEur) || input.spotEur <= 0) return null;
  if (!Number.isFinite(input.unitPriceTTC) || input.unitPriceTTC <= 0) return null;

  const referenceMetalValue = computePositionValue(
    { quantity: 1, weightG: product.weightG },
    input.spotEur,
  );
  if (referenceMetalValue === null || referenceMetalValue <= 0) return null;

  const premiumPct = ((input.unitPriceTTC - referenceMetalValue) / referenceMetalValue) * 100;

  if (premiumPct < product.premiumMinPct) {
    return {
      productId: product.id,
      premiumPct,
      referenceMetalValue,
      minPct: product.premiumMinPct,
      maxPct: product.premiumMaxPct,
      direction: 'below',
    };
  }

  if (premiumPct > product.premiumMaxPct) {
    return {
      productId: product.id,
      premiumPct,
      referenceMetalValue,
      minPct: product.premiumMinPct,
      maxPct: product.premiumMaxPct,
      direction: 'above',
    };
  }

  return null;
}
