import { countGaps, detectDataQuality, isValidRadarPoint } from '../radar-quality';

describe('countGaps', () => {
  test('empty array → 0', () => expect(countGaps([])).toBe(0));
  test('single date → 0', () => expect(countGaps(['2025-01-01'])).toBe(0));

  test('consecutive weekdays (<=5 days) → 0 gaps', () => {
    expect(countGaps(['2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09', '2025-01-10'])).toBe(0);
  });

  test('weekend gap (2 days) → 0 gaps', () => {
    expect(countGaps(['2025-01-03', '2025-01-06'])).toBe(0); // Fri → Mon = 3 days
  });

  test('weekend + holiday (5 days) → 0 gaps', () => {
    expect(countGaps(['2025-01-01', '2025-01-06'])).toBe(0); // 5 days
  });

  test('6 day gap → 1 gap', () => {
    expect(countGaps(['2025-01-01', '2025-01-07'])).toBe(1); // 6 days
  });

  test('multiple gaps', () => {
    expect(countGaps([
      '2025-01-01', '2025-01-10', // gap 9 days
      '2025-01-20', // gap 10 days
      '2025-01-21', // no gap
    ])).toBe(2);
  });
});

describe('detectDataQuality', () => {
  test('null → missing', () => expect(detectDataQuality(null)).toBe('missing'));
  test('[] → missing', () => expect(detectDataQuality([])).toBe('missing'));

  test('6 points → insufficient_history', () => {
    const history = Array.from({ length: 6 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      primePct: 5,
    }));
    expect(detectDataQuality(history)).toBe('insufficient_history');
  });

  test('7 points without gaps → ok', () => {
    const history = Array.from({ length: 7 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      primePct: 5,
    }));
    expect(detectDataQuality(history)).toBe('ok');
  });

  test('7 points with 4 gaps → gaps', () => {
    const history = [
      { date: '2025-01-01', primePct: 5 },
      { date: '2025-01-08', primePct: 5 }, // gap 7
      { date: '2025-01-15', primePct: 5 }, // gap 7
      { date: '2025-01-22', primePct: 5 }, // gap 7
      { date: '2025-01-29', primePct: 5 }, // gap 7
      { date: '2025-02-01', primePct: 5 },
      { date: '2025-02-02', primePct: 5 },
    ];
    expect(detectDataQuality(history)).toBe('gaps');
  });
});

describe('isValidRadarPoint', () => {
  test('within bounds → true', () => {
    expect(isValidRadarPoint(5, 'krugerrand_1oz')).toBe(true);
  });

  test('below min → false', () => {
    expect(isValidRadarPoint(-10, 'krugerrand_1oz')).toBe(false);
  });

  test('above max → false', () => {
    expect(isValidRadarPoint(30, 'krugerrand_1oz')).toBe(false);
  });

  test('at exact min → true', () => {
    expect(isValidRadarPoint(-5, 'krugerrand_1oz')).toBe(true);
  });

  test('at exact max → true', () => {
    expect(isValidRadarPoint(25, 'krugerrand_1oz')).toBe(true);
  });
});
