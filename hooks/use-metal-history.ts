import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const CACHE_PREFIX = '@ortrack:history_cache_';
const CACHE_TTL_MS = 60 * 60 * 1000;
const VALID_METALS = ['gold', 'silver', 'platinum', 'palladium', 'copper'] as const;

export type PricePoint = {
  timestamp: number;
  date: string;
  gold: number;
  silver: number;
  platinum: number;
  palladium: number;
  copper: number;
};

type CacheEntry = {
  data: PricePoint[];
  timestamp: number;
};

export type HistoryPeriod = '1J' | '1M' | '3M' | '1A' | '5A' | '10A' | '20A';

export const LONG_TERM_PERIODS: HistoryPeriod[] = ['10A', '20A'];

function periodToStartDate(period: HistoryPeriod): string | null {
  if (period === '1J') return null;
  const now = new Date();
  if (period === '1M') now.setMonth(now.getMonth() - 1);
  else if (period === '3M') now.setMonth(now.getMonth() - 3);
  else if (period === '1A') now.setFullYear(now.getFullYear() - 1);
  else if (period === '5A') now.setFullYear(now.getFullYear() - 5);
  else if (period === '10A') now.setFullYear(now.getFullYear() - 10);
  else if (period === '20A') now.setFullYear(now.getFullYear() - 20);
  return now.toISOString().split('T')[0];
}

export async function loadPriceHistory(
  period: HistoryPeriod = '1M',
  currency: string = 'EUR',
  metal?: string
): Promise<PricePoint[]> {
  if (period === '1J') {
    try {
      const raw = await AsyncStorage.getItem('@ortrack:price_history');
      const points: any[] = raw ? JSON.parse(raw) : [];
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      return points
        .filter((p: any) => p.timestamp >= cutoff)
        .map((p: any) => ({
          timestamp: p.timestamp,
          date: p.date ?? new Date(p.timestamp).toISOString().split('T')[0],
          gold: p.gold ?? 0,
          silver: p.silver ?? 0,
          platinum: p.platinum ?? 0,
          palladium: p.palladium ?? 0,
          copper: p.copper ?? 0,
        }));
    } catch {
      return [];
    }
  }

  const effectiveCurrency = LONG_TERM_PERIODS.includes(period) ? 'USD' : currency;
  const cacheKey = `${CACHE_PREFIX}${period}_${effectiveCurrency}${metal ? '_' + metal : ''}`;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.data;
      }
    }
  } catch {}

  const startDate = periodToStartDate(period);
  if (!startDate) return [];

  const metalFilter = metal ? `&metal=eq.${metal}` : '';

  try {
    const allRows: Array<{
      date: string;
      metal: string;
      price_usd: number;
      price_eur: number | null;
      price_chf: number | null;
    }> = [];

    let offset = 0;
    const pageSize = 1000;
    const MAX_PAGES = 30;
    let pageCount = 0;

    while (pageCount < MAX_PAGES) {
      const pagedUrl = `${SUPABASE_URL}/rest/v1/metal_prices_daily?select=date,metal,price_usd,price_eur,price_chf&date=gte.${startDate}${metalFilter}&order=date.asc&limit=${pageSize}&offset=${offset}`;
      const res = await fetch(pagedUrl, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
      const page = await res.json();
      if (!Array.isArray(page) || page.length === 0) break;
      allRows.push(...page);
      pageCount++;
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    const byDate: Record<string, Partial<PricePoint>> = {};
    for (const row of allRows) {
      if (!VALID_METALS.includes(row.metal as any)) continue;
      if (!byDate[row.date]) {
        byDate[row.date] = {
          date: row.date,
          timestamp: new Date(row.date).getTime(),
          gold: 0, silver: 0, platinum: 0, palladium: 0, copper: 0,
        };
      }
      let price: number;
      if (effectiveCurrency === 'USD') {
        price = row.price_usd ?? 0;
      } else if (effectiveCurrency === 'CHF') {
        price = row.price_chf ?? row.price_usd ?? 0;
      } else {
        price = row.price_eur ?? row.price_usd ?? 0;
      }
      (byDate[row.date] as any)[row.metal] = price;
    }

    const result = Object.values(byDate)
      .filter(p => {
        if (metal && VALID_METALS.includes(metal as any)) {
          const val = p[metal as keyof PricePoint];
          return typeof val === 'number' && val > 0;
        }
        return (p.gold ?? 0) > 0 || (p.silver ?? 0) > 0;
      })
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)) as PricePoint[];

    await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: result, timestamp: Date.now() } as CacheEntry));
    return result;

  } catch {
    return [];
  }
}

export async function savePricePoint(prices: {
  gold: number | null;
  silver: number | null;
  platinum: number | null;
  palladium: number | null;
  copper: number | null;
}): Promise<void> {
  const STORAGE_KEY = '@ortrack:price_history';
  const MAX_POINTS = 200;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const history: PricePoint[] = raw ? JSON.parse(raw) : [];
    history.push({
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      gold: prices.gold ?? 0,
      silver: prices.silver ?? 0,
      platinum: prices.platinum ?? 0,
      palladium: prices.palladium ?? 0,
      copper: prices.copper ?? 0,
    });
    const trimmed = history.length > MAX_POINTS ? history.slice(-MAX_POINTS) : history;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}
