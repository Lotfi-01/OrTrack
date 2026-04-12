import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { savePricePoint } from './use-metal-history';
import { STORAGE_KEYS } from '@/constants/storage-keys';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const CACHE_TTL_MS = 29 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;

export type SpotPrices = {
  gold: number | null;
  silver: number | null;
  platinum: number | null;
  palladium: number | null;
};

export type UseSpotPricesResult = {
  prices: SpotPrices;
  pricesEur: SpotPrices;
  pricesUsd: SpotPrices;
  loading: boolean;       // true UNIQUEMENT au premier chargement (aucun prix dispo)
  refreshing: boolean;    // true lors des refreshs silencieux en arrière-plan
  error: string | null;
  lastUpdated: Date | null;
  historyReady: boolean;
  refresh: () => void;
  currency: string;
  currencySymbol: string;
};

type SpotRow = {
  metal: string;
  price_usd: number;
  price_eur: number;
  price_chf: number;
};

type CacheEntry = {
  prices: SpotPrices;
  pricesEur: SpotPrices;
  pricesUsd: SpotPrices;
  currency: string;
  timestamp: number;
};

function getCurrencySymbol(c: string): string {
  if (c === 'USD') return '$';
  if (c === 'CHF') return 'CHF';
  return '€';
}

function getPriceForCurrency(row: SpotRow, currency: string): number {
  if (currency === 'USD') return row.price_usd;
  if (currency === 'CHF') return row.price_chf;
  return row.price_eur;
}

async function fetchSpotFromSupabase(
  currency: string
): Promise<{ prices: SpotPrices; pricesEur: SpotPrices; pricesUsd: SpotPrices }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase not configured');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `${SUPABASE_URL}/rest/v1/metal_prices_spot?select=metal,price_usd,price_eur,price_chf`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);

    const rows: SpotRow[] = await res.json();
    if (!rows || rows.length === 0) throw new Error('Aucun prix disponible');

    const map: Record<string, number> = {};
    const mapEur: Record<string, number> = {};
    const mapUsd: Record<string, number> = {};

    for (const row of rows) {
      map[row.metal] = getPriceForCurrency(row, currency);
      mapEur[row.metal] = row.price_eur;
      mapUsd[row.metal] = row.price_usd;
    }

    if (map.gold == null || map.silver == null) {
      throw new Error('Prix or/argent manquants');
    }

    return {
      prices: {
        gold: map.gold ?? null,
        silver: map.silver ?? null,
        platinum: map.platinum ?? null,
        palladium: map.palladium ?? null,
      },
      pricesEur: {
        gold: mapEur.gold ?? null,
        silver: mapEur.silver ?? null,
        platinum: mapEur.platinum ?? null,
        palladium: mapEur.palladium ?? null,
      },
      pricesUsd: {
        gold: mapUsd.gold ?? null,
        silver: mapUsd.silver ?? null,
        platinum: mapUsd.platinum ?? null,
        palladium: mapUsd.palladium ?? null,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function useSpotPrices(): UseSpotPricesResult {
  const [prices, setPrices] = useState<SpotPrices>({
    gold: null, silver: null, platinum: null, palladium: null,
  });
  const [pricesEurState, setPricesEurState] = useState<SpotPrices>({
    gold: null, silver: null, platinum: null, palladium: null,
  });
  const [pricesUsdState, setPricesUsdState] = useState<SpotPrices>({
    gold: null, silver: null, platinum: null, palladium: null,
  });
  const [loading, setLoading] = useState(true);       // premier chargement uniquement
  const [refreshing, setRefreshing] = useState(false); // refreshs silencieux
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [currency, setCurrency] = useState<string>('EUR');
  const [currencySymbol, setCurrencySymbol] = useState<string>('€');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasDataRef = useRef(false); // prix déjà affichés ?

  const fetchPrices = useCallback(async (forceRefresh = false) => {
    setError(null);

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.settings);
      const savedCurrency = raw ? (JSON.parse(raw).currency ?? 'EUR') : 'EUR';
      setCurrency(savedCurrency);
      setCurrencySymbol(getCurrencySymbol(savedCurrency));

      // Cache valide → mise à jour silencieuse des états, aucun loading
      if (!forceRefresh) {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.spotCache);
        if (cached) {
          const entry: CacheEntry = JSON.parse(cached);
          const age = Date.now() - entry.timestamp;
          if (age < CACHE_TTL_MS && entry.currency === savedCurrency && entry.pricesEur) {
            setPrices(entry.prices);
            setPricesEurState(entry.pricesEur);
            setPricesUsdState(entry.pricesUsd);
            setLastUpdated(new Date(entry.timestamp));
            setHistoryReady(true);
            setLoading(false);
            hasDataRef.current = true;
            if (entry.pricesUsd.gold != null && entry.pricesUsd.silver != null) {
              await savePricePoint(entry.pricesUsd);
            }
            return;
          }
        }
      }

      // Fetch réseau :
      // - si on a déjà des prix → refresh silencieux (pas de spinner)
      // - si premier chargement → loading full screen
      if (hasDataRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { prices: fetched, pricesEur, pricesUsd } = await fetchSpotFromSupabase(savedCurrency);
      setPrices(fetched);
      setPricesEurState(pricesEur);
      setPricesUsdState(pricesUsd);
      hasDataRef.current = true;

      const now = Date.now();
      setLastUpdated(new Date(now));

      await AsyncStorage.setItem(STORAGE_KEYS.spotCache, JSON.stringify({
        prices: fetched,
        pricesEur,
        pricesUsd,
        currency: savedCurrency,
        timestamp: now,
      } as CacheEntry));

      if (pricesUsd.gold != null && pricesUsd.silver != null) {
        await savePricePoint(pricesUsd);
      }
      setHistoryReady(true);

    } catch (err) {
      // Fallback cache expiré
      try {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.spotCache);
        if (cached) {
          const entry: CacheEntry = JSON.parse(cached);
          setPrices(entry.prices);
          setPricesEurState(entry.pricesEur ?? (entry.currency === 'EUR' ? entry.prices : {
            gold: null, silver: null, platinum: null, palladium: null,
          }));
          setPricesUsdState(entry.pricesUsd);
          setLastUpdated(new Date(entry.timestamp));
          setHistoryReady(true);
          hasDataRef.current = true;
          setError('Données en cache — mise à jour impossible');
          return;
        }
      } catch { /* ignore */ }

      setError(
        err instanceof Error ? err.message : 'Impossible de récupérer les cours'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    intervalRef.current = setInterval(() => fetchPrices(), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [fetchPrices]);

  return {
    prices, pricesEur: pricesEurState, pricesUsd: pricesUsdState, loading, refreshing, error, lastUpdated, historyReady,
    refresh: () => fetchPrices(true),
    currency, currencySymbol,
  };
}
