import { TAX } from '@/constants/tax';

export type TaxResult = {
  forfaitaire: number;
  plusValue: number;
  taxablePV: number;
  plusValuesTax: number;
  abatement: number;
  years: number;
  isExempt: boolean;
};

export function parseDate(str: string): Date | null {
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  const date = new Date(y, m - 1, d);
  const isValid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return isValid ? date : null;
}

export function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function calcYearsHeld(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
}

export function computeTax(salePrice: number, costPrice: number, years: number): TaxResult {
  const forfaitaire = salePrice * TAX.forfaitaireRate;
  const plusValue = salePrice - costPrice;
  let abatement = 0;
  let isExempt = false;
  if (years >= TAX.fullExemptionYear) {
    abatement = 1;
    isExempt = true;
  } else if (years >= TAX.abatementStartYear) {
    abatement = Math.min(1, (years - (TAX.abatementStartYear - 1)) * TAX.abatementPerYear);
  }
  const taxablePV = Math.max(0, plusValue) * (1 - abatement);
  const plusValuesTax = isExempt || plusValue <= 0 ? 0 : taxablePV * TAX.plusValueRate;
  return { forfaitaire, plusValuesTax, plusValue, abatement, years, isExempt, taxablePV };
}
