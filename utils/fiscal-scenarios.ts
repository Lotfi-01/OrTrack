import { getSpot } from '@/constants/metals';
import { Position } from '@/types/position';
import { computePositionCost, computePositionValue } from '@/utils/position-calc';
import { calcYearsHeld, computeTax, parseDate } from '@/utils/tax-helpers';
import { REGIME_EQUALITY_THRESHOLD, isGainFiscalEligiblePosition } from '@/utils/fiscal';

// Type des prix spot tel que consommé par getSpot dans le code existant.
// Aligné avec le pattern déjà utilisé par computeBestRegimeForDate
// (app/fiscalite-globale.tsx) pour éviter d'importer SpotPrices.
type SpotPricesParam = Parameters<typeof getSpot>[1];

export type GlobalFiscalExclusionReason =
  | 'invalid_purchase_price'
  | 'missing_spot_price'
  | 'invalid_purchase_date'
  | 'simulated_date_before_purchase';

export type GlobalFiscalRegime = 'forfaitaire' | 'plusvalues' | 'equal';

export type GlobalFiscalPositionResult = {
  positionId: string;
  metal: string;
  salePrice: number;
  costPrice: number;
  years: number;
  forfaitaireTax: number;
  plusValuesTax: number;
  abatement: number;
  isExempt: boolean;
  bestRegime: GlobalFiscalRegime;
};

export type GlobalFiscalExclusion = {
  positionId: string;
  reason: GlobalFiscalExclusionReason;
};

export type GlobalFiscalScenarioSummary = {
  simulatedDate: Date;
  computed: GlobalFiscalPositionResult[];
  excluded: GlobalFiscalExclusion[];
  totalSalePrice: number;
  totalForfaitaireTax: number;
  totalPlusValuesTax: number;
  netForfaitaire: number;
  netPlusValues: number;
  delta: number;
  bestRegime: GlobalFiscalRegime;
  heroNet: number;
  eligiblePositionsCount: number;
  excludedPositionsCount: number;
  exclusionsByReason: {
    reason: GlobalFiscalExclusionReason;
    count: number;
  }[];
};

/**
 * Calcule un scénario fiscal global pur pour une date simulée donnée.
 *
 * Sémantique :
 * - `years` : nombre d'années entières entre purchaseDate et simulatedDate,
 *   calculé via calcYearsHeld. Aucun appel à `new Date()` ou `Date.now()`.
 * - `salePrice` : valeur courante de la position avec le spot transmis. Aucune
 *   projection de cours futur. Le scénario isole l'impact fiscal de la date,
 *   pas l'évolution du marché.
 * - `bestRegime` (par position) : régime le plus avantageux pour cette
 *   position. Peut diverger de `bestRegime` (global) qui compare la somme.
 * - `bestRegime` (global) : régime le plus avantageux pour la somme du
 *   portefeuille éligible. Si l'écart est strictement inférieur à
 *   REGIME_EQUALITY_THRESHOLD, le régime global vaut 'equal' et `heroNet`
 *   reprend le net forfaitaire par convention de l'écran actuel.
 *
 * Exclusions appliquées (alignées sur app/fiscalite-globale.tsx) :
 * - position non éligible (purchasePrice ≤ 0) → invalid_purchase_price
 * - spot manquant pour le métal → missing_spot_price
 * - date d'achat invalide ou non parsable → invalid_purchase_date
 * - simulatedDate strictement antérieure à purchaseDate → simulated_date_before_purchase
 *
 * Pureté :
 * - aucun effet de bord
 * - aucun input muté (positions, prices, simulatedDate)
 * - déterministe pour un même (positions, prices, simulatedDate)
 *
 * S4.x: build multi-scenario orchestration around computeGlobalFiscalScenario.
 */
export function computeGlobalFiscalScenario(params: {
  positions: Position[];
  prices: SpotPricesParam;
  simulatedDate: Date;
}): GlobalFiscalScenarioSummary {
  const { positions, prices, simulatedDate } = params;

  const computed: GlobalFiscalPositionResult[] = [];
  const excluded: GlobalFiscalExclusion[] = [];

  for (const pos of positions) {
    if (!isGainFiscalEligiblePosition(pos)) {
      excluded.push({ positionId: pos.id, reason: 'invalid_purchase_price' });
      continue;
    }

    const spot = getSpot(pos.metal, prices);
    const salePrice = computePositionValue(pos, spot);
    if (salePrice === null) {
      excluded.push({ positionId: pos.id, reason: 'missing_spot_price' });
      continue;
    }

    const purchaseDate = parseDate(pos.purchaseDate);
    if (purchaseDate === null) {
      excluded.push({ positionId: pos.id, reason: 'invalid_purchase_date' });
      continue;
    }

    if (simulatedDate.getTime() < purchaseDate.getTime()) {
      excluded.push({ positionId: pos.id, reason: 'simulated_date_before_purchase' });
      continue;
    }

    const costPrice = computePositionCost(pos);
    const years = calcYearsHeld(purchaseDate, simulatedDate);
    const tax = computeTax(salePrice, costPrice, years);
    const taxDelta = Math.abs(tax.plusValuesTax - tax.forfaitaire);
    const positionBestRegime: GlobalFiscalRegime =
      taxDelta < REGIME_EQUALITY_THRESHOLD
        ? 'equal'
        : tax.plusValuesTax < tax.forfaitaire
          ? 'plusvalues'
          : 'forfaitaire';

    computed.push({
      positionId: pos.id,
      metal: pos.metal,
      salePrice,
      costPrice,
      years,
      forfaitaireTax: tax.forfaitaire,
      plusValuesTax: tax.plusValuesTax,
      abatement: tax.abatement,
      isExempt: tax.isExempt,
      bestRegime: positionBestRegime,
    });
  }

  const totalSalePrice = computed.reduce((s, r) => s + r.salePrice, 0);
  const totalForfaitaireTax = computed.reduce((s, r) => s + r.forfaitaireTax, 0);
  const totalPlusValuesTax = computed.reduce((s, r) => s + r.plusValuesTax, 0);
  const netForfaitaire = totalSalePrice - totalForfaitaireTax;
  const netPlusValues = totalSalePrice - totalPlusValuesTax;
  const delta = Math.abs(netPlusValues - netForfaitaire);
  const isEquality = delta < REGIME_EQUALITY_THRESHOLD;
  const bestRegime: GlobalFiscalRegime = isEquality
    ? 'equal'
    : netPlusValues > netForfaitaire
      ? 'plusvalues'
      : 'forfaitaire';
  const heroNet = bestRegime === 'plusvalues' ? netPlusValues : netForfaitaire;

  const exclusionCounts = new Map<GlobalFiscalExclusionReason, number>();
  for (const e of excluded) {
    exclusionCounts.set(e.reason, (exclusionCounts.get(e.reason) ?? 0) + 1);
  }
  const exclusionsByReason: GlobalFiscalScenarioSummary['exclusionsByReason'] = [];
  for (const [reason, count] of exclusionCounts) {
    exclusionsByReason.push({ reason, count });
  }

  return {
    simulatedDate,
    computed,
    excluded,
    totalSalePrice,
    totalForfaitaireTax,
    totalPlusValuesTax,
    netForfaitaire,
    netPlusValues,
    delta,
    bestRegime,
    heroNet,
    eligiblePositionsCount: computed.length,
    excludedPositionsCount: excluded.length,
    exclusionsByReason,
  };
}
