import { computePercentile, deriveSignal, computeAvgMinMax } from '../radar-stats';

describe('computePercentile', () => {
  test('empty array → null', () => expect(computePercentile(5, [])).toBeNull());
  test('single element → 100', () => expect(computePercentile(5, [5])).toBe(100));

  test('min of series → 0', () => expect(computePercentile(1, [1, 2, 3, 4, 5])).toBe(0));
  test('max of series → 100', () => expect(computePercentile(5, [1, 2, 3, 4, 5])).toBe(100));
  test('median → 50', () => expect(computePercentile(3, [1, 2, 3, 4, 5])).toBe(50));

  test('duplicates at minimum → percentile > 0 (lastIndexOf)', () => {
    expect(computePercentile(1, [1, 1, 2, 3, 4])).toBe(25); // lastIndex=1, 1/(4)=25%
  });

  test('value absent above max → 100', () => {
    expect(computePercentile(100, [1, 2, 3, 4, 5])).toBe(100);
  });

  test('value absent below min → 0', () => {
    expect(computePercentile(0, [1, 2, 3, 4, 5])).toBe(0);
  });
});

describe('deriveSignal', () => {
  test('percentile 0 → low', () => expect(deriveSignal(0, true)).toBe('low'));
  test('percentile 24 → low', () => expect(deriveSignal(24, true)).toBe('low'));
  test('percentile 25 → normal', () => expect(deriveSignal(25, true)).toBe('normal'));
  test('percentile 50 → normal', () => expect(deriveSignal(50, true)).toBe('normal'));
  test('percentile 75 → normal', () => expect(deriveSignal(75, true)).toBe('normal'));
  test('percentile 76 → high', () => expect(deriveSignal(76, true)).toBe('high'));
  test('percentile 100 → high', () => expect(deriveSignal(100, true)).toBe('high'));
  test('null percentile → null', () => expect(deriveSignal(null, true)).toBeNull());
  test('dataQuality not ok → null', () => expect(deriveSignal(50, false)).toBeNull());
});

describe('computeAvgMinMax', () => {
  test('empty array → all null', () => {
    expect(computeAvgMinMax([])).toEqual({ avg: null, min: null, max: null });
  });

  test('[10, 20, 30] → avg 20, min 10, max 30', () => {
    expect(computeAvgMinMax([10, 20, 30])).toEqual({ avg: 20, min: 10, max: 30 });
  });
});
