jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getAllKeys: jest.fn(async () => Array.from(store.keys())),
    setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => { store.delete(key); }),
    multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => store.delete(k)); }),
    clear: jest.fn(async () => { store.clear(); }),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { isValidPosition, resetPositionsCache } from '@/hooks/use-positions';

const storageMock = AsyncStorage as typeof AsyncStorage & { __store: Map<string, string> };

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePosition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pos-1',
    metal: 'or',
    product: 'Krugerrand 1oz',
    weightG: 31.1,
    quantity: 1,
    purchasePrice: 2500,
    purchaseDate: '15/03/2024',
    createdAt: '2024-03-15T10:00:00.000Z',
    ...overrides,
  };
}

// ── P1-2 : isValidPosition ───────────────────────────────────────────────────

describe('isValidPosition', () => {
  it('accepte une position complète et valide', () => {
    expect(isValidPosition(makePosition())).toBe(true);
  });

  it('rejette weightG = 0', () => {
    expect(isValidPosition(makePosition({ weightG: 0 }))).toBe(false);
  });

  it('rejette weightG = undefined', () => {
    expect(isValidPosition(makePosition({ weightG: undefined }))).toBe(false);
  });

  it('rejette weightG = NaN', () => {
    expect(isValidPosition(makePosition({ weightG: NaN }))).toBe(false);
  });

  it('rejette weightG = Infinity', () => {
    expect(isValidPosition(makePosition({ weightG: Infinity }))).toBe(false);
  });

  it('rejette quantity = -1', () => {
    expect(isValidPosition(makePosition({ quantity: -1 }))).toBe(false);
  });

  it('rejette quantity = 0', () => {
    expect(isValidPosition(makePosition({ quantity: 0 }))).toBe(false);
  });

  it('rejette quantity non entier', () => {
    expect(isValidPosition(makePosition({ quantity: 1.5 }))).toBe(false);
  });

  it('rejette purchasePrice = NaN', () => {
    expect(isValidPosition(makePosition({ purchasePrice: NaN }))).toBe(false);
  });

  it('accepte purchasePrice = 0 (position gratuite)', () => {
    expect(isValidPosition(makePosition({ purchasePrice: 0 }))).toBe(true);
  });

  it('rejette metal non supporté', () => {
    expect(isValidPosition(makePosition({ metal: 'unobtanium' }))).toBe(false);
  });

  it('rejette id vide', () => {
    expect(isValidPosition(makePosition({ id: '' }))).toBe(false);
  });

  it('rejette purchaseDate trop courte', () => {
    expect(isValidPosition(makePosition({ purchaseDate: '2024' }))).toBe(false);
  });

  it('filtre null dans un tableau de positions', () => {
    expect(isValidPosition(null)).toBe(false);
  });

  it('filtre undefined', () => {
    expect(isValidPosition(undefined)).toBe(false);
  });

  it('filtre un nombre', () => {
    expect(isValidPosition(42)).toBe(false);
  });

  it('filtre une chaîne', () => {
    expect(isValidPosition('position')).toBe(false);
  });
});

// ── AsyncStorage edge cases ──────────────────────────────────────────────────

describe('parsePositions edge cases (via isValidPosition)', () => {
  beforeEach(() => {
    storageMock.__store.clear();
    resetPositionsCache();
  });

  it('AsyncStorage null → pas de crash (clé inexistante)', async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.positions);
    expect(raw).toBeNull();
  });

  it('JSON invalide → isValidPosition rejette la chaîne', () => {
    expect(isValidPosition('NOT_JSON{{{')).toBe(false);
  });

  it('filtre les positions corrompues et garde les valides', () => {
    const valid1 = makePosition({ id: 'v1' });
    const valid2 = makePosition({ id: 'v2', metal: 'argent' });
    const corrupted = makePosition({ id: 'c1', weightG: 0 });
    const data = [valid1, corrupted, valid2];
    const filtered = data.filter(isValidPosition);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((p) => p.id)).toEqual(['v1', 'v2']);
  });

  it('3 positions dont 1 corrompue → seules 2 chargées', () => {
    const positions = [
      makePosition({ id: '1', weightG: 31.1 }),
      makePosition({ id: '2', weightG: -5 }),
      makePosition({ id: '3', weightG: 10 }),
    ];
    expect(positions.filter(isValidPosition)).toHaveLength(2);
  });
});

// ── resetPositionsCache ──────────────────────────────────────────────────────

describe('resetPositionsCache', () => {
  it('remet le cache et la queue sans crash', () => {
    expect(() => resetPositionsCache()).not.toThrow();
  });
});
