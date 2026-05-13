/**
 * Point mort spot — source de vérité unique.
 *
 * Convention OrTrack : `Position.purchasePrice` et `Position.weightG` sont
 * unitaires. Le caller doit fournir des totaux via :
 *   prixAchatTotal  = position.purchasePrice * quantity
 *   poidsFinGrammes = position.weightG * quantity
 *
 * Toutes les bornes du seuil "Proche" sont incluses (±2 %).
 */

export type PointMortSpotState =
  | 'below'
  | 'near'
  | 'above'
  | 'spot_unavailable';

export type PointMortSpotResult = {
  pointMortSpot: number;
  ecartPointMort: number | null;
  // state reste conservé pour l’analytics, même si l’état n’est plus rendu dans l’UI compacte.
  state: PointMortSpotState;
  hasSpotActuel: boolean;
};

const NEAR_THRESHOLD = 0.02;

const TYPOGRAPHIC_MINUS = '–';

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function calculerPointMortSpot(params: {
  prixAchatTotal: number;
  poidsFinGrammes: number;
  spotActuel?: number | null;
}): PointMortSpotResult | null {
  const { prixAchatTotal, poidsFinGrammes, spotActuel } = params;

  if (!isPositiveFinite(prixAchatTotal)) return null;
  if (!isPositiveFinite(poidsFinGrammes)) return null;

  const pointMortSpot = prixAchatTotal / poidsFinGrammes;
  if (!Number.isFinite(pointMortSpot)) return null;

  if (!isPositiveFinite(spotActuel)) {
    return {
      pointMortSpot,
      ecartPointMort: null,
      state: 'spot_unavailable',
      hasSpotActuel: false,
    };
  }

  const ecartPointMort = (spotActuel - pointMortSpot) / pointMortSpot;

  let state: PointMortSpotState;
  if (ecartPointMort < -NEAR_THRESHOLD) state = 'below';
  else if (ecartPointMort > NEAR_THRESHOLD) state = 'above';
  else state = 'near';

  return {
    pointMortSpot,
    ecartPointMort,
    state,
    hasSpotActuel: true,
  };
}

export function formatPointMortSpotPrice(
  value: number,
  currencySymbol: string = '€',
): string {
  if (value < 50) {
    const formatted = value.toFixed(2).replace('.', ',');
    return `${formatted} ${currencySymbol}/g`;
  }
  const rounded = Math.round(value);
  return `${rounded} ${currencySymbol}/g`;
}

export function formatPointMortSpotGap(ratio: number): string {
  const pct = ratio * 100;
  const rounded = Math.round(pct * 10) / 10;

  if (rounded === 0) {
    return '0,0 %';
  }

  const abs = Math.abs(rounded);
  const formatted = abs.toFixed(1).replace('.', ',');
  const sign = rounded < 0 ? TYPOGRAPHIC_MINUS : '+';
  return `${sign}${formatted} %`;
}
