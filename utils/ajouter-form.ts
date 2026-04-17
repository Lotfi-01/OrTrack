import { formatEuro } from './format';

export const MAX_CTA_NAME_LENGTH = 20;

/** Tronque au dernier espace avant la limite pour éviter une coupure en plein mot. */
export function truncateName(s: string, max: number = MAX_CTA_NAME_LENGTH): string {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(' ', max);
  return (cut > 0 ? s.slice(0, cut) : s.slice(0, max)) + '\u2026';
}

export function toNum(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0;
}

export function formatPriceDisplay(val: string): string {
  const num = parseFloat(val.replace(',', '.'));
  return !isNaN(num) && num > 0 ? formatEuro(num) : val.replace(/\./g, ',');
}

export function autoFormatDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  if (digits.length > 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

export function formatDateDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
