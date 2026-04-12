import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/storage-keys';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CACHE_TTL_MS = 60 * 60 * 1000;
const VALID_METALS = ['gold', 'silver', 'platinum', 'palladium'] as const;

export type PricePoint = {
  timestamp: number;
  date: string;
  gold: number;
  silver: number;
  platinum: number;
  palladium: number;
};

export type PriceHistoryResult = {
  data: PricePoint[];
  /** Devise réellement utilisée dans la série — 'EUR', 'USD' ou 'CHF'.
   * Si un fallback EUR→USD a été détecté, la série entière est recalculée
   * en USD et actualCurrency vaut 'USD'. */
  actualCurrency: string;
};

type CacheEntry = {
  data: PricePoint[];
  actualCurrency: string;
  timestamp: number;
};

export type HistoryPeriod = '1S' | '1M' | '3M' | '1A' | '5A' | '10A' | '20A';

export const LONG_TERM_PERIODS: HistoryPeriod[] = ['10A', '20A'];

function periodToStartDate(period: HistoryPeriod): string {
  const now = new Date();
  if (period === '1S') now.setDate(now.getDate() - 7);
  else if (period === '1M') now.setMonth(now.getMonth() - 1);
  else if (period === '3M') now.setMonth(now.getMonth() - 3);
  else if (period === '1A') now.setFullYear(now.getFullYear() - 1);
  else if (period === '5A') now.setFullYear(now.getFullYear() - 5);
  else if (period === '10A') now.setFullYear(now.getFullYear() - 10);
  else if (period === '20A') now.setFullYear(now.getFullYear() - 20);
  return now.toISOString().split('T')[0];
}

type RawRow = {
  date: string;
  metal: string;
  price_usd: number;
  price_eur: number | null;
  price_chf: number | null;
};

/** Construit les PricePoints à partir des lignes brutes dans la devise demandée. */
function buildSeries(
  allRows: RawRow[],
  currency: 'EUR' | 'USD' | 'CHF',
  metal?: string,
): PricePoint[] {
  const byDate: Record<string, Partial<PricePoint>> = {};
  for (const row of allRows) {
    if (!VALID_METALS.includes(row.metal as any)) continue;
    if (!byDate[row.date]) {
      byDate[row.date] = {
        date: row.date,
        timestamp: new Date(row.date).getTime(),
        gold: 0, silver: 0, platinum: 0, palladium: 0,
      };
    }
    let price: number;
    if (currency === 'USD') {
      price = row.price_usd ?? 0;
    } else if (currency === 'CHF') {
      price = row.price_chf ?? 0;
    } else {
      price = row.price_eur ?? 0;
    }
    (byDate[row.date] as any)[row.metal] = price;
  }

  return Object.values(byDate)
    .filter(p => {
      if (metal && VALID_METALS.includes(metal as any)) {
        const val = p[metal as keyof PricePoint];
        return typeof val === 'number' && val > 0;
      }
      return (p.gold ?? 0) > 0 || (p.silver ?? 0) > 0;
    })
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)) as PricePoint[];
}

export async function loadPriceHistory(
  period: HistoryPeriod = '1M',
  currency: string = 'EUR',
  metal?: string
): Promise<PriceHistoryResult> {
  const EMPTY: PriceHistoryResult = { data: [], actualCurrency: currency };

  // Long-term periods always use USD (price_eur absent historiquement)
  const requestedCurrency = LONG_TERM_PERIODS.includes(period) ? 'USD' : currency;
  const cacheKey = `${STORAGE_KEYS.historyCachePrefix}${period}_${requestedCurrency}${metal ? '_' + metal : ''}`;

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return EMPTY;

    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return { data: entry.data, actualCurrency: entry.actualCurrency ?? requestedCurrency };
      }
    }
  } catch {}

  const startDate = periodToStartDate(period);
  const metalFilter = metal ? `&metal=eq.${metal}` : '';

  try {
    const allRows: RawRow[] = [];

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

    // Détection de fallback : si la devise demandée est EUR et qu'au moins un
    // point a price_eur = null, toute la série est reconstruite en USD pour
    // éviter un mélange silencieux EUR/USD dans le même graphique.
    let actualCurrency = requestedCurrency;
    if (requestedCurrency === 'EUR') {
      const hasEurGap = allRows.some(r => r.price_eur == null);
      if (hasEurGap) actualCurrency = 'USD';
    } else if (requestedCurrency === 'CHF') {
      const hasChfGap = allRows.some(r => r.price_chf == null);
      if (hasChfGap) actualCurrency = 'USD';
    }

    const result = buildSeries(allRows, actualCurrency as 'EUR' | 'USD' | 'CHF', metal);

    if (result.length > 0) {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        data: result,
        actualCurrency,
        timestamp: Date.now(),
      } as CacheEntry));
    }
    return { data: result, actualCurrency };

  } catch {
    return EMPTY;
  }
}

export async function savePricePoint(prices: {
  gold: number | null;
  silver: number | null;
  platinum: number | null;
  palladium: number | null;
}): Promise<void> {
  const MAX_POINTS = 200;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.priceHistory);
    const history: PricePoint[] = raw ? JSON.parse(raw) : [];
    history.push({
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      gold: prices.gold ?? 0,
      silver: prices.silver ?? 0,
      platinum: prices.platinum ?? 0,
      palladium: prices.palladium ?? 0,
    });
    const trimmed = history.length > MAX_POINTS ? history.slice(-MAX_POINTS) : history;
    await AsyncStorage.setItem(STORAGE_KEYS.priceHistory, JSON.stringify(trimmed));
  } catch {}
}
