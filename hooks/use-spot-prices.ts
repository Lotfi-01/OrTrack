import { useCallback, useEffect, useRef, useState } from 'react';
import { savePricePoint } from './use-metal-history';

const API_KEY = 'C45MSCCNECVXIFIWN9W7609IWN9W7';
const API_URL = `https://api.metals.dev/v1/latest?api_key=${API_KEY}&currency=EUR&unit=toz`;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export type SpotPrices = {
  gold: number | null;
  silver: number | null;
  platinum: number | null;
  palladium: number | null;
  copper: number | null;
};

export type UseSpotPricesResult = {
  prices: SpotPrices;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  historyReady: boolean;
  refresh: () => void;
};

type MetalsDevResponse = {
  status: string;
  metals: {
    gold: number;
    silver: number;
    platinum: number;
    palladium: number;
    copper: number;
  };
};

async function fetchSpotData(): Promise<SpotPrices> {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`metals.dev : erreur ${res.status}`);

  const data: MetalsDevResponse = await res.json();

  if (data.status !== 'success') {
    throw new Error('metals.dev : réponse invalide');
  }

  const m = data.metals;
  if (!m?.gold || !m?.silver) {
    throw new Error('metals.dev : prix manquants');
  }

  return {
    gold: m.gold,
    silver: m.silver,
    platinum: m.platinum ?? null,
    palladium: m.palladium ?? null,
    copper: m.copper ?? null,
  };
}

export function useSpotPrices(): UseSpotPricesResult {
  const [prices, setPrices] = useState<SpotPrices>({
    gold: null,
    silver: null,
    platinum: null,
    palladium: null,
    copper: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrices = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const fetched = await fetchSpotData();

      setPrices(fetched);
      setLastUpdated(new Date());

      await savePricePoint(fetched);
      setHistoryReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de récupérer les cours');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();

    intervalRef.current = setInterval(fetchPrices, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [fetchPrices]);

  return { prices, loading, error, lastUpdated, historyReady, refresh: fetchPrices };
}
