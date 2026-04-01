import { getPrimeConfig } from '@/constants/prime-config';

/**
 * Calcule le pourcentage de prime.
 *
 * @param purchasePrice - prix payé par l'utilisateur (EUR unitaire)
 * @param spotPrice - valeur spot EUR unitaire au moment de l'achat
 * @returns prime en %, ou null si données invalides
 *
 * Formule : (purchasePrice - spotPrice) / spotPrice * 100
 * Note : un résultat négatif est légitime (achat sous le spot)
 */
export function computePrimePct(
  purchasePrice: number,
  spotPrice: number
): number | null {
  if (!spotPrice || spotPrice <= 0 || !purchasePrice || purchasePrice <= 0) {
    return null;
  }
  return ((purchasePrice - spotPrice) / spotPrice) * 100;
}

/**
 * Valide qu'une prime calculée est dans les bornes attendues pour ce produit.
 * Retourne la prime arrondie à 2 décimales si valide.
 * Retourne quand même la valeur si hors bornes, mais log un warning.
 * Retourne null si primePct est null.
 */
export function validatePrimePct(
  primePct: number | null,
  productSlug: string,
  context: string
): number | null {
  if (primePct == null) return null;

  const config = getPrimeConfig(productSlug);
  if (primePct < config.minPrimePct || primePct > config.maxPrimePct) {
    console.warn(
      `⚠️ Prime hors bornes (${context}): ${productSlug} = ${primePct.toFixed(1)}% ` +
      `(attendu ${config.minPrimePct}–${config.maxPrimePct}%)`
    );
  }

  return Math.round(primePct * 100) / 100;
}

/**
 * Compare la prime actuelle du marché avec la prime payée à l'achat.
 * Seuil : ±1% pour éviter le bruit.
 */
export function computePrimeComparison(
  currentPrimePct: number,
  purchasePrimePct: number
): 'lower' | 'higher' | 'stable' {
  const diff = currentPrimePct - purchasePrimePct;
  if (diff < -1) return 'lower';
  if (diff > 1) return 'higher';
  return 'stable';
}

/** Texte français pour la comparaison prime. */
export function getPrimeComparisonText(
  comparison: 'lower' | 'higher' | 'stable'
): string {
  switch (comparison) {
    case 'lower': return 'Marché en baisse vs votre achat';
    case 'higher': return 'Marché en hausse vs votre achat';
    case 'stable': return 'Marché stable vs votre achat';
  }
}

/**
 * Couleur pour la comparaison prime.
 * Utilise les couleurs gain/perte existantes d'OrTrack.
 */
export function getPrimeComparisonColor(
  comparison: 'lower' | 'higher' | 'stable',
  colors: { green: string; red: string; neutral: string }
): string {
  switch (comparison) {
    case 'lower': return colors.green;
    case 'higher': return colors.red;
    case 'stable': return colors.neutral;
  }
}
