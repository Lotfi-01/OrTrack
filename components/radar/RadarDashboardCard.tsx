import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import { OrTrackColors } from '@/constants/theme';
import { formatPct, MOIS_FR } from '@/utils/format';
import { RadarProduct, RadarSignal, RADAR_PRODUCT_LABELS } from '@/utils/radar/types';
import { RADAR_EVENTS } from '@/utils/radar/radar-analytics';
import { selectDashboardProducts } from '@/utils/radar/radar-selectors';
import { useRadarProducts, downsample } from '@/hooks/use-radar-products';
import PrimeSparkline from '@/components/radar/PrimeSparkline';
import RadarErrorState from '@/components/radar/RadarErrorState';

const C = OrTrackColors;

// ── Analytics noop (brancher sur le système d'analytics quand disponible) ──
const trackRadarEvent = (_event: string, _props?: Record<string, unknown>): void => {};

let hasTrackedDashboardView = false;

// ── Helpers ──────────────────────────────────────────────────────────────

function getSignalLabel(signal: RadarSignal | null): string {
  switch (signal) {
    case 'low': return 'Basse vs 90j';
    case 'normal': return 'Normale';
    case 'high': return 'Élevée vs 90j';
    default: return 'En calibrage';
  }
}

function getSignalColor(signal: RadarSignal | null): string {
  switch (signal) {
    case 'low': return C.green;
    case 'normal': return C.gold;
    case 'high': return '#C75B5B';
    default: return '#666666';
  }
}

function formatDateFr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MOIS_FR[m! - 1]} ${y}`;
}

// ── Component ────────────────────────────────────────────────────────────

interface RadarDashboardCardProps {
  portfolioProductIds: string[];
}

export default function RadarDashboardCard({ portfolioProductIds }: RadarDashboardCardProps) {
  const { products, latestDate, isLoading, error, refetch } = useRadarProducts();

  const [hasRetryStarted, setHasRetryStarted] = useState(false);

  const handleRetry = useCallback(() => {
    setHasRetryStarted(true);
    refetch();
  }, [refetch]);

  // Reset retry flag when loading completes
  useEffect(() => {
    if (hasRetryStarted && !isLoading) setHasRetryStarted(false);
  }, [hasRetryStarted, isLoading]);

  const isRetrying = hasRetryStarted && isLoading;

  // ── Stable dashboard selection ─────────────────────────────────────

  const dashboardSelectionRef = useRef<{ key: string; products: RadarProduct[] } | null>(null);
  const portfolioKey = [...portfolioProductIds].sort().join('|');
  const selectionKey = `all_${latestDate}_${portfolioKey}`;

  const dashboardProducts = useMemo(() => {
    if (dashboardSelectionRef.current?.key === selectionKey) {
      return dashboardSelectionRef.current.products;
    }
    const selected = selectDashboardProducts(products, portfolioProductIds);
    dashboardSelectionRef.current = { key: selectionKey, products: selected };
    return selected;
  }, [selectionKey, products, portfolioProductIds]);

  // ── Analytics: dashboard_view (once per session) ───────────────────

  useEffect(() => {
    if (!hasTrackedDashboardView && !isLoading && !error && latestDate && dashboardProducts.length > 0) {
      hasTrackedDashboardView = true;
      trackRadarEvent(RADAR_EVENTS.DASHBOARD_VIEW, {
        product_ids: dashboardProducts.map(p => p.productId),
        latest_date: latestDate,
      });
    }
  }, [isLoading, error, latestDate, dashboardProducts]);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleCtaTap = useCallback(() => {
    trackRadarEvent(RADAR_EVENTS.DASHBOARD_CTA_TAP);
    router.push('/radar' as never);
  }, []);

  // ── Render states ──────────────────────────────────────────────────

  if (isLoading && !isRetrying) {
    return (
      <View style={st.card}>
        <View style={st.header}>
          <Text style={st.headerTitle}>Prime marché</Text>
        </View>
        <View style={st.skeletonRow} />
        <View style={st.skeletonRow} />
      </View>
    );
  }

  if (error) {
    return <RadarErrorState onRetry={handleRetry} isRetrying={isRetrying} />;
  }

  if (dashboardProducts.length === 0) {
    return <RadarErrorState onRetry={handleRetry} isRetrying={isRetrying} subtitle="Données indisponibles" />;
  }

  // ── Normal render ──────────────────────────────────────────────────

  const isPortfolioEmpty = portfolioProductIds.length === 0;

  return (
    <View style={st.card}>
      <View style={st.header}>
        <Text style={st.headerTitle}>Prime marché <Text style={{ color: C.textDim }}>{'\u00B7'} Or</Text></Text>
        <TouchableOpacity onPress={handleCtaTap} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={st.ctaText}>{'Voir tout \u203A'}</Text>
        </TouchableOpacity>
      </View>

      {dashboardProducts.map((product, idx) => {
        const historyData = product.history ? downsample(product.history, 20) : null;
        const signalColor = getSignalColor(product.signal);
        const signalLabel = getSignalLabel(product.signal);

        return (
          <View key={product.productId}>
            {idx > 0 && <View style={st.divider} />}
            <View style={st.productRow}>
              <Text style={st.productName} numberOfLines={1}>{product.label}</Text>
              {historyData && historyData.length >= 7 && (
                <PrimeSparkline data={historyData} width={72} height={20} signal={product.signal} />
              )}
              <View style={[st.badge, { borderColor: signalColor }]}>
                <Text style={[st.badgeText, { color: signalColor }]}>{signalLabel}</Text>
              </View>
              <Text style={st.primePct}>
                {product.currentPrimePct !== null ? `${formatPct(product.currentPrimePct, 1)}` : '\u2014'}
              </Text>
            </View>
          </View>
        );
      })}

      <Text style={st.footer}>
        {isPortfolioEmpty
          ? 'Produits de référence'
          : latestDate
            ? `Données du ${formatDateFr(latestDate)}`
            : ''}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerTitle: { fontSize: 13, fontWeight: '600', color: C.white },
  ctaText: { fontSize: 11, color: C.gold, fontWeight: '600' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  productName: { fontSize: 12, fontWeight: '500', color: C.white, flex: 1, minWidth: 0 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  primePct: { fontSize: 12, fontWeight: '600', color: C.textDim, minWidth: 40, textAlign: 'right' },
  divider: { height: 1, backgroundColor: C.divider, marginVertical: 2 },
  footer: { fontSize: 9, color: C.textMuted, textAlign: 'center', marginTop: 8 },
  skeletonRow: { height: 28, backgroundColor: C.border, borderRadius: 4, marginBottom: 8, opacity: 0.5 },
});
