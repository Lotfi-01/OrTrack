import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { OrTrackColors } from '@/constants/theme';
import { MOIS_FR } from '@/utils/format';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { RadarProduct, RadarMetal, SIGNAL_PRIORITY, RADAR_PRODUCT_LABELS } from '@/utils/radar/types';
import { RADAR_EVENTS } from '@/utils/radar/radar-analytics';
import { selectDashboardProducts } from '@/utils/radar/radar-selectors';
import { useRadarProducts } from '@/hooks/use-radar-products';
import { usePremium } from '@/contexts/premium-context';

import RadarProductCard from '@/components/radar/RadarProductCard';
import RadarLockedCard from '@/components/radar/RadarLockedCard';
import RadarDetailSheet from '@/components/radar/RadarDetailSheet';
import RadarComparisonBlock from '@/components/radar/RadarComparisonBlock';
import RadarErrorState from '@/components/radar/RadarErrorState';

const C = OrTrackColors;

// ── Analytics noop ──────────────────────────────────────────────────────
const trackRadarEvent = (_event: string, _props?: Record<string, unknown>): void => {};
let hasTrackedScreenView = false;

// ── Reverse mapping label → productId ────────────────────────────────────
const LABEL_TO_ID = Object.fromEntries(
  Object.entries(RADAR_PRODUCT_LABELS).map(([id, label]) => [label, id]),
);

const METAL_FILTERS: { label: string; value: RadarMetal | undefined }[] = [
  { label: 'Or', value: 'gold' },
  { label: 'Argent', value: 'silver' },
  { label: 'Tous', value: undefined },
];

