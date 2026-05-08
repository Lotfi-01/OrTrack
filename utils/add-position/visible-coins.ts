import type { MetalType } from '@/constants/metals';
import { PRODUCTS, type Product } from '@/constants/products';
import { SILVER_MVP_PRODUCTS, type SilverMvpProduct } from '@/constants/silver-products';

export type VisibleCoin = Product | SilverMvpProduct;

export type GetVisibleCoinsForMetalParams = {
  metal: MetalType;
  effectiveEditMode: boolean;
  goldPriorityOrder: readonly string[];
  popularGoldCoinsOnAdd: readonly string[];
  silverPopularBadgeProductIds: readonly string[];
};

// Liste source ordonnée des pièces affichées dans l'écran Ajouter une position.
// Pure : ne lit aucun state React, ne mute aucune constante source. Recopie
// systématiquement les arrays avant tri ou fusion.
export function getVisibleCoinsForMetal({
  metal,
  effectiveEditMode,
  goldPriorityOrder,
  popularGoldCoinsOnAdd,
  silverPopularBadgeProductIds,
}: GetVisibleCoinsForMetalParams): VisibleCoin[] {
  if (metal === 'argent' && !effectiveEditMode) {
    return SILVER_MVP_PRODUCTS.map(product => ({
      ...product,
      popular: silverPopularBadgeProductIds.includes(product.id),
    }));
  }
  const coins = PRODUCTS[metal].filter(p => p.category === 'piece');
  if (metal !== 'or') {
    return [...coins].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
  }
  const prepared: Product[] = [];
  for (const priorityLabel of goldPriorityOrder) {
    const p = coins.find(c => c.label === priorityLabel);
    if (p) prepared.push({ ...p, popular: popularGoldCoinsOnAdd.includes(priorityLabel) });
  }
  for (const p of coins) {
    if (!goldPriorityOrder.includes(p.label)) {
      prepared.push({ ...p, popular: false });
    }
  }
  return prepared;
}
