import {
  MAX_CTA_NAME_LENGTH,
  autoFormatDate,
  formatDateDMY,
  formatPriceDisplay,
  toNum,
  truncateName,
} from '../ajouter-form';

describe('toNum', () => {
  it('parses integers', () => {
    expect(toNum('42')).toBe(42);
  });

  it('accepts comma as decimal separator', () => {
    expect(toNum('1,5')).toBe(1.5);
  });

  it('accepts dot as decimal separator', () => {
    expect(toNum('1.5')).toBe(1.5);
  });

  it('returns 0 for non-numeric input', () => {
    expect(toNum('abc')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(toNum('')).toBe(0);
  });
});

describe('autoFormatDate', () => {
  it('returns an empty string when input has no digits', () => {
    expect(autoFormatDate('abc')).toBe('');
  });

  it('keeps ≤ 2 digits as-is', () => {
    expect(autoFormatDate('1')).toBe('1');
    expect(autoFormatDate('15')).toBe('15');
  });

  it('inserts the first slash after day', () => {
    expect(autoFormatDate('1508')).toBe('15/08');
  });

  it('inserts both slashes for full date', () => {
    expect(autoFormatDate('15082024')).toBe('15/08/2024');
  });

  it('truncates beyond 8 digits', () => {
    expect(autoFormatDate('150820240000')).toBe('15/08/2024');
  });

  it('strips non-digit characters', () => {
    expect(autoFormatDate('15-08-2024')).toBe('15/08/2024');
  });
});

describe('formatDateDMY', () => {
  it('formats a Date to DD/MM/YYYY with zero padding', () => {
    expect(formatDateDMY(new Date(2024, 0, 5))).toBe('05/01/2024');
  });

  it('handles two-digit days and months', () => {
    expect(formatDateDMY(new Date(2024, 10, 25))).toBe('25/11/2024');
  });
});

describe('truncateName', () => {
  it('returns the input unchanged when shorter than max', () => {
    expect(truncateName('Court', 10)).toBe('Court');
  });

  it('cuts at the last space before the limit and appends an ellipsis', () => {
    expect(truncateName('Napoléon 20 Francs', 12)).toBe('Napoléon 20\u2026');
  });

  it('falls back to a hard cut when no space is available before the limit', () => {
    expect(truncateName('Krugerrand1oz', 5)).toBe('Kruge\u2026');
  });

  it('uses the default limit when none is provided', () => {
    const longLabel = 'A'.repeat(MAX_CTA_NAME_LENGTH + 5);
    const result = truncateName(longLabel);
    expect(result.length).toBe(MAX_CTA_NAME_LENGTH + 1); // max chars + ellipsis
    expect(result.endsWith('\u2026')).toBe(true);
  });
});

describe('formatPriceDisplay', () => {
  it('formats a positive numeric string via formatEuro', () => {
    const out = formatPriceDisplay('1700');
    expect(out).toContain('1');
    expect(out).toContain('7');
  });

  it('accepts comma as decimal separator', () => {
    const out = formatPriceDisplay('1700,50');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('leaves empty input empty', () => {
    expect(formatPriceDisplay('')).toBe('');
  });

  it('converts remaining dots to commas for invalid input', () => {
    expect(formatPriceDisplay('abc.def')).toBe('abc,def');
  });
});
