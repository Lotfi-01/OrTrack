import React, { createContext, useContext } from 'react';

import { useSpotPrices, type UseSpotPricesResult } from '@/hooks/use-spot-prices';

// Scoped context: exposed only to the subtree wrapped by SpotPricesProvider.
// Intentionally NOT global — consumers outside this subtree keep calling
// useSpotPrices directly from '@/hooks/use-spot-prices' and preserve their
// own independent runtime cycle with no behavioral change.
const SharedSpotPricesContext = createContext<UseSpotPricesResult | null>(null);

// Mounts a single runtime cycle (AsyncStorage cache read, Supabase fetch,
// 30-minute refresh timer) for the wrapped subtree and exposes it via
// SharedSpotPricesContext. Delegates to the unchanged useSpotPrices hook so
// caching, refresh semantics and TTL are strictly identical to today. Mount
// this provider at the lowest common ancestor of the authorized screens.
export function SpotPricesProvider({ children }: { children: React.ReactNode }) {
  const value = useSpotPrices();
  return (
    <SharedSpotPricesContext.Provider value={value}>
      {children}
    </SharedSpotPricesContext.Provider>
  );
}

// Reads the shared spot prices value. Returns the same shape as
// useSpotPrices — drop-in replacement for screens inside the provider tree.
// Throws an explicit developer error when invoked outside SpotPricesProvider
// so a missing provider fails loudly instead of silently starting another
// independent cycle.
export function useSharedSpotPrices(): UseSpotPricesResult {
  const ctx = useContext(SharedSpotPricesContext);
  if (ctx === null) {
    throw new Error(
      'useSharedSpotPrices must be used within <SpotPricesProvider>. '
      + 'The provider is mounted at app/(tabs)/_layout.tsx for the authorized screens.'
    );
  }
  return ctx;
}
