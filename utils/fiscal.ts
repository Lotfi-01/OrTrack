import { TAX } from '@/constants/tax';
import { parseDate, calcYearsHeld, computeTax } from '@/utils/tax-helpers';
import { type MetalType, getSpot, OZ_TO_G } from '@/constants/metals';
import { Position } from '@/types/position';

/** Seuil en € en dessous duquel les deux régimes sont considérés équivalents */
export const REGIME_EQUALITY_THRESHOLD = 1;
export const PARTIAL_ESTIMATE_NOTICE = "Estimation partielle : les positions à prix d'achat nul sont exclues des gains, du net estimé et de la fiscalité.";

export function isGainFiscalEligiblePosition(pos: Pick<Position, 'purchasePrice'>): boolean {
  return Number.isFinite(pos.purchasePrice) && pos.purchasePrice > 0;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type FiscalCountdown = {
  years: number;
  months: number;
  detentionLabel: string;
  abattement: number;       // 0-100 (percentage)
  isExonere: boolean;
  remainingLabel: string;
  exemptionLabel: string;
  exemptionYear: number;
  progress: number;          // 0-1
};

export type RegimeComparison = {
  sellerNetForfaitaire: number;
  sellerNetPlusValues: number;
  bestRegime: 'forfaitaire' | 'plusvalues';
  delta: number;             // Math.abs(sellerNetPlusValues - sellerNetForfaitaire)
};

// ── Fonctions ──────────────────────────────────────────────────────────────

/**
 * Calcule l'abattement pour détention longue.
 * @returns abattement en pourcentage 0–100 (ex: 20 pour 20%).
 * ⚠️ Convention : pourcentage, pas décimal. Diviser par 100 avant multiplication.
 * Note : computeTax (tax-helpers.ts) utilise la convention décimal 0–1. Unification à prévoir.
 */
export function computeAbatement(holdingYears: number): number {
  if (holdingYears < TAX.abatementStartYear) return 0;
  return Math.min((holdingYears - (TAX.abatementStartYear - 1)) * (TAX.abatementPerYear * 100), 100);
}

/** Net vendeur forfaitaire. Taxe TOUJOURS le prix de cession, même à perte. */
export function computeSellerNetForfaitaire(currentValue: number): number {
  return currentValue * (1 - TAX.forfaitaireRate);
}

/** Net vendeur plus-values. Pas de taxe si gain <= 0. */
export function computeSellerNetPlusValues(currentValue: number, totalCost: number, holdingYears: number): number {
  const gainLoss = currentValue - totalCost;
  if (gainLoss <= 0) return currentValue;
  const abatementPct = computeAbatement(holdingYears);
  const gainTaxable = gainLoss * (1 - abatementPct / 100);
  const taxePV = gainTaxable * TAX.plusValueRate;
  return currentValue - taxePV;
}

/** Compare les deux régimes et retourne le meilleur + le delta. */
export function computeRegimeComparison(currentValue: number, totalCost: number, holdingYears: number): RegimeComparison {
  const sellerNetForfaitaire = computeSellerNetForfaitaire(currentValue);
  const sellerNetPlusValues = computeSellerNetPlusValues(currentValue, totalCost, holdingYears);
  const bestRegime = sellerNetPlusValues >= sellerNetForfaitaire ? ('plusvalues' as const) : ('forfaitaire' as const);
  const delta = Math.abs(sellerNetPlusValues - sellerNetForfaitaire);
  return { sellerNetForfaitaire, sellerNetPlusValues, bestRegime, delta };
}

/** Parse la date (DD/MM/YYYY), calcule durée de détention, abattement, exonération. */
export function computeFiscalCountdown(purchaseDate: string): FiscalCountdown | null {
  const buyDate = parseDate(purchaseDate);
  if (!buyDate) return null;

  const now = new Date();
  if (now.getTime() - buyDate.getTime() < 0) return null;

  let years = now.getFullYear() - buyDate.getFullYear();
  let months = now.getMonth() - buyDate.getMonth();
  if (now.getDate() < buyDate.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }

  const abattement = computeAbatement(years);
  const isExonere = abattement >= 100;

  const exemptionDate = new Date(buyDate);
  exemptionDate.setFullYear(exemptionDate.getFullYear() + TAX.fullExemptionYear);

  let remainingYears = 0;
  let remainingMonths = 0;
  if (!isExonere) {
    remainingYears = exemptionDate.getFullYear() - now.getFullYear();
    remainingMonths = exemptionDate.getMonth() - now.getMonth();
    if (exemptionDate.getDate() < now.getDate()) remainingMonths--;
    if (remainingMonths < 0) {
      remainingYears--;
      remainingMonths += 12;
    }
  }

  const moisNoms = [
    'janv.', 'f\u00E9vr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'ao\u00FBt', 'sept.', 'oct.', 'nov.', 'd\u00E9c.',
  ];
  const exemptionLabel = moisNoms[exemptionDate.getMonth()] + ' ' + exemptionDate.getFullYear();

  const buildLabel = (y: number, m: number): string => {
    const parts: string[] = [];
    if (y > 0) parts.push(y + ' an' + (y > 1 ? 's' : ''));
    if (m > 0) parts.push(m + ' mois');
    return parts.length > 0 ? parts.join(' ') : "Moins d\u2019un mois";
  };

  return {
    years,
    months,
    detentionLabel: buildLabel(years, months),
    abattement,
    isExonere,
    remainingLabel: buildLabel(remainingYears, remainingMonths),
    exemptionLabel,
    exemptionYear: exemptionDate.getFullYear(),
    progress: abattement / 100,
  };
}

// ── Portfolio-level fiscal summary ─────────────────────────────────────

export type PortfolioFiscalSummary = {
  totalSalePrice: number;
  totalCostPrice: number;
  grossGain: number;
  totalForfaitaireTax: number;
  totalPVTax: number;
  netForfaitaire: number;
  netPlusValues: number;
  bestNet: number;
  bestRegime: 'forfaitaire' | 'plusvalues' | null;
  delta: number;
  isEquality: boolean;
  excludedFromFiscalCount: number;
  hasPartialEstimate: boolean;
  /** Per-position fiscal data (for insights) */
  positionFiscals: {
    pos: Position;
    salePrice: number;
    costPrice: number;
    years: number;
    forfaitaireTax: number;
    pvTax: number;
    netForf: number;
    netPV: number;
    abatement: number;
    isExempt: boolean;
    gainEur: number;
  }[];
};

/**
 * Compute portfolio-level fiscal summary. Same logic as app/fiscalite-globale.tsx.
 * Uses computeTax() per position then aggregates.
 */
export function computePortfolioFiscalSummary(
  positions: Position[],
  prices: Record<string, number | null>,
): PortfolioFiscalSummary | null {
  const now = new Date();
  const positionFiscals: PortfolioFiscalSummary['positionFiscals'] = [];
  let excludedFromFiscalCount = 0;

  for (const pos of positions) {
    if (!isGainFiscalEligiblePosition(pos)) {
      excludedFromFiscalCount++;
      continue;
    }
    const spot = getSpot(pos.metal as MetalType, prices as any);
    if (spot === null) continue;
    const salePrice = pos.quantity * (pos.weightG / OZ_TO_G) * spot;
    const costPrice = pos.quantity * pos.purchasePrice;

    const purchaseDate = parseDate(pos.purchaseDate);
    if (!purchaseDate) continue;
    const years = calcYearsHeld(purchaseDate, now);
    if (years < 0) continue;

    const tax = computeTax(salePrice, costPrice, years);
    positionFiscals.push({
      pos,
      salePrice,
      costPrice,
      years,
      forfaitaireTax: tax.forfaitaire,
      pvTax: tax.plusValuesTax,
      netForf: salePrice - tax.forfaitaire,
      netPV: salePrice - tax.plusValuesTax,
      abatement: tax.abatement,
      isExempt: tax.isExempt,
      gainEur: salePrice - costPrice,
    });
  }

  if (positionFiscals.length === 0) return null;

  const totalSalePrice = positionFiscals.reduce((s, p) => s + p.salePrice, 0);
  const totalCostPrice = positionFiscals.reduce((s, p) => s + p.costPrice, 0);
  const grossGain = totalSalePrice - totalCostPrice;
  const totalForfaitaireTax = positionFiscals.reduce((s, p) => s + p.forfaitaireTax, 0);
  const totalPVTax = positionFiscals.reduce((s, p) => s + p.pvTax, 0);
  const netForfaitaire = totalSalePrice - totalForfaitaireTax;
  const netPlusValues = totalSalePrice - totalPVTax;
  const delta = Math.abs(netPlusValues - netForfaitaire);
  const isEquality = delta < REGIME_EQUALITY_THRESHOLD;
  const bestRegime = isEquality ? null : netPlusValues > netForfaitaire ? ('plusvalues' as const) : ('forfaitaire' as const);
  const bestNet = bestRegime === 'plusvalues' ? netPlusValues : netForfaitaire;

  return {
    totalSalePrice, totalCostPrice, grossGain,
    totalForfaitaireTax, totalPVTax,
    netForfaitaire, netPlusValues,
    bestNet, bestRegime, delta, isEquality,
    excludedFromFiscalCount,
    hasPartialEstimate: excludedFromFiscalCount > 0,
    positionFiscals,
  };
}
