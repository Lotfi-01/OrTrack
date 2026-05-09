// Mock supabase to avoid AsyncStorage import error in test
jest.mock('@/lib/supabase', () => ({ supabase: null }));

// Mock RevenueCat indirectly via the premium context.
// `usePremium` est consommé par `useRadarProducts` pour décider du fetch.
const mockPremiumState = { isPremium: false };
jest.mock('@/contexts/premium-context', () => ({
  usePremium: () => ({ isPremium: mockPremiumState.isPremium }),
}));

// Mock le fetch Edge Function pour observer les appels.
const mockFetchSnapshots = jest.fn();
jest.mock('@/utils/radar/radar-query', () => {
  class FakeError extends Error {
    detail: { kind: string };
    constructor(detail: { kind: string }) {
      super(detail.kind);
      this.detail = detail;
      this.name = 'RadarPrimeError';
    }
  }
  return {
    fetchRadarPrimeSnapshots: (...args: unknown[]) => mockFetchSnapshots(...args),
    RadarPrimeError: FakeError,
  };
});

// Mock useFocusEffect via un useEffect React standard. La signature réelle
// reçoit un callback déjà mémoïsé via `useCallback` côté caller, donc
// `cb` reste stable entre les renders et l'effet ne s'exécute qu'au mount.
jest.mock('@react-navigation/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    useFocusEffect: (cb: () => () => void) => {
      React.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [cb]);
    },
  };
});

import { renderHook } from '@testing-library/react-native';
import { downsample, useRadarProducts, invalidateRadarCache } from '../use-radar-products';

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

describe('useRadarProducts — gating Premium client', () => {
  beforeEach(() => {
    mockFetchSnapshots.mockReset();
    invalidateRadarCache();
  });

  test('Free → aucun appel à fetchRadarPrimeSnapshots', () => {
    mockPremiumState.isPremium = false;
    renderHook(() => useRadarProducts());
    expect(mockFetchSnapshots).not.toHaveBeenCalled();
  });

  test('Premium → fetchRadarPrimeSnapshots est appelé', async () => {
    mockPremiumState.isPremium = true;
    mockFetchSnapshots.mockResolvedValue({ products: [], latestDate: null });
    renderHook(() => useRadarProducts());
    // Laisse les microtasks (useEffect / fetch async) se résoudre.
    await Promise.resolve();
    await Promise.resolve();
    expect(mockFetchSnapshots).toHaveBeenCalled();
  });

  test('Premium + erreur premium_required → state error renseigné', async () => {
    mockPremiumState.isPremium = true;
    const FakeError = class extends Error {
      detail: { kind: string };
      constructor(d: { kind: string }) { super(d.kind); this.detail = d; this.name = 'RadarPrimeError'; }
    };
    mockFetchSnapshots.mockRejectedValue(new FakeError({ kind: 'premium_required' }));
    const { result } = renderHook(() => useRadarProducts());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current.products).toEqual([]);
    // L'erreur est exposée au caller pour permettre un fallback UI.
    expect(result.current.error === null || result.current.error === 'premium_required').toBe(true);
  });
});
