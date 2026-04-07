import { useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  RadarProduct,
  UseRadarProductsResult,
  UseRadarProductsParams,
  RadarMetal,
} from '@/utils/radar/types';
import { fetchCurrentPrimes, fetchPrimeHistory } from '@/utils/radar/radar-query';
import { buildRadarProducts } from '@/utils/radar/radar-selectors';

const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  products: RadarProduct[];
  latestDate: string | null;
  fetchedAt: number;
}

// Cache unique — une seule entrée pour tous les produits (pas de filtre metal côté query)
const cache = new Map<string, CacheEntry>();

function getCacheKey(days?: number): string {
  return `all_${days ?? 90}`;
}

export function invalidateRadarCache(): void {
  cache.clear();
}

export function downsample(
  points: { date: string; primePct: number }[],
  targetCount: number,
): { date: string; primePct: number }[] {
  if (points.length <= targetCount) return points;
  const step = Math.ceil(points.length / targetCount);
  const result = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1]!;
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

/**
 * Hook batch pour le Radar Prime.
 * Agnostique au statut premium — le gating est géré côté UI.
 *
 * - 2 queries Supabase max (courante + historique)
 * - Cache module-level, TTL 15 min
 * - Merge systématique avec PRIME_CONFIG
 * - Signal et stats calculés côté client
 * - Historique toujours chargé
 * - Filtre metal appliqué post-cache (pas dans la query)
 */
export function useRadarProducts(
  params?: UseRadarProductsParams,
): UseRadarProductsResult {
  const metal = params?.metal;
  const days = params?.days ?? 90;

  const [allProducts, setAllProducts] = useState<RadarProduct[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async (isActive: () => boolean) => {
    if (fetchingRef.current) return;

    const key = getCacheKey(days);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      if (!isActive()) return;
      setAllProducts(cached.products);
      setLatestDate(cached.latestDate);
      setIsLoading(false);
      setError(null);
      return;
    }

    fetchingRef.current = true;
    setIsLoading(true);

    try {
      // Query 1: valeurs courantes + latestDate (pas de filtre metal — colonne absente)
      const { rows: currentRows, latestDate: ld } = await fetchCurrentPrimes();
      if (!isActive()) return;

      if (!ld) {
        const emptyProducts = buildRadarProducts([], [], undefined);
        setAllProducts(emptyProducts);
        setLatestDate(null);
        setIsLoading(false);
        setError(null);
        cache.set(key, { products: emptyProducts, latestDate: null, fetchedAt: Date.now() });
        return;
      }

      // Query 2: historique ancré sur latestDate (pas de filtre metal)
      const historyRows = await fetchPrimeHistory(ld, days);
      if (!isActive()) return;

      // Build ALL products — pas de filtre métal ici
      const built = buildRadarProducts(currentRows, historyRows, undefined);

      cache.set(key, { products: built, latestDate: ld, fetchedAt: Date.now() });
      setAllProducts(built);
      setLatestDate(ld);
      setError(null);
    } catch (e) {
      if (!isActive()) return;
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      if (isActive()) setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [days]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchData(() => active);
      return () => { active = false; };
    }, [fetchData]),
  );

  const refetch = useCallback(() => {
    const key = getCacheKey(days);
    cache.delete(key);
    fetchData(() => true);
  }, [days, fetchData]);

  // TODO: latestDate est globale car prime_daily n'a pas de colonne metal.
  // Si des produits de métaux différents sont ajoutés avec des dates différentes,
  // latestDate devra être calculée par métal côté client.

  // Filtre metal APRÈS le cache, léger useMemo
  const products = useMemo(() => {
    if (!metal) return allProducts;
    return allProducts.filter(p => p.metal === metal);
  }, [allProducts, metal]);

  return { products, latestDate, isLoading, error, refetch };
}