function formatDateFr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MOIS_FR[m! - 1]} ${y}`;
}

// ── Screen ──────────────────────────────────────────────────────────────

export default function RadarScreen() {
  const { productId: autoOpenProductId } = useLocalSearchParams<{ productId?: string }>();
  const { isPremium, showPaywall } = usePremium();

  const [metalFilter, setMetalFilter] = useState<RadarMetal | undefined>(undefined);
  const [selectedProduct, setSelectedProduct] = useState<RadarProduct | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [portfolioProductIds, setPortfolioProductIds] = useState<string[]>([]);
  const [isPortfolioReady, setIsPortfolioReady] = useState(false);
  const [hasRetryStarted, setHasRetryStarted] = useState(false);

  const { products, latestDate, isLoading, error, refetch } = useRadarProducts({ metal: metalFilter });

  const comparisonTrackedRef = useRef<Set<string>>(new Set());
  const detailTouchTrackedRef = useRef(false);

  // ── Load portfolio from AsyncStorage ───────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setIsPortfolioReady(false);
      AsyncStorage.getItem(STORAGE_KEYS.positions)
        .then(raw => {
          if (!active) return;
          const positions = raw ? JSON.parse(raw) : [];
          // RADAR_PRODUCT_LABELS est strictement gold-only. On filtre les positions
          // sur le métal `or` avant le lookup pour éviter qu'un label partagé
          // (ex: "Maple Leaf 1oz" en platine/argent) ne soit résolu à tort comme
          // le produit radar gold correspondant.
          const ids = [...new Set(
            (positions as { product?: string; metal?: string }[])
              .filter(p => p.metal === 'or')
              .map(p => LABEL_TO_ID[p.product ?? ''])
              .filter((id): id is string => !!id),
          )];
          setPortfolioProductIds(ids);
          setIsPortfolioReady(true);
        })
        .catch(() => { if (active) setIsPortfolioReady(true); });
      return () => { active = false; };
    }, []),
  );

  // ── Auto-open sheet ────────────────────────────────────────────────

  useEffect(() => {
    if (autoOpenProductId && products.length > 0) {
      const target = products.find(p => p.productId === autoOpenProductId);
      if (target && isPremium) {
        setSelectedProduct(target);
        setSheetVisible(true);
      }
    }
  }, [autoOpenProductId, isPremium, products]);

  // ── Retry ──────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    setHasRetryStarted(true);
    refetch();
  }, [refetch]);

  const isRetrying = hasRetryStarted && isLoading;
  const isScreenLoading = isLoading || !isPortfolioReady;

  useEffect(() => {
    if (hasRetryStarted && !isLoading) setHasRetryStarted(false);
  }, [hasRetryStarted, isLoading]);

  // ── Gating ─────────────────────────────────────────────────────────

  const freeProductIds = useMemo(() => {
    if (!isPortfolioReady) return null;
    const selected = selectDashboardProducts(products, portfolioProductIds);
    return new Set(selected.map(p => p.productId));
  }, [isPortfolioReady, products, portfolioProductIds]);

  const isUnlocked = useCallback(
    (productId: string) => isPremium || freeProductIds?.has(productId) === true,
    [freeProductIds, isPremium],
  );

  // ── Sorted products ────────────────────────────────────────────────

  const sortedProducts = useMemo(() => {
    const sortFn = (a: RadarProduct, b: RadarProduct) => {
      const diff = SIGNAL_PRIORITY[a.signal ?? 'null'] - SIGNAL_PRIORITY[b.signal ?? 'null'];
      return diff !== 0 ? diff : a.label.localeCompare(b.label, 'fr');
    };
    return {
      pieces: products.filter(p => p.category === 'piece').sort(sortFn),
      lingots: products.filter(p => p.category === 'lingot').sort(sortFn),
    };
  }, [products]);

  // Available metals for chips — hide chips if only 1 metal
  const availableMetals = useMemo(() => {
    const metals = new Set(products.map(p => p.metal));
    return metals.size > 1 ? METAL_FILTERS.filter(f => f.value === undefined || metals.has(f.value)) : [];
  }, [products]);

  // ── Analytics ──────────────────────────────────────────────────────

  if (!hasTrackedScreenView && !isLoading && !error && products.length > 0) {
    hasTrackedScreenView = true;
    trackRadarEvent(RADAR_EVENTS.SCREEN_VIEW, {
      metal_filter: metalFilter ?? 'all',
      product_count: products.length,
      is_premium: isPremium,
    });
  }

  // ── Handlers ───────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  }, []);

  const openPaywall = useCallback((source: 'locked_card' | 'comparison') => {
    trackRadarEvent(RADAR_EVENTS.PAYWALL_OPEN, { source });
    showPaywall();
  }, [showPaywall]);

  const handleFilterChange = useCallback((value: RadarMetal | undefined) => {
    setMetalFilter(value);
    trackRadarEvent(RADAR_EVENTS.FILTER_CHANGE, { metal: value ?? 'all', visible_count: products.length });
  }, [products.length]);

  const handleProductOpen = useCallback((product: RadarProduct) => {
    trackRadarEvent(RADAR_EVENTS.PRODUCT_OPEN, { product_id: product.productId, signal: product.signal, data_quality: product.dataQuality });
    setSelectedProduct(product);
    detailTouchTrackedRef.current = false;
    trackRadarEvent(RADAR_EVENTS.DETAIL_OPEN, { product_id: product.productId, signal: product.signal, percentile: product.percentile });
    setSheetVisible(true);
  }, []);

  const handleLockedTap = useCallback((product: RadarProduct) => {
    trackRadarEvent(RADAR_EVENTS.LOCKED_PRODUCT_TAP, { product_id: product.productId, is_premium: isPremium });
    openPaywall('locked_card');
  }, [isPremium, openPaywall]);

  const handleDetailTouch = useCallback(() => {
    if (!detailTouchTrackedRef.current && selectedProduct) {
      detailTouchTrackedRef.current = true;
      trackRadarEvent(RADAR_EVENTS.DETAIL_TOUCH, { product_id: selectedProduct.productId });
    }
  }, [selectedProduct]);

  const handleComparisonVisible = useCallback((groupLabel: string) => {
    if (!comparisonTrackedRef.current.has(groupLabel)) {
      comparisonTrackedRef.current.add(groupLabel);
      trackRadarEvent(RADAR_EVENTS.COMPARISON_VIEW, { group: groupLabel });
    }
  }, []);

  const handleSheetClose = useCallback(() => {
    setSheetVisible(false);
    setSelectedProduct(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

  if (!isPremium) {
    return (
      <SafeAreaView style={st.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={st.header}>
          <TouchableOpacity onPress={handleBack}><Text style={st.backText}>{'\u2190'}</Text></TouchableOpacity>
          <Text style={st.headerTitle}>Prime marché</Text>
        </View>
        <View style={st.lockedWrap}>
          <Text style={st.lockedTitle}>Radar {'\u00B7'} Réservé Premium</Text>
          <Text style={st.lockedText}>Le radar de primes est réservé aux comptes Premium. Les abonnements ne sont pas encore ouverts.</Text>
          <TouchableOpacity style={st.lockedButton} onPress={() => openPaywall('locked_card')} activeOpacity={0.8}>
            <Text style={st.lockedButtonText}>Découvrir Premium</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isScreenLoading) {
    return (
      <SafeAreaView style={st.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={st.header}>
          <TouchableOpacity onPress={handleBack}><Text style={st.backText}>{'\u2190'}</Text></TouchableOpacity>
          <Text style={st.headerTitle}>Prime marché</Text>
        </View>
        <View style={st.skeletonWrap}>
          <View style={st.skeleton} />
          <View style={st.skeleton} />
          <View style={st.skeleton} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={st.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={st.header}>
          <TouchableOpacity onPress={handleBack}><Text style={st.backText}>{'\u2190'}</Text></TouchableOpacity>
          <Text style={st.headerTitle}>Prime marché</Text>
        </View>
        <View style={st.errorWrap}>
          <RadarErrorState onRetry={handleRetry} isRetrying={isRetrying} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <TouchableOpacity onPress={handleBack}><Text style={st.backText}>{'\u2190'}</Text></TouchableOpacity>
        <View>
          <Text style={st.headerTitle}>Prime marché</Text>
          {latestDate && <Text style={st.headerSub}>Données du {formatDateFr(latestDate)}</Text>}
        </View>
      </View>

      {/* Filters — hidden if only 1 metal available */}
      {availableMetals.length > 0 && (
      <View style={st.filterRow}>
        {availableMetals.map(f => {
          const active = metalFilter === f.value;
          return (
            <TouchableOpacity
              key={f.label}
              style={[st.chip, active && st.chipActive]}
              onPress={() => handleFilterChange(f.value)}
              activeOpacity={0.7}
            >
              <Text style={[st.chipText, active && st.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      )}

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Pieces */}
        {sortedProducts.pieces.length > 0 && (
          <>
            <Text style={st.sectionTitle}>PIÈCES</Text>
            {sortedProducts.pieces.map(p =>
              isUnlocked(p.productId) ? (
                <RadarProductCard key={p.productId} product={p} onDetailPress={handleProductOpen} isPremium={isPremium} />
              ) : (
                <RadarLockedCard key={p.productId} product={p} onUnlockPress={() => handleLockedTap(p)} />
              ),
            )}
          </>
        )}

        {/* Lingots */}
        {sortedProducts.lingots.length > 0 && (
          <>
            <Text style={st.sectionTitle}>LINGOTS</Text>
            {sortedProducts.lingots.map(p =>
              isUnlocked(p.productId) ? (
                <RadarProductCard key={p.productId} product={p} onDetailPress={handleProductOpen} isPremium={isPremium} />
              ) : (
                <RadarLockedCard key={p.productId} product={p} onUnlockPress={() => handleLockedTap(p)} />
              ),
            )}
          </>
        )}

        {/* No products for filter */}
        {sortedProducts.pieces.length === 0 && sortedProducts.lingots.length === 0 && (
          <Text style={st.emptyFilter}>Aucun produit disponible pour ce filtre</Text>
        )}

        {/* Comparison */}
        <RadarComparisonBlock
          products={products}
          metal={metalFilter}
          isPremium={isPremium}
          onUnlockPress={() => openPaywall('comparison')}
          onVisible={handleComparisonVisible}
        />

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Detail sheet */}
      {selectedProduct && (
        <RadarDetailSheet
          product={selectedProduct}
          visible={sheetVisible}
          onClose={handleSheetClose}
          onFirstTouch={handleDetailTouch}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  backText: { fontSize: 16, color: C.gold, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: C.white },
  headerSub: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: C.gold },
  chipText: { fontSize: 12, fontWeight: '500', color: C.textDim },
  chipTextActive: { color: C.gold, fontWeight: '600' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  emptyFilter: { fontSize: 13, color: C.textMuted, textAlign: 'center', marginTop: 40 },
  skeletonWrap: { padding: 20, gap: 12 },
  skeleton: { height: 60, backgroundColor: C.border, borderRadius: 10, opacity: 0.5 },
  errorWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  lockedWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  lockedTitle: { fontSize: 20, fontWeight: '700', color: C.white, textAlign: 'center' },
  lockedText: { fontSize: 14, color: C.subtext, textAlign: 'center', lineHeight: 20 },
  lockedButton: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  lockedButtonText: { color: C.background, fontSize: 15, fontWeight: '700' },
});
