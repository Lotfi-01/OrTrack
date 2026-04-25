import { sanitizeAnalyticsProperties } from '../sanitizer';

describe('sanitizeAnalyticsProperties', () => {
  it('strips PII keys (email, name, phone, address)', () => {
    const result = sanitizeAnalyticsProperties({
      email: 'foo@bar.com',
      name: 'Alice',
      phone: '+33600000000',
      address: '1 rue de Paris',
      product_type: 'piece',
    });

    expect(result).toEqual({ product_type: 'piece' });
  });

  it('strips financial keys (price, amount, portfolio, value)', () => {
    const result = sanitizeAnalyticsProperties({
      price: 100,
      amount: 200,
      portfolio: 'main',
      value: 1234,
      metal: 'or',
    });

    expect(result).toEqual({ metal: 'or' });
  });

  it('strips keys by prefix (price_eur)', () => {
    const result = sanitizeAnalyticsProperties({
      price_eur: 100,
      product_type: 'lingot',
    });

    expect(result).toEqual({ product_type: 'lingot' });
  });

  it('strips keys by suffix (purchase_price)', () => {
    const result = sanitizeAnalyticsProperties({
      purchase_price: 100,
      product_type: 'piece',
    });

    expect(result).toEqual({ product_type: 'piece' });
  });

  it('preserves the safe boolean flag has_purchase_price', () => {
    const result = sanitizeAnalyticsProperties({
      has_purchase_price: true,
    });

    expect(result).toEqual({ has_purchase_price: true });
  });

  it('rejects nested objects', () => {
    const result = sanitizeAnalyticsProperties({
      // @ts-expect-error — runtime guard test
      meta: { nested: 'value' },
      metal: 'or',
    });

    expect(result).toEqual({ metal: 'or' });
  });

  it('rejects arrays', () => {
    const result = sanitizeAnalyticsProperties({
      // @ts-expect-error — runtime guard test
      items: ['a', 'b'],
      metal: 'or',
    });

    expect(result).toEqual({ metal: 'or' });
  });

  it('strips undefined values', () => {
    const result = sanitizeAnalyticsProperties({
      // @ts-expect-error — runtime guard test
      product_type: undefined,
      metal: 'or',
    });

    expect(result).toEqual({ metal: 'or' });
  });

  it('truncates strings longer than 120 chars', () => {
    const long = 'a'.repeat(200);
    const result = sanitizeAnalyticsProperties({ source: long });

    expect(typeof result.source).toBe('string');
    expect((result.source as string).length).toBe(120);
  });

  it('keeps strings up to 120 chars unchanged', () => {
    const exact = 'b'.repeat(120);
    const result = sanitizeAnalyticsProperties({ source: exact });

    expect(result.source).toBe(exact);
  });

  it('enforces a maximum of 20 properties', () => {
    const input: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      input[`key_${i}`] = 'v';
    }
    const result = sanitizeAnalyticsProperties(input);

    expect(Object.keys(result).length).toBe(20);
  });

  it('accepts allowed scalar types (string, number, boolean, null)', () => {
    const result = sanitizeAnalyticsProperties({
      a: 'text',
      b: 42,
      c: true,
      d: null,
    });

    expect(result).toEqual({ a: 'text', b: 42, c: true, d: null });
  });

  it('returns an empty object on undefined input', () => {
    expect(sanitizeAnalyticsProperties(undefined)).toEqual({});
  });

  it('rejects non-finite numbers', () => {
    const result = sanitizeAnalyticsProperties({
      a: NaN,
      b: Infinity,
      c: -Infinity,
      metal: 'or',
    });

    expect(result).toEqual({ metal: 'or' });
  });

  it('keeps safe generic fields (product_type, metal, source)', () => {
    const result = sanitizeAnalyticsProperties({
      product_type: 'piece',
      metal: 'or',
      source: 'home',
    });

    expect(result).toEqual({
      product_type: 'piece',
      metal: 'or',
      source: 'home',
    });
  });
});
