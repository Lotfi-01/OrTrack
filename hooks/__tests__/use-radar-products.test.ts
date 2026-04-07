// Mock supabase to avoid AsyncStorage import error in test
jest.mock('@/lib/supabase', () => ({ supabase: null }));

import { downsample } from '../use-radar-products';

describe('downsample', () => {
  test('10 points target 20 → no reduction', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      primePct: i,
    }));
    expect(downsample(points, 20)).toHaveLength(10);
  });

  test('90 points target 20 → ~20 points', () => {
    const points = Array.from({ length: 90 }, (_, i) => ({
      date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      primePct: i,
    }));
    const result = downsample(points, 20);
    expect(result.length).toBeGreaterThanOrEqual(18);
    expect(result.length).toBeLessThanOrEqual(22);
  });

  test('last point always included', () => {
    const points = Array.from({ length: 90 }, (_, i) => ({
      date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      primePct: i,
    }));
    const result = downsample(points, 20);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });
});
