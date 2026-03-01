import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ortrack:price_history';
const MAX_POINTS = 200;

export type PricePoint = {
  timestamp: number;
  gold: number;
  silver: number;
  platinum: number;
  palladium: number;
  copper: number;
};

export async function savePricePoint(prices: {
  gold: number | null;
  silver: number | null;
  platinum: number | null;
  palladium: number | null;
  copper: number | null;
}): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const history: PricePoint[] = raw ? JSON.parse(raw) : [];

    history.push({
      timestamp: Date.now(),
      gold: prices.gold ?? 0,
      silver: prices.silver ?? 0,
      platinum: prices.platinum ?? 0,
      palladium: prices.palladium ?? 0,
      copper: prices.copper ?? 0,
    });

    // Keep only the last MAX_POINTS entries
    const trimmed = history.length > MAX_POINTS ? history.slice(-MAX_POINTS) : history;

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Silent fail — do not break the main fetch flow
  }
}

export async function loadPriceHistory(): Promise<PricePoint[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
