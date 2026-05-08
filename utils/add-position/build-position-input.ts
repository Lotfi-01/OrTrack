import type { MetalType } from '@/constants/metals';
import type { Product } from '@/constants/products';
import type { SilverMvpProduct } from '@/constants/silver-products';
import type { Position } from '@/types/position';

export type BuildPositionInputParams = {
  id: string;
  metal: MetalType;
  product: Product | SilverMvpProduct;
  weightG: number;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  note: string;
  createdAt: string;
  spotAtPurchase: number | null;
  productId: string | undefined;
};

// Mapping pur du payload position envoyé à addPosition / updatePosition.
// Pas de validation, pas de normalisation, pas de side effect.
// Reçoit des valeurs déjà validées et normalisées par le caller.
export function buildPositionInput(params: BuildPositionInputParams): Position {
  return {
    id: params.id,
    metal: params.metal,
    product: params.product.label,
    weightG: params.weightG,
    quantity: params.quantity,
    purchasePrice: params.purchasePrice,
    purchaseDate: params.purchaseDate.trim(),
    createdAt: params.createdAt,
    note: params.note.trim() || undefined,
    spotAtPurchase: params.spotAtPurchase ?? undefined,
    productId: params.productId,
  };
}
