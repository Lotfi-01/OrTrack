// Pure helper for purchase price input normalization in the Add Position
// screen. Mirrors the historical onBlur normalization that the screen has
// always run on the TextInput's local value, so that a direct CTA tap
// without a keyboard-dismiss can commit a clean canonical value before
// reading it for save. The helper does not own React state; the caller
// applies its result to setPurchasePrice / setPriceDisplay / setPriceKey
// in the same order as before.

export type NormalizedPriceInput = {
  raw: string;
  normalized: string;
  numericValue: number | null;
  displayValue: string;
};

export function normalizePurchasePriceInput(
  input: string,
  formatPositiveValue: (value: number) => string,
): NormalizedPriceInput {
  let n = input;
  n = n.replace(/[\s\u00A0]+/g, '');
  n = n.replace(/,/g, '.');
  n = n.replace(/[^0-9.]/g, '');
  const dot = n.indexOf('.');
  if (dot !== -1) {
    n = n.slice(0, dot + 1) + n.slice(dot + 1).replace(/\./g, '');
  }
  const parts = n.split('.');
  if (parts.length === 2 && parts[1].length > 2) {
    n = parts[0] + '.' + parts[1].slice(0, 2);
  }

  const num = parseFloat(n);
  const isPositive = !isNaN(num) && num > 0;
  const displayValue = isPositive
    ? formatPositiveValue(num)
    : n.replace(/\./g, ',');

  return {
    raw: input,
    normalized: n,
    numericValue: isPositive ? num : null,
    displayValue,
  };
}