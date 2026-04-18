// ─── ÉTAPE 0 — Hooks et sources identifiés ───
// Hook positions : usePositions (hooks/use-positions.ts)
// Hook spot/prix : useSpotPrices (hooks/use-spot-prices.ts) → prices.gold etc. en EUR/oz
// Source historique : loadPriceHistory (hooks/use-metal-history.ts) → PricePoint[]
// Fonction calcul fiscal : TAX.forfaitaireRate (constants/tax.ts)
// Route fiscalité : /fiscalite-globale (app/fiscalite-globale.tsx)
// Structure position : { id, metal, product, weightG, quantity, purchasePrice, purchaseDate, createdAt, note?, spotAtPurchase? }
// react-native-svg : installé (v15.12.1)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { METAL_CONFIG, getSpot } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { OrTrackColors } from '@/constants/theme';
import { formatEuro, formatPct, formatG, formatGain, stripMetalFromName, JOURS_FR, MOIS_FR } from '@/utils/format';
import { PARTIAL_ESTIMATE_NOTICE, isGainFiscalEligiblePosition } from '@/utils/fiscal';
import { computePositionCost, computePositionValue } from '@/utils/position-calc';
import { usePositions } from '@/hooks/use-positions';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { loadPriceHistory, type PricePoint, type HistoryPeriod } from '@/hooks/use-metal-history';
import { usePremium } from '@/contexts/premium-context';

import type { MetalType } from '@/constants/metals';

const C = OrTrackColors;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = 138;
const SNAP_INTERVAL = CARD_WIDTH + 10;

const MARKET_METALS: { key: MetalType; spotKey: 'gold' | 'silver' | 'platinum' | 'palladium'; unit: string }[] = [
  { key: 'or', spotKey: 'gold', unit: '€/oz' },
  { key: 'argent', spotKey: 'silver', unit: '€/oz' },
  { key: 'platine', spotKey: 'platinum', unit: '€/oz' },
  { key: 'palladium', spotKey: 'palladium', unit: '€/oz' },
];

// Articles pour construction de phrase : "Créer une alerte sur {article}"
const METAL_ARTICLE: Record<string, string> = {
  XAU: "l\u2019or", XAG: "l\u2019argent", XPT: 'le platine', XPD: 'le palladium',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSvgPath(data: number[], width: number, height: number): string {
  if (data.length < 2) return '';
  const minP = data.reduce((a, b) => Math.min(a, b), Infinity);
  const maxP = data.reduce((a, b) => Math.max(a, b), -Infinity);
  const range = maxP - minP || 1;
  const step = width / (data.length - 1);
  return data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - minP) / range) * height;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function buildFillPath(data: number[], width: number, height: number): string {
  const line = buildSvgPath(data, width, height);
  if (!line) return '';
  return `${line} L${width},${height} L0,${height} Z`;
}

const MOIS_COURT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

function formatChartDate(dateStr: string, period?: string, shortRange?: boolean): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const parts = dateStr.split('-').map(Number);
  const yr = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (!mo || !d) return dateStr;
  // 5A, 10A, 20A: year only
  if (period === '5A' || period === '10A' || period === '20A') {
    return String(yr);
  }
  // 1A with short range (< 90 days of data): use day-level granularity
  if (period === '1A' && shortRange) {
    return `${d} ${MOIS_COURT[mo - 1]}`;
  }
  if (period === '1A') {
    return `${MOIS_COURT[mo - 1]} ${String(yr).slice(2)}`;
  }
  return `${d} ${MOIS_COURT[mo - 1]}`;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function AccueilScreen() {
  const { positions, loading: positionsLoading, reloadPositions } = usePositions();
  const { prices, loading: spotLoading, refreshing, lastUpdated, refresh, currencySymbol, error: spotError } = useSpotPrices();
  const { isPremium, isPeriodLocked, showPaywall } = usePremium();

  const [masked, setMasked] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>('1A');
  // TODO: fallback si données 1A insuffisantes
  const [selectedMetal, setSelectedMetal] = useState<{ key: MetalType; spotKey: string; symbol: string }>({ key: 'or', spotKey: 'gold', symbol: 'XAU' });
  const [chartHistory, setChartHistory] = useState<PricePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartActualCurrency, setChartActualCurrency] = useState('EUR');
  const [chartReady, setChartReady] = useState(false);
  const [activeMarketIdx, setActiveMarketIdx] = useState(0);
  const [change24h, setChange24h] = useState<Partial<Record<string, number>>>({});
  const [radarTeaserMessageVisible, setRadarTeaserMessageVisible] = useState(false);

  const marketScrollRef = useRef<ScrollView>(null);
  const isProgrammaticScroll = useRef(false);

  // ── Privacy mode ─────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEYS.privacyMode).then(v => setMasked(v === 'true')).catch(() => {});
    }, [])
  );

  const toggleMask = useCallback(async () => {
    const next = !masked;
    setMasked(next);
    try { await AsyncStorage.setItem(STORAGE_KEYS.privacyMode, String(next)); } catch {}
  }, [masked]);

  // ── Reload positions on focus ────────────────────────────────────────

  useFocusEffect(useCallback(() => { reloadPositions(); }, [reloadPositions]));

  // ── Load chart history for selected metal ──────────────────────────

  useEffect(() => {
    setChartLoading(true);
    loadPriceHistory(selectedPeriod, 'EUR', selectedMetal.spotKey)
      .then(result => { setChartHistory(result.data); setChartActualCurrency(result.actualCurrency); setChartLoading(false); })
      .catch(() => { setChartHistory([]); setChartActualCurrency('EUR'); setChartLoading(false); });
  }, [selectedPeriod, selectedMetal.spotKey]);


  // ── 24h change ───────────────────────────────────────────────────────

  useEffect(() => {
    loadPriceHistory('1S', 'EUR').then(result => {
      const history = result.data;
      if (history.length < 2) return;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const ydStr = yesterday.toISOString().split('T')[0];
      const pt = history.find(p => p.date === ydStr) ?? history[history.length - 2];
      if (!pt) return;
      const changes: Partial<Record<string, number>> = {};
      for (const k of ['gold', 'silver', 'platinum', 'palladium'] as const) {
        const cur = prices[k];
        const past = pt[k];
        if (cur && past && past > 0) changes[k] = ((cur - past) / past) * 100;
      }
      setChange24h(changes);
    }).catch(() => {});
  }, [prices]);

  // ── Portfolio calculations ───────────────────────────────────────────

  const portfolio = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let gainValue = 0;
    let excludedFromGainCount = 0;
    const byMetal: Record<string, { count: number; totalG: number; value: number; cost: number; gainValue: number; excludedFromGainCount: number }> = {};

    for (const p of positions) {
      const spot = getSpot(p.metal, prices);
      const cost = computePositionCost(p);
      const val = computePositionValue(p, spot) ?? 0;
      const isGainFiscalEligible = isGainFiscalEligiblePosition(p);
      totalValue += val;

      if (!byMetal[p.metal]) byMetal[p.metal] = { count: 0, totalG: 0, value: 0, cost: 0, gainValue: 0, excludedFromGainCount: 0 };
      byMetal[p.metal].count += p.quantity;
      byMetal[p.metal].totalG += p.quantity * p.weightG;
      byMetal[p.metal].value += val;
      if (isGainFiscalEligible) {
        totalCost += cost;
        gainValue += val;
        byMetal[p.metal].cost += cost;
        byMetal[p.metal].gainValue += val;
      } else {
        excludedFromGainCount++;
        byMetal[p.metal].excludedFromGainCount++;
      }
    }

    const gain = totalCost > 0 ? gainValue - totalCost : 0;
    const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
    // Affiché pour tout résultat (positif, négatif, nul) dès qu'il y a des positions.
    const netEstime = gainValue - (gainValue * TAX.forfaitaireRate) - totalCost;

    return { totalValue, totalCost, gain, gainPct, netEstime, byMetal, excludedFromGainCount, hasPartialEstimate: excludedFromGainCount > 0 };
  }, [positions, prices]);

  const hasPositions = positions.length > 0;

  // Reverse mapping: product label → PRIME_CONFIG key for Radar dashboard.
  // RADAR_PRODUCT_LABELS est strictement gold-only (cf. RADAR_PRODUCT_METALS dans
  // utils/radar/types.ts) ; on doit donc restreindre le lookup aux positions `or`
  // pour éviter qu'un label partagé entre métaux (ex: "Maple Leaf 1oz" en platine
  // ou argent) ne soit résolu à tort comme le produit radar gold correspondant.
  // ── Init chart on dominant metal (anti-flash) ────────────────────────

  const dominantMetal = useMemo(() => {
    const entries = Object.entries(portfolio.byMetal);
    if (entries.length === 0) return { key: 'or' as MetalType, spotKey: 'gold', symbol: 'XAU' };
    const [topKey] = entries.sort(([, a], [, b]) => b.value - a.value)[0];
    const cfg = METAL_CONFIG[topKey as MetalType];
    return cfg ? { key: topKey as MetalType, spotKey: cfg.spotKey, symbol: cfg.symbol } : { key: 'or' as MetalType, spotKey: 'gold', symbol: 'XAU' };
  }, [portfolio.byMetal]);

  useEffect(() => {
    if (chartReady || positionsLoading) return;
    const metals = Object.keys(portfolio.byMetal);
    if (metals.length > 0) {
      setSelectedMetal(dominantMetal);
    }
    setChartReady(true);
  }, [positionsLoading, portfolio.byMetal, dominantMetal, chartReady]);
  // ── pricesReady basé sur les métaux réellement détenus ────────────
  const heldMetals = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    return [...new Set(positions.map(p => p.metal))];
  }, [positions]);

  const pricesReady = useMemo(() => {
    if (spotLoading) return false;
    if (heldMetals.length === 0) return true;
    return heldMetals.every(metal => {
      const spot = prices[METAL_CONFIG[metal].spotKey];
      return spot !== null && spot !== undefined;
    });
  }, [spotLoading, heldMetals, prices]);

  // ── Chart data ───────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    if (chartLoading) return null;
    const metalKey = selectedMetal.spotKey as keyof PricePoint;
    const pts = chartHistory.map(p => (Number(p[metalKey]) || 0)).filter(v => v > 0);
    if (pts.length < 2) return null;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const perf = ((last - first) / first) * 100;
    const minVal = pts.reduce((a, b) => Math.min(a, b), Infinity);
    const maxVal = pts.reduce((a, b) => Math.max(a, b), -Infinity);
    return { pts, perf, minVal, maxVal };
  }, [chartHistory, chartLoading, selectedMetal.spotKey]);

  // ── Date header ──────────────────────────────────────────────────────

  const dateStr = useMemo(() => {
    const d = new Date();
    return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]}`;
  }, []);

  // ── Market scroll ────────────────────────────────────────────────────

  const handleMarketScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.max(0, Math.min(Math.round(x / SNAP_INTERVAL), MARKET_METALS.length - 1));
    setActiveMarketIdx(idx);
  }, []);

  // Scroll end only resets programmatic flag — does NOT update selectedMetal
  const handleMarketScrollEnd = useCallback(() => {
    if (isProgrammaticScroll.current) {
      isProgrammaticScroll.current = false;
    }
  }, []);

  const m = (text: string) => masked ? '••••••' : text;

  const chartW = SCREEN_WIDTH - 68;
  // 10A/20A use USD source (price_eur unavailable before 2021)
  const chartCurrencySymbol = chartActualCurrency === 'USD' ? '$' : currencySymbol;

  // ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={st.container}>
      <ScrollView
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.gold} colors={[C.gold]} />}
      >

        {/* ── 1. HEADER ──────────────────────────────────── */}
        <View style={st.header}>
          <Text style={st.headerDate}>{dateStr}</Text>
          <View style={st.headerRight}>
            <View style={st.headerDot} />
            <Text style={st.headerTime}>
              {lastUpdated
                ? `Mis à jour à ${String(lastUpdated.getHours()).padStart(2, '0')}:${String(lastUpdated.getMinutes()).padStart(2, '0')} \u00B7 Cours spot`
                : 'Cours spot'}
            </Text>
          </View>
        </View>

        {/* ── 2. HERO ────────────────────────────────────── */}
        <View style={st.hero}>
          <View style={st.heroLabelRow}>
            <Text style={st.heroLabel}>VALEUR DE VOTRE PORTEFEUILLE</Text>
            <TouchableOpacity onPress={toggleMask} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={masked ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textDim} />
            </TouchableOpacity>
          </View>

          {pricesReady ? (
            <>
              <Text style={st.heroValue}>
                {m(`${formatEuro(portfolio.totalValue)} ${currencySymbol}`)}
              </Text>

              <View style={{ height: 8 }} />

              {hasPositions && (
                <View style={st.variationRow}>
                  {!masked ? (() => {
                    const g = formatGain(portfolio.gain);
                    const badgeBg =
                      g.state === 'zero' ? 'rgba(245,240,232,0.06)' :
                      g.state === 'positive' ? C.greenDim : 'rgba(224,107,107,0.10)';
                    const badgeColor =
                      g.state === 'zero' ? C.textDim :
                      g.state === 'positive' ? C.green : C.red;
                    const arrow =
                      g.state === 'zero' ? '\u00B7' :
                      g.state === 'positive' ? '▲' : '▼';
                    return (
                    <>
                      <View style={[st.varBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[st.varBadgeText, { color: badgeColor }]}>
                          {arrow} {formatPct(Math.abs(portfolio.gainPct), 2)}
                        </Text>
                      </View>
                      <Text style={[st.varAbs, { color: badgeColor }]}>{g.text} {currencySymbol}</Text>
                      <Text style={st.varPeriod}>Depuis achat</Text>
                    </>
                    );
                  })() : (
                    <View style={[st.varBadge, { backgroundColor: 'rgba(245,240,232,0.06)' }]}>
                      <Text style={[st.varBadgeText, { color: C.textDim }]}>••••••</Text>
                    </View>
                  )}
                </View>
              )}

              {hasPositions && (() => {
                const netG = formatGain(portfolio.netEstime);
                const netColor = masked
                  ? C.textDim
                  : netG.state === 'zero'
                    ? C.textDim
                    : netG.state === 'positive' ? C.green : C.red;
                return (
                  <View style={[st.netBlock, masked && st.netMasked]}>
                    <Text style={st.netLabel}>Résultat net si vente aujourd{'\u2019'}hui</Text>
                    <Text style={[st.netValue, { color: netColor }]}>
                      {m(`${netG.text} ${currencySymbol}`)}
                    </Text>
                  </View>
                );
              })()}
              {hasPositions && portfolio.hasPartialEstimate && (
                <Text style={st.partialNotice}>{PARTIAL_ESTIMATE_NOTICE}</Text>
              )}
            </>
          ) : spotError ? (
            <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>Cours indisponibles</Text>
          ) : (
            <View>
              <View style={{ width: 180, height: 28, borderRadius: 6, backgroundColor: C.border, marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <View style={{ width: 80, height: 22, borderRadius: 5, backgroundColor: C.border }} />
                <View style={{ width: 90, height: 22, borderRadius: 5, backgroundColor: C.border }} />
              </View>
              <View style={{ width: '100%', height: 38, borderRadius: 9, backgroundColor: C.border, marginBottom: 12 }} />
            </View>
          )}

          <TouchableOpacity
            style={[st.ctaFiscal, (!hasPositions || !pricesReady) && { opacity: 0.5 }]}
            onPress={() => {
              if (!hasPositions || !pricesReady) return;
              if (!isPremium) {
                showPaywall();
                return;
              }
              router.push('/fiscalite-globale');
            }}
            activeOpacity={0.7}
            disabled={!hasPositions || !pricesReady}
          >
            <Text style={st.ctaFiscalText}>Voir combien je récupère →</Text>
          </TouchableOpacity>
          <Text style={st.trustLine}>Calcul instantané · Données privées</Text>
        </View>

        {/* ── 3. MA DÉTENTION ────────────────────────────── */}
        <Text style={st.secTitle}>MA DÉTENTION</Text>
        <View style={st.detCard}>
          {Object.entries(portfolio.byMetal).map(([mk, data], i) => {
            const cfg = METAL_CONFIG[mk as MetalType];
            if (!cfg) return null;
            const net = data.cost > 0 ? data.gainValue - data.cost : 0;
            const metalPositions = positions.filter(p => p.metal === mk);
            const isSinglePosition = metalPositions.length === 1;
            const title = isSinglePosition
              ? stripMetalFromName(metalPositions[0]!.product)
              : cfg.name;
            const g = formatGain(net);
            const gainColor = masked
              ? C.textDim
              : g.state === 'zero'
                ? C.textDim
                : g.state === 'positive' ? C.green : C.red;
            return (
              <View key={mk}>
                {i > 0 && <View style={st.divider} />}
                <TouchableOpacity style={st.detRow} onPress={() => router.replace({ pathname: '/(tabs)/portefeuille' as any, params: { metal: cfg.symbol } })} activeOpacity={0.7}>
                  <View style={[st.detBadge, { backgroundColor: cfg.chipBorder, borderColor: cfg.chipBorder }]}>
                    <Text style={[st.detBadgeText, { color: C.background }]}>{cfg.symbol}</Text>
                  </View>
                  <View style={st.detCenter}>
                    <Text style={st.detName} numberOfLines={1}>{title}</Text>
                    <Text style={st.detSub}>{m(`${formatG(data.totalG)} · ${data.count} pièce${data.count > 1 ? 's' : ''}`)}</Text>
                  </View>
                  <View style={st.detRight}>
                    <Text style={st.detVal}>{m(`${formatEuro(data.value)} ${currencySymbol}`)}</Text>
                    <Text style={[st.detNet, { color: gainColor }]}>{m(`Gain : ${g.text} ${currencySymbol}`)}</Text>
                  </View>
                  <Text style={st.chev}>›</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={st.divider} />
          <TouchableOpacity style={st.addRow} onPress={() => router.replace('/(tabs)/ajouter' as any)} activeOpacity={0.7}>
            <Text style={st.addIcon}>+</Text>
            <Text style={st.addText}>Ajouter une position</Text>
          </TouchableOpacity>
          {positions.length === 0 && (
            <Text style={{ color: C.textMuted, fontSize: 11, textAlign: 'center', marginTop: 6, paddingHorizontal: 20, paddingBottom: 10 }}>
              Ajoutez votre première position pour suivre votre gain net.
            </Text>
          )}
        </View>

        {!masked && portfolio.totalValue > 0 && (
          <View style={st.expoRow}>
            <View style={st.expoDot} />
            <Text style={st.expoText}>
              Exposition : {Object.entries(portfolio.byMetal).map(([k, d]) => `${Math.round((d.value / portfolio.totalValue) * 100)} % ${METAL_CONFIG[k as MetalType]?.name ?? k}`).join(' · ')}
            </Text>
          </View>
        )}

        {/* ── 4. COURS MÉTAL (dynamique) ────────────────── */}
        {chartReady ? (
        <View>
        <View style={st.secRow}>
          <Text style={st.secTitle}>COURS {METAL_CONFIG[selectedMetal.key]?.name?.toUpperCase() ?? 'OR'} ({selectedMetal.symbol})</Text>
          {(() => {
            const ch = change24h[selectedMetal.spotKey];
            if (ch != null && ch !== 0) {
              return <Text style={{ color: ch > 0 ? C.green : C.red, fontSize: 11 }}>Variation séance : {ch > 0 ? '+' : ''}{formatPct(ch, 2)}</Text>;
            }
            return <Text style={{ color: C.textDim, fontSize: 11 }}>Inchangé</Text>;
          })()}
        </View>

        <View style={st.chartCard}>
          <View style={st.chartPerfRow}>
            <Text style={st.chartPerfLabel}>Performance sur la période</Text>
            {chartData && <Text style={[st.chartPerfVal, { color: chartData.perf >= 0 ? C.green : C.red }]}>{chartData.perf >= 0 ? '+' : ''}{formatPct(chartData.perf, 2)}</Text>}
          </View>

          <View style={st.pillRow}>
            {(['1S', '1M', '3M', '1A', '5A', '10A', '20A'] as HistoryPeriod[]).map(p => (
              <TouchableOpacity
                key={p}
                style={[st.pill, selectedPeriod === p && st.pillAct, isPeriodLocked(p) && st.periodLocked]}
                onPress={() => {
                  if (isPeriodLocked(p)) {
                    showPaywall();
                    return;
                  }
                  setSelectedPeriod(p);
                }}>
                <Text style={[st.pillTxt, selectedPeriod === p && st.pillTxtAct, isPeriodLocked(p) && st.periodLockedText]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {chartActualCurrency === 'USD' && (
            <Text style={{ color: C.textMuted, fontSize: 11, textAlign: 'right', marginBottom: 4, opacity: 0.7 }}>Cours en USD (source historique)</Text>
          )}

          {chartData && (
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push({ pathname: '/graphique' as any, params: { metal: selectedMetal.spotKey, currency: chartActualCurrency } })}>
              <Svg width={chartW} height={110} style={{ marginTop: 8 }}>
                <Defs>
                  <LinearGradient id="chG" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={C.gold} stopOpacity="0.10" />
                    <Stop offset="1" stopColor={C.gold} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Path d={buildFillPath(chartData.pts, chartW, 110)} fill="url(#chG)" />
                <Path d={buildSvgPath(chartData.pts, chartW, 110)} stroke={C.gold} strokeWidth={1.5} fill="none" opacity={0.85} />
              </Svg>
            </TouchableOpacity>
          )}

          {chartHistory.length > 2 && (() => {
            const first = chartHistory[0]?.date ?? '';
            const mid = chartHistory[Math.floor(chartHistory.length / 2)]?.date ?? '';
            const last = chartHistory[chartHistory.length - 1]?.date ?? '';
            // Detect short range: < 90 days between first and last data point
            const t0 = new Date(first).getTime();
            const t1 = new Date(last).getTime();
            const shortRange = !isNaN(t0) && !isNaN(t1) && (t1 - t0) < 90 * 24 * 60 * 60 * 1000;
            const l1 = formatChartDate(first, selectedPeriod, shortRange);
            const l2 = formatChartDate(mid, selectedPeriod, shortRange);
            const l3 = formatChartDate(last, selectedPeriod, shortRange);
            // Anti-duplicate guard: hide middle label if it matches first or last
            const showMid = l2 !== l1 && l2 !== l3;
            return (
              <View style={st.chartDates}>
                <Text style={st.chartDate}>{l1}</Text>
                <Text style={st.chartDate}>{showMid ? l2 : ''}</Text>
                <Text style={st.chartDate}>{l3 !== l1 ? l3 : ''}</Text>
              </View>
            );
          })()}

          {chartData && (
            <View style={st.mmRow}>
              <Text style={st.mmText}>Min {formatEuro(chartData.minVal)} {chartCurrencySymbol}</Text>
              <Text style={st.mmText}>Max {formatEuro(chartData.maxVal)} {chartCurrencySymbol}</Text>
            </View>
          )}

          <TouchableOpacity onPress={() => router.push({ pathname: '/graphique' as any, params: { metal: selectedMetal.spotKey, currency: chartActualCurrency } })} activeOpacity={0.7}>
            <Text style={{ color: C.gold, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 6 }}>Voir le cours complet →</Text>
          </TouchableOpacity>
        </View>
        </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ width: 160, height: 12, borderRadius: 4, backgroundColor: C.border }} />
              <View style={{ width: 60, height: 12, borderRadius: 4, backgroundColor: C.border }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={{ width: 42, height: 24, borderRadius: 6, backgroundColor: C.border }} />
              ))}
            </View>
            <View style={{ height: 110, borderRadius: 8, backgroundColor: C.border, opacity: 0.3, marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ width: 80, height: 10, borderRadius: 4, backgroundColor: C.border }} />
              <View style={{ width: 80, height: 10, borderRadius: 4, backgroundColor: C.border }} />
            </View>
          </View>
        )}

        {/* ── 4b. RADAR PRIME ─────────────────────────────── */}
        {/* SCREENSHOT MODE — Radar Prime masqué temporairement */}
        {false && (
        <TouchableOpacity
          style={st.radarTeaserCard}
          activeOpacity={0.85}
          onPress={() => setRadarTeaserMessageVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Radar Prime bientot disponible"
        >
          <View style={st.radarTeaserHeader}>
            <View style={st.radarTeaserTitleRow}>
              <Ionicons name="radio-outline" size={18} color={C.gold} />
              <Text style={st.radarTeaserTitle}>Radar Prime</Text>
            </View>
            <View style={st.radarTeaserBadge}>
              <Text style={st.radarTeaserBadgeText}>Bientôt disponible</Text>
            </View>
          </View>
          <Text style={st.radarTeaserText}>
            Suivez les primes marché en temps réel.
          </Text>
          <View style={st.radarTeaserPreview} pointerEvents="none">
            <View style={st.radarTeaserLine}>
              <View style={st.radarTeaserSkeletonLong} />
              <View style={st.radarTeaserSkeletonBadge} />
            </View>
            <View style={st.radarTeaserLine}>
              <View style={st.radarTeaserSkeletonShort} />
              <View style={st.radarTeaserSkeletonBadgeMuted} />
            </View>
          </View>
          {radarTeaserMessageVisible && (
            <Text style={st.radarTeaserInline}>Disponible prochainement.</Text>
          )}
        </TouchableOpacity>
        )}

        {/* ── 5. ALERTES ─────────────────────────────────── */}
        <TouchableOpacity style={st.alertCard} onPress={() => router.replace({ pathname: '/(tabs)/alertes' as any, params: { metal: selectedMetal.symbol } })} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={20} color={C.gold} />
          <Text style={st.alertText}>Créer une alerte sur {METAL_ARTICLE[selectedMetal.symbol] || 'ce métal'}</Text>
          <Text style={st.chev}>›</Text>
        </TouchableOpacity>

        {/* ── 6. MARCHÉS ─────────────────────────────────── */}
        <Text style={st.secTitle}>MARCHÉS</Text>
        <ScrollView
          ref={marketScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP_INTERVAL}
          decelerationRate="fast"
          onScroll={handleMarketScroll}
          onMomentumScrollEnd={handleMarketScrollEnd}
          onScrollEndDrag={handleMarketScrollEnd}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingRight: CARD_WIDTH }}
        >
          {MARKET_METALS.map(mm => {
            const cfg = METAL_CONFIG[mm.key];
            const rawSpot = prices[mm.spotKey];
            const spot = rawSpot;
            const ch = change24h[mm.spotKey];
            const isActive = selectedMetal.spotKey === mm.spotKey;
            return (
              <TouchableOpacity
                key={mm.key}
                style={[st.mktCard, isActive && { borderColor: C.gold, backgroundColor: 'rgba(201,168,76,0.04)' }]}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedMetal({ key: mm.key, spotKey: mm.spotKey, symbol: cfg.symbol });
                  const idx = MARKET_METALS.findIndex(m => m.key === mm.key);
                  if (idx === -1) return;
                  setActiveMarketIdx(idx);
                  isProgrammaticScroll.current = true;
                  marketScrollRef.current?.scrollTo({ x: idx * SNAP_INTERVAL, animated: true });
                }}
              >
                <Text style={st.mktChev}>›</Text>
                <Text style={st.mktName}>{cfg.name}</Text>
                <Text style={st.mktPrice}>{spot !== null ? formatEuro(spot) : '—'}</Text>
                <Text style={st.mktUnit}>{mm.unit}</Text>
                {ch != null && ch !== 0 ? (
                  <Text style={{ color: ch > 0 ? C.green : C.red, fontSize: 11, marginTop: 4 }}>
                    {ch > 0 ? '▲' : '▼'} {ch > 0 ? '+' : ''}{formatPct(ch, 2)}
                  </Text>
                ) : (
                  <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 4 }}>Inchangé</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={st.dotRow}>
          {MARKET_METALS.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => {
              isProgrammaticScroll.current = true;
              marketScrollRef.current?.scrollTo({ x: i * SNAP_INTERVAL, animated: true });
              setActiveMarketIdx(i);
            }} style={[st.dot, i === activeMarketIdx && st.dotAct]} />
          ))}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scroll: { padding: 20, paddingBottom: 90 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerDate: { fontSize: 13, fontWeight: '500', color: C.textDim },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#14B8A6', opacity: 0.6 },
  headerTime: { fontSize: 11, color: C.textDim },

  hero: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden', padding: 16, marginBottom: 16, position: 'relative' },
  heroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  heroLabel: { fontSize: 11, fontWeight: '600', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1 },
  heroValue: { fontSize: 30, fontWeight: '700', color: C.white },

  variationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  varBadge: { borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7 },
  varBadgeText: { fontSize: 12.5, fontWeight: '700' },
  varAbs: { color: C.textDim, fontSize: 12, marginLeft: 8 },
  varPeriod: { color: C.textDim, fontSize: 11, marginLeft: 'auto' },

  netBlock: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, backgroundColor: 'rgba(201,168,76,0.03)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.10)', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 12 },
  netMasked: { backgroundColor: 'rgba(245,240,232,0.02)', borderColor: 'rgba(245,240,232,0.06)' },
  netLabel: { color: C.textDim, fontSize: 12 },
  netValue: { color: C.gold, fontSize: 17, fontWeight: '700' },
  partialNotice: { color: C.textDim, fontSize: 11, lineHeight: 16, marginTop: 8 },

  ctaFiscal: { borderWidth: 1.5, borderColor: C.gold, backgroundColor: 'transparent', borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  ctaFiscalText: { color: C.gold, fontSize: 13.5, fontWeight: '700', textAlign: 'center' },
  trustLine: { color: C.textDim, fontSize: 12, textAlign: 'center', marginTop: 5 },

  secTitle: { fontSize: 12, fontWeight: '700', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 6 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 6 },

  detCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 4 },
  detRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  detBadge: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: C.gold, justifyContent: 'center', alignItems: 'center' },
  detBadgeText: { color: C.gold, fontSize: 10, fontWeight: '700' },
  detCenter: { flex: 1, marginLeft: 12 },
  detName: { color: C.white, fontSize: 14, fontWeight: '600' },
  detSub: { color: C.textDim, fontSize: 12, marginTop: 1 },
  detRight: { alignItems: 'flex-end', marginRight: 8 },
  detVal: { color: C.white, fontSize: 14, fontWeight: '600' },
  detNet: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  chev: { color: C.textDim, opacity: 0.65, fontSize: 18 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.divider },
  addRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12 },
  addIcon: { color: C.gold, fontSize: 16 },
  addText: { color: C.gold, fontSize: 12, fontWeight: '600' },

  expoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 8 },
  expoDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold, opacity: 0.45 },
  expoText: { color: C.textDim, fontSize: 11, flex: 1 },

  chartCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16 },
  chartPerfRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  chartPerfLabel: { color: C.textDim, fontSize: 11 },
  chartPerfVal: { fontSize: 13, fontWeight: '700' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
  pillAct: { backgroundColor: C.goldDim, borderColor: 'rgba(201,168,76,0.3)' },
  pillTxt: { fontSize: 11, fontWeight: '600', color: C.textDim },
  pillTxtAct: { color: C.gold },
  periodLocked: { opacity: 0.55 },
  periodLockedText: { color: C.tabIconDefault },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', opacity: 0.6 },
  lockTxt: { color: C.textDim, fontSize: 10 },
  chartDates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  chartDate: { color: C.textDim, fontSize: 10 },
  mmRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(201,168,76,0.03)', borderRadius: 8 },
  mmText: { color: C.textDim, fontSize: 10, fontWeight: '600' },

  radarTeaserCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16, opacity: 0.92 },
  radarTeaserHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 },
  radarTeaserTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  radarTeaserTitle: { color: C.white, fontSize: 14, fontWeight: '700' },
  radarTeaserBadge: { borderRadius: 8, borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)', backgroundColor: 'rgba(201,168,76,0.10)', paddingHorizontal: 8, paddingVertical: 4 },
  radarTeaserBadgeText: { color: C.gold, fontSize: 10, fontWeight: '700' },
  radarTeaserText: { color: C.textDim, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  radarTeaserPreview: { borderRadius: 10, borderWidth: 1, borderColor: C.divider, padding: 10, gap: 8, backgroundColor: 'rgba(245,240,232,0.02)' },
  radarTeaserLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  radarTeaserSkeletonLong: { height: 10, borderRadius: 5, backgroundColor: C.border, opacity: 0.75, flex: 1 },
  radarTeaserSkeletonShort: { height: 10, borderRadius: 5, backgroundColor: C.border, opacity: 0.45, flex: 0.72 },
  radarTeaserSkeletonBadge: { width: 74, height: 18, borderRadius: 6, backgroundColor: 'rgba(201,168,76,0.18)' },
  radarTeaserSkeletonBadgeMuted: { width: 58, height: 18, borderRadius: 6, backgroundColor: C.border, opacity: 0.45 },
  radarTeaserInline: { color: C.textMuted, fontSize: 11, textAlign: 'center', marginTop: 10 },

  alertCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16 },
  alertText: { color: C.white, fontSize: 13, fontWeight: '600', flex: 1, marginLeft: 10 },

  mktCard: { width: CARD_WIDTH, marginRight: 10, backgroundColor: C.card, borderRadius: 13, borderWidth: 1, borderColor: C.border, padding: 12 },
  mktName: { color: C.textDim, fontSize: 11, fontWeight: '600' },
  mktPrice: { color: C.white, fontSize: 15, fontWeight: '700', marginTop: 2 },
  mktUnit: { color: C.textDim, fontSize: 11 },
  mktChev: { position: 'absolute', top: 10, right: 10, color: C.textDim, fontSize: 12 },
  dotRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8, gap: 4, marginBottom: 16 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(201,168,76,0.18)' },
  dotAct: { width: 14, height: 5, borderRadius: 3, backgroundColor: C.gold },
});
