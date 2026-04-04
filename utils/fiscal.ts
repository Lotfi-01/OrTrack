import { TAX } from '@/constants/tax';
import { parseDate } from '@/utils/tax-helpers';

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

/** 0% si < 3 ans, 5%/an dès la 3e année, plafonné à 100% (22 ans) */
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
