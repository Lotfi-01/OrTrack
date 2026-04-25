import { normalizePurchasePriceInput } from '../price-input';

const format = (value: number) => `F(${value})`;

describe('normalizePurchasePriceInput', () => {
  it('returns the original input as raw, unchanged', () => {
    const result = normalizePurchasePriceInput('abc12,3€', format);
    expect(result.raw).toBe('abc12,3€');
  });

  it('handles "" -> empty normalized, empty display, null numericValue', () => {
    const result = normalizePurchasePriceInput('', format);
    expect(result.normalized).toBe('');
    expect(result.displayValue).toBe('');
    expect(result.numericValue).toBeNull();
  });

  it('handles "   " -> empty normalized, empty display, null numericValue', () => {
    const result = normalizePurchasePriceInput('   ', format);
    expect(result.normalized).toBe('');
    expect(result.displayValue).toBe('');
    expect(result.numericValue).toBeNull();
  });

  it('handles NBSP-only whitespace -> empty normalized, empty display, null numericValue', () => {
    const result = normalizePurchasePriceInput('  ', format);
    expect(result.normalized).toBe('');
    expect(result.displayValue).toBe('');
    expect(result.numericValue).toBeNull();
  });

  it('handles "1234"', () => {
    const result = normalizePurchasePriceInput('1234', format);
    expect(result.normalized).toBe('1234');
    expect(result.displayValue).toBe('F(1234)');
    expect(result.numericValue).toBe(1234);
  });

  it('handles "1234,56" with comma decimal', () => {
    const result = normalizePurchasePriceInput('1234,56', format);
    expect(result.normalized).toBe('1234.56');
    expect(result.displayValue).toBe('F(1234.56)');
    expect(result.numericValue).toBe(1234.56);
  });

  it('handles "1234.56" with dot decimal', () => {
    const result = normalizePurchasePriceInput('1234.56', format);
    expect(result.normalized).toBe('1234.56');
    expect(result.displayValue).toBe('F(1234.56)');
    expect(result.numericValue).toBe(1234.56);
  });

  it('truncates "1234.567" to two decimals', () => {
    const result = normalizePurchasePriceInput('1234.567', format);
    expect(result.normalized).toBe('1234.56');
    expect(result.displayValue).toBe('F(1234.56)');
    expect(result.numericValue).toBe(1234.56);
  });

  it('collapses multiple dots in "1.2.3" by keeping the first dot', () => {
    const result = normalizePurchasePriceInput('1.2.3', format);
    expect(result.normalized).toBe('1.23');
    expect(result.displayValue).toBe('F(1.23)');
    expect(result.numericValue).toBe(1.23);
  });

  it('strips letters and currency symbols from "abc12,3€"', () => {
    const result = normalizePurchasePriceInput('abc12,3€', format);
    expect(result.normalized).toBe('12.3');
    expect(result.displayValue).toBe('F(12.3)');
    expect(result.numericValue).toBe(12.3);
  });

  it('handles "0" as non-positive (display "0", numericValue null)', () => {
    const result = normalizePurchasePriceInput('0', format);
    expect(result.normalized).toBe('0');
    expect(result.displayValue).toBe('0');
    expect(result.numericValue).toBeNull();
  });

  it('handles "0.00" as non-positive (display "0,00", numericValue null)', () => {
    const result = normalizePurchasePriceInput('0.00', format);
    expect(result.normalized).toBe('0.00');
    expect(result.displayValue).toBe('0,00');
    expect(result.numericValue).toBeNull();
  });

  it('strips leading minus from "-123" (no negative-number support)', () => {
    const result = normalizePurchasePriceInput('-123', format);
    expect(result.normalized).toBe('123');
    expect(result.displayValue).toBe('F(123)');
    expect(result.numericValue).toBe(123);
  });

  it('strips leading minus from "-0,50" and emits the canonical positive value', () => {
    const result = normalizePurchasePriceInput('-0,50', format);
    expect(result.normalized).toBe('0.50');
    expect(result.displayValue).toBe('F(0.5)');
    expect(result.numericValue).toBe(0.5);
  });

  it('strips leading minus from "-.5" and parses as 0.5', () => {
    const result = normalizePurchasePriceInput('-.5', format);
    expect(result.normalized).toBe('.5');
    expect(result.displayValue).toBe('F(0.5)');
    expect(result.numericValue).toBe(0.5);
  });

  it('keeps leading zeros in normalized but parses to canonical numeric for display', () => {
    const result = normalizePurchasePriceInput('0012,30', format);
    expect(result.normalized).toBe('0012.30');
    expect(result.displayValue).toBe('F(12.3)');
    expect(result.numericValue).toBe(12.3);
  });

  it('strips ASCII space from "1 234,56"', () => {
    const result = normalizePurchasePriceInput('1 234,56', format);
    expect(result.normalized).toBe('1234.56');
    expect(result.displayValue).toBe('F(1234.56)');
    expect(result.numericValue).toBe(1234.56);
  });

  it('handles lone "." -> normalized ".", display ",", numericValue null', () => {
    const result = normalizePurchasePriceInput('.', format);
    expect(result.normalized).toBe('.');
    expect(result.displayValue).toBe(',');
    expect(result.numericValue).toBeNull();
  });

  it('handles lone "," -> normalized ".", display ",", numericValue null', () => {
    const result = normalizePurchasePriceInput(',', format);
    expect(result.normalized).toBe('.');
    expect(result.displayValue).toBe(',');
    expect(result.numericValue).toBeNull();
  });

  it('handles "1." -> normalized "1.", display from format(1)', () => {
    const result = normalizePurchasePriceInput('1.', format);
    expect(result.normalized).toBe('1.');
    expect(result.displayValue).toBe('F(1)');
    expect(result.numericValue).toBe(1);
  });

  it('handles ".5" -> normalized ".5", display from format(0.5)', () => {
    const result = normalizePurchasePriceInput('.5', format);
    expect(result.normalized).toBe('.5');
    expect(result.displayValue).toBe('F(0.5)');
    expect(result.numericValue).toBe(0.5);
  });

  it('handles mixed "1,2.3" by collapsing to "1.23"', () => {
    const result = normalizePurchasePriceInput('1,2.3', format);
    expect(result.normalized).toBe('1.23');
    expect(result.displayValue).toBe('F(1.23)');
    expect(result.numericValue).toBe(1.23);
  });

  it('handles ambiguous "1,234.56" by collapsing extra dots and truncating to two decimals', () => {
    const result = normalizePurchasePriceInput('1,234.56', format);
    expect(result.normalized).toBe('1.23');
    expect(result.displayValue).toBe('F(1.23)');
    expect(result.numericValue).toBe(1.23);
  });

  it('strips NBSP whitespace from "1 234,56" (no-blur historical fix)', () => {
    const result = normalizePurchasePriceInput('1 234,56', format);
    expect(result.normalized).toBe('1234.56');
    expect(result.displayValue).toBe('F(1234.56)');
    expect(result.numericValue).toBe(1234.56);
  });
});
