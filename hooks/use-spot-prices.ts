import { useCallback, useEffect, useRef, useState } from 'react';

const API_KEY = '368dab096a3de9e62cef65ce3f797bf5';
const API_URL = `https://api.metalpriceapi.com/v1/latest?api_key=${API_KEY}&base=USD&currencies=XAU,XAG,EUR`;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export type SpotPrices = {
  gold: number | null;
  silver: number | null;
  goldChangePercent: number | null;
  silverChangePercent: number | null;
};

export type UseSpotPricesResult = {
  prices: SpotPrices;
  eurRate: number | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
};

type MetalPriceApiRates = {
  XAU: number; // oz d'or par USD (prix inversé)
  XAG: number; // oz d'argent par USD (prix inversé)
  EUR: number; // taux EUR/USD
};

async function fetchSpotData(): Promise<{ gold: number; silver: number; eurRate: number }> {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`metalpriceapi.com : erreur ${res.status}`);

  const data = await res.json();

  if (!data.success) {
    const msg = data.error?.info ?? 'Réponse invalide';
    throw new Error(`metalpriceapi.com : ${msg}`);
  }

  const rates: MetalPriceApiRates = data.rates;

  if (!rates?.XAU || !rates?.XAG || !rates?.EUR) {
    throw new Error('metalpriceapi.com : taux XAU/XAG/EUR manquants');
  }

  // rates.XAU = nb oz d'or pour 1 USD → prix or = 1/XAU USD/oz
  const goldUsd = 1 / rates.XAU;
  const silverUsd = 1 / rates.XAG;

  return {
    gold: goldUsd * rates.EUR,
    silver: silverUsd * rates.EUR,
    eurRate: rates.EUR,
  };
}

export function useSpotPrices(): UseSpotPricesResult {
  const [prices, setPrices] = useState<SpotPrices>({
    gold: null,
    silver: null,
    goldChangePercent: null,
    silverChangePercent: null,
  });
  const [eurRate, setEurRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrices = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const { gold, silver, eurRate: rate } = await fetchSpotData();

      setEurRate(rate);
      setPrices({
        gold,
        silver,
        goldChangePercent: null, // non fourni par metalpriceapi
        silverChangePercent: null,
      });
      setLastUpdated(new Date());
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

  return { prices, eurRate, loading, error, lastUpdated, refresh: fetchPrices };
}
