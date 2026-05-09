import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { usePremium } from '@/contexts/premium-context';
import {
  RadarPrimeError,
  fetchRadarPrimeSnapshots,
} from '@/utils/radar/radar-query';
import {
  RadarMetal,
  RadarProduct,
  UseRadarProductsParams,
  UseRadarProductsResult,
} from '@/utils/radar/types';

const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  products: RadarProduct[];
  latestDate: string | null;
  fetchedAt: number;
}

// Cache module-level. RP1.1 ne dispose pas d'identité utilisateur côté
// Supabase (auth non active) ; le cache reste donc par session app. Quand
// l'auth utilisateur sera mise en place, scoper la clé sur `auth.uid()` et
// purger sur changement d'utilisateur.
let cache: CacheEntry | null = null;

export function invalidateRadarCache(): void {
  cache = null;
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
 * Hook Radar Prime — RP1.1.
 *
 * Comportement :
 * - Aucun fetch tant que `isPremium === false` côté client. La validation
 *   finale reste serveur (Edge Function `radar-prime`).
 * - Le client `isPremium` sert uniquement à éviter un appel inutile.
 * - Cache module-level TTL 15 min, partagé entre les écrans de la session.
 * - Filtre métal appliqué post-cache.
 *
 * Si l'Edge Function répond `403 premium_required`, on expose l'erreur au
 * caller. La protection des données reste serveur — un client patché qui
 * forcerait `isPremium = true` recevra un 403, donc rien.
 */
export function useRadarProducts(
  params?: UseRadarProductsParams,
): UseRadarProductsResult {
  const metal = params?.metal;

  const { isPremium } = usePremium();

  const [allProducts, setAllProducts] = useState<RadarProduct[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(isPremium);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async (isActive: () => boolean) => {
    if (!isPremium) {
      // Premium client non confirmé → aucune requête vers l'Edge Function.
      // Le serveur renverrait de toute façon 403, mais on évite l'appel.
      if (!isActive()) return;
      setAllProducts([]);
      setLatestDate(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (fetchingRef.current) return;

    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      if (!isActive()) return;
      setAllProducts(cache.products);
      setLatestDate(cache.latestDate);
      setIsLoading(false);
      setError(null);
      return;
    }

    fetchingRef.current = true;
    setIsLoading(true);

    try {
      const { products, latestDate: ld } = await fetchRadarPrimeSnapshots();
      if (!isActive()) return;
      cache = { products, latestDate: ld, fetchedAt: Date.now() };
      setAllProducts(products);
      setLatestDate(ld);
      setError(null);
    } catch (e) {
      if (!isActive()) return;
      if (e instanceof RadarPrimeError) {
        setError(e.detail.kind);
      } else {
        setError(e instanceof Error ? e.message : 'unknown_error');
      }
      setAllProducts([]);
      setLatestDate(null);
    } finally {
      if (isActive()) setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [isPremium]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchData(() => active);
      return () => { active = false; };
    }, [fetchData]),
  );

  const refetch = useCallback(() => {
    cache = null;
    fetchData(() => true);
  }, [fetchData]);

  const products = useMemo<RadarProduct[]>(() => {
    if (!metal) return allProducts;
    return allProducts.filter((p: RadarProduct) => p.metal === (metal as RadarMetal));
  }, [allProducts, metal]);

  return { products, latestDate, isLoading, error, refetch };
}
