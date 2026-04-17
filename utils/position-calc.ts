import { OZ_TO_G } from '@/constants/metals';
import { Position } from '@/types/position';

/**
 * Valeur courante d'une position (prix de cession au spot).
 *
 * Convention de nullité : retourne `null` si le spot n'est pas disponible.
 * Le caller décide s'il traduit ce `null` par `0` (agrégation tolérante) ou
 * par une exclusion visible. Ne pas muter cette convention sans arbitrage
 * produit : elle est consommée par portfolio.ts, fiscal.ts, stats-helpers.ts
 * et les écrans fiscalité.
 */
export function computePositionValue(
  pos: Pick<Position, 'quantity' | 'weightG'>,
  spot: number | null,
): number | null {
  if (spot === null) return null;
  return pos.quantity * (pos.weightG / OZ_TO_G) * spot;
}

/**
 * Coût d'achat total d'une position.
 *
 * Pas de filtre : renvoie toujours `quantity * purchasePrice`. Les exclusions
 * métier (purchasePrice ≤ 0, position non gain-eligible) sont de la
 * responsabilité du caller via `isGainFiscalEligiblePosition`.
 */
export function computePositionCost(
  pos: Pick<Position, 'quantity' | 'purchasePrice'>,
): number {
  return pos.quantity * pos.purchasePrice;
}
