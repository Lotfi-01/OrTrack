import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Ionicons from '@expo/vector-icons/Ionicons';
import { PriceChart } from '@/components/price-chart';
import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── Types (miroir de ajouter.tsx / portefeuille.tsx) ─────────────────────────

type MetalType = 'or' | 'argent' | 'platine' | 'palladium' | 'cuivre';

type Position = {
  id: string;
  metal: MetalType;
  product: string;
  weightG: number;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  createdAt: string;
};

type PricePoint = {
  timestamp: number;
  gold: number;
  silver: number;
  platinum: number;
  palladium: number;
  copper: number;
};

const STORAGE_KEY = '@ortrack:positions';
const HIDE_VALUE_KEY = '@ortrack:hide_portfolio_value';
const OZ_TO_G = 31.10435;

const { width } = Dimensions.get('window');
const cardHalfWidth = (width - 40 - 12) / 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(value: number): string {
  const [int, dec] = value.toFixed(2).split('.');
  const thousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return `${thousands},${dec}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtG(g: number): string {
  if (g >= 1000) {
    return `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} kg`;
  }
  return `${g % 1 === 0 ? g : g.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
}

function fmtQty(n: number): string {
  const qty = n % 1 === 0 ? String(n) : n.toFixed(2);
  return `${qty} pièce${n > 1 ? 's' : ''}`;
}

function fmtPct(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace('.', ',');
}

// ─── Config cours & graphique ────────────────────────────────────────────────

type ChartMetal = 'gold' | 'silver' | 'platinum' | 'palladium' | 'copper';

const METALS_CONFIG: { metal: ChartMetal; name: string; symbol: string; color: string }[] = [
  { metal: 'gold', name: 'Or', symbol: 'XAU', color: '#C9A84C' },
  { metal: 'silver', name: 'Argent', symbol: 'XAG', color: '#A8A8B8' },
  { metal: 'platinum', name: 'Platine', symbol: 'XPT', color: '#E0E0E0' },
  { metal: 'palladium', name: 'Palladium', symbol: 'XPD', color: '#CBA135' },
  { metal: 'copper', name: 'Cuivre', symbol: 'XCU', color: '#B87333' },
];

// ─── Composant principal ──────────────────────────────────────────────────────

export default function TableauDeBordScreen() {
  const { prices, pricesUsd, loading, refreshing, error, lastUpdated, refresh, currency, currencySymbol } = useSpotPrices();
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedChartMetal, setSelectedChartMetal] = useState<ChartMetal>('gold');
  const [change24h, setChange24h] = useState<Partial<Record<string, number>>>({});
  const [hideValue, setHideValue] = useState(false);

  // Recharge à chaque activation de l'onglet
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => setPositions(raw ? JSON.parse(raw) : []))
        .catch(() => setPositions([]));
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      async function checkCacheAndRefresh() {
        const cached = await AsyncStorage.getItem('@ortrack:spot_cache');
        if (!cached) {
          refresh();
        }
      }
      checkCacheAndRefresh();
    }, [refresh])
  );

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(HIDE_VALUE_KEY).then((val) => {
        setHideValue(val === 'true');
      });
    }, [])
  );

  const toggleHideValue = useCallback(() => {
    setHideValue((prev) => {
      const next = !prev;
      AsyncStorage.setItem(HIDE_VALUE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    async function compute24hChange() {
      try {
        const raw = await AsyncStorage.getItem('@ortrack:price_history');
        if (!raw) return;
        const history: PricePoint[] = JSON.parse(raw);
        if (history.length < 2) return;

        const now = Date.now();
        const target = now - 24 * 60 * 60 * 1000;

        // Point le plus proche de 24h
        const point24h = history.reduce((prev, curr) =>
          Math.abs(curr.timestamp - target) < Math.abs(prev.timestamp - target)
            ? curr : prev
        );

        // Ignore si point trop récent (< 1h d'ancienneté)
        if (now - point24h.timestamp < 60 * 60 * 1000) return;

        const currentMap: Record<string, number | null> = {
          gold: pricesUsd.gold,
          silver: pricesUsd.silver,
          platinum: pricesUsd.platinum,
          palladium: pricesUsd.palladium,
          copper: pricesUsd.copper,
        };

        const changes: Partial<Record<string, number>> = {};
        const keys = ['gold', 'silver', 'platinum', 'palladium', 'copper'] as const;

        keys.forEach(key => {
          const past = point24h[key];
          const current = currentMap[key];
          if (past && current && past > 0) {
            changes[key] = ((current - past) / past) * 100;
          }
        });

        setChange24h(changes);
      } catch {
        // Silencieux — pas de variation affichée
      }
    }

    if (Object.values(pricesUsd).some(v => v !== null)) {
      compute24hChange();
    }
  }, [pricesUsd]);

  const pricesReady = !loading && prices.gold !== null;
  const hasPositions = positions.length > 0;

  const portfolio = useMemo(() => {
    const goldTotalG = positions.filter((p) => p.metal === 'or').reduce((s, p) => s + p.quantity * p.weightG, 0);
    const silverTotalG = positions.filter((p) => p.metal === 'argent').reduce((s, p) => s + p.quantity * p.weightG, 0);
    const platinumTotalG = positions.filter((p) => p.metal === 'platine').reduce((s, p) => s + p.quantity * p.weightG, 0);
    const palladiumTotalG = positions.filter((p) => p.metal === 'palladium').reduce((s, p) => s + p.quantity * p.weightG, 0);
    const copperTotalG = positions.filter((p) => p.metal === 'cuivre').reduce((s, p) => s + p.quantity * p.weightG, 0);

    const goldPieces = positions.filter((p) => p.metal === 'or').reduce((s, p) => s + p.quantity, 0);
    const silverPieces = positions.filter((p) => p.metal === 'argent').reduce((s, p) => s + p.quantity, 0);
    const platinumPieces = positions.filter((p) => p.metal === 'platine').reduce((s, p) => s + p.quantity, 0);
    const palladiumPieces = positions.filter((p) => p.metal === 'palladium').reduce((s, p) => s + p.quantity, 0);
    const copperPieces = positions.filter((p) => p.metal === 'cuivre').reduce((s, p) => s + p.quantity, 0);

    let totalValue = 0;
    let totalCost = 0;

    for (const p of positions) {
      const spot =
        p.metal === 'or' ? prices.gold :
        p.metal === 'argent' ? prices.silver :
        p.metal === 'platine' ? prices.platinum :
        p.metal === 'palladium' ? prices.palladium :
        prices.copper;
      totalCost += p.quantity * p.purchasePrice;
      if (spot !== null) {
        totalValue += p.quantity * (p.weightG / OZ_TO_G) * spot;
      }
    }

    const totalGainLoss = totalCost > 0 ? totalValue - totalCost : null;
    const totalGainLossPct =
      totalGainLoss !== null && totalCost > 0
        ? (totalGainLoss / totalCost) * 100
        : null;

    return {
      goldTotalG, silverTotalG, platinumTotalG, palladiumTotalG, copperTotalG,
      goldPieces, silverPieces, platinumPieces, palladiumPieces, copperPieces,
      totalValue, totalCost, totalGainLoss, totalGainLossPct,
    };
  }, [positions, prices]);

  const portfolioMetals = [
    { key: 'or', label: 'Or', symbol: 'XAU', color: '#C9A84C', totalG: portfolio.goldTotalG, pieces: portfolio.goldPieces },
    { key: 'argent', label: 'Argent', symbol: 'XAG', color: '#A8A8B8', totalG: portfolio.silverTotalG, pieces: portfolio.silverPieces },
    { key: 'platine', label: 'Platine', symbol: 'XPT', color: '#E0E0E0', totalG: portfolio.platinumTotalG, pieces: portfolio.platinumPieces },
    { key: 'palladium', label: 'Palladium', symbol: 'XPD', color: '#CBA135', totalG: portfolio.palladiumTotalG, pieces: portfolio.palladiumPieces },
    { key: 'cuivre', label: 'Cuivre', symbol: 'XCU', color: '#B87333', totalG: portfolio.copperTotalG, pieces: portfolio.copperPieces },
  ].filter((m) => m.totalG > 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={OrTrackColors.gold}
            colors={[OrTrackColors.gold]}
          />
        }>

        {/* ── 1. Header compact ── */}
        <View style={styles.headerRow}>
          <Text style={styles.headerBrand}>ORTRACK</Text>
          {loading && !prices.gold ? (
            <ActivityIndicator size="small" color={OrTrackColors.gold} />
          ) : lastUpdated ? (
            <Text style={styles.headerTime}>Mis à jour à {formatTime(lastUpdated)}</Text>
          ) : null}
        </View>

        {/* ── 2. Hero card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroLabelRow}>
            <Text style={styles.heroLabel}>VALEUR TOTALE ESTIMÉE</Text>
            <TouchableOpacity
              onPress={toggleHideValue}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={hideValue ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={OrTrackColors.subtext}
              />
            </TouchableOpacity>
          </View>

          {!hasPositions ? (
            <>
              <Text style={styles.heroValue}>— {currencySymbol}</Text>
              <Text style={styles.heroHint}>Ajoutez des actifs pour commencer</Text>
            </>
          ) : loading || !pricesReady ? (
            <ActivityIndicator size="large" color={OrTrackColors.gold} style={styles.heroSpinner} />
          ) : (
            <>
              {hideValue ? (
                <View style={styles.blurRow}>
                  <View style={[styles.blurBlock, { width: 80 }]} />
                  <View style={[styles.blurBlock, { width: 60 }]} />
                  <View style={[styles.blurBlock, { width: 40 }]} />
                </View>
              ) : (
                <Text style={styles.heroValue}>
                  {formatEur(portfolio.totalValue)} {currencySymbol}
                </Text>
              )}
              {portfolio.totalGainLoss !== null && !hideValue && (
                <View style={styles.gainRow}>
                  <Text style={[
                    styles.gainValue,
                    portfolio.totalGainLoss >= 0 ? styles.changePositive : styles.changeNegative,
                  ]}>
                    {portfolio.totalGainLoss >= 0 ? '+' : ''}
                    {formatEur(portfolio.totalGainLoss)} {currencySymbol}
                  </Text>
                  {portfolio.totalGainLossPct !== null && (
                    <Text style={[
                      styles.gainPct,
                      portfolio.totalGainLoss >= 0 ? styles.changePositive : styles.changeNegative,
                    ]}>
                      {'  '}{portfolio.totalGainLoss >= 0 ? '+' : ''}
                      {fmtPct(portfolio.totalGainLossPct)} %
                    </Text>
                  )}
                </View>
              )}
            </>
          )}
        </View>

        {/* ── 3. Graphique unique ── */}
        <Text style={styles.sectionTitle}>HISTORIQUE</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          style={styles.chartSelector}>
          {METALS_CONFIG.map((m) => {
            const active = selectedChartMetal === m.metal;
            return (
              <TouchableOpacity
                key={m.metal}
                style={[
                  styles.chartBtn,
                  { borderColor: m.color },
                  active ? { backgroundColor: m.color } : { backgroundColor: OrTrackColors.card },
                ]}
                onPress={() => setSelectedChartMetal(m.metal)}>
                <Text style={[
                  styles.chartBtnText,
                  active ? { color: OrTrackColors.background } : { color: m.color },
                ]}>
                  {m.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <PriceChart
          metal={selectedChartMetal}
          currency={currency}
          compact
          onFullScreen={() => router.push(`/graphique?metal=${selectedChartMetal}&currency=${currency}` as any)}
        />

        {/* ── 4. Cours en direct ── */}
        <Text style={styles.sectionTitle}>COURS EN DIRECT</Text>

        {/* Bandeau erreur */}
        {error && !loading && (
          <View style={styles.errorBanner}>
            <View style={styles.errorRow}>
              <Text style={styles.errorIcon}>!</Text>
              <Text style={styles.errorText}>{error} — Vérifiez votre connexion.</Text>
            </View>
            <TouchableOpacity onPress={refresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.spotGrid}>
          {METALS_CONFIG.map((m) => {
            const spot = prices[m.metal];
            const isCopper = m.metal === 'copper';
            const displayPrice = spot !== null
              ? isCopper ? spot * (1000 / OZ_TO_G) : spot
              : null;
            const unitLabel = isCopper ? `${currencySymbol}/kg` : `${currencySymbol}/oz`;
            return (
              <View key={m.metal} style={[
                styles.spotCard,
                isCopper && { width: '100%' as const },
              ]}>
                <View style={styles.spotInner}>
                  <View>
                    <Text style={styles.spotName}>{m.name}</Text>
                    <Text style={styles.spotSymbol}>{m.symbol}</Text>
                    {loading && !prices.gold ? (
                      <ActivityIndicator size="small" color={OrTrackColors.gold} style={styles.spotSpinner} />
                    ) : displayPrice !== null ? (
                      <>
                        <Text style={styles.spotPrice}>{formatEur(displayPrice)}</Text>
                        <Text style={styles.spotUnit}>{unitLabel}</Text>
                        {change24h[m.metal] !== undefined && (
                          <Text style={[
                            styles.spotChange,
                            change24h[m.metal]! >= 0
                              ? styles.spotChangePositive
                              : styles.spotChangeNegative,
                          ]}>
                            {change24h[m.metal]! >= 0 ? '▲' : '▼'}{' '}
                            {fmtPct(Math.abs(change24h[m.metal]!))}%
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.spotUnavailable}>—</Text>
                    )}
                  </View>
                  <View style={[
                    styles.spotBadge,
                    { borderColor: m.color },
                    m.metal === 'platinum' && { backgroundColor: 'rgba(224,224,224,0.15)' },
                  ]}>
                    <Text style={[styles.spotBadgeText, { color: m.color }]}>{m.symbol}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── 5. Portefeuille résumé ── */}
        {hasPositions && portfolioMetals.length > 0 && !hideValue && (
          <>
            <Text style={styles.sectionTitle}>MON PORTEFEUILLE</Text>
            <View style={styles.portfolioCard}>
              {portfolioMetals.map((m, i) => (
                <View key={m.key}>
                  {i > 0 && <View style={styles.separator} />}
                  <View style={styles.portfolioRow}>
                    <View style={styles.portfolioLeft}>
                      <View style={[styles.miniBadge, { borderColor: m.color }]}>
                        <Text style={[styles.miniBadgeText, { color: m.color }]}>{m.symbol}</Text>
                      </View>
                      <Text style={styles.portfolioLabel}>{m.label}</Text>
                    </View>
                    <View style={styles.portfolioRight}>
                      <Text style={styles.portfolioWeight}>{fmtG(m.totalG)}</Text>
                      <Text style={styles.portfolioPieces}>{fmtQty(m.pieces)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── 6. Accès rapide alertes ── */}
        <TouchableOpacity style={styles.alertsBtn} onPress={() => router.push('/alertes')}>
          <Text style={styles.alertsBtnText}>Alertes de cours</Text>
          <Text style={styles.alertsArrow}>›</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OrTrackColors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },

  // 1. Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerBrand: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
    letterSpacing: 2,
  },
  headerTime: {
    fontSize: 11,
    color: OrTrackColors.subtext,
  },

  // 2. Hero
  heroCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  heroLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
    color: OrTrackColors.white,
  },
  blurRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 40,
  },
  blurBlock: {
    height: 28,
    borderRadius: 8,
    backgroundColor: OrTrackColors.subtext,
    opacity: 0.25,
  },
  heroHint: {
    fontSize: 12,
    color: OrTrackColors.tabIconDefault,
    marginTop: 6,
  },
  heroSpinner: {
    alignSelf: 'flex-start',
    marginVertical: 8,
  },
  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  gainValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  gainPct: {
    fontSize: 14,
    fontWeight: '500',
  },
  changePositive: { color: '#4CAF50' },
  changeNegative: { color: '#E07070' },

  // 3. Portefeuille résumé
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  portfolioCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  portfolioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  portfolioLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: OrTrackColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  portfolioLabel: {
    fontSize: 14,
    color: OrTrackColors.white,
    fontWeight: '500',
    marginLeft: 10,
  },
  portfolioRight: {
    alignItems: 'flex-end',
  },
  portfolioWeight: {
    fontSize: 14,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  portfolioPieces: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: OrTrackColors.border,
  },

  // 4. Cours en direct
  spotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  spotCard: {
    width: cardHalfWidth,
    padding: 12,
    borderRadius: 10,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  spotInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spotName: {
    fontSize: 12,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  spotSymbol: {
    fontSize: 10,
    color: OrTrackColors.subtext,
    marginBottom: 4,
  },
  spotPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  spotUnavailable: {
    fontSize: 16,
    fontWeight: '700',
    color: OrTrackColors.subtext,
  },
  spotUnit: {
    fontSize: 10,
    color: OrTrackColors.subtext,
    marginTop: 1,
  },
  spotChange: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  spotChangePositive: {
    color: '#4CAF50',
  },
  spotChangeNegative: {
    color: '#E07070',
  },
  spotSpinner: {
    alignSelf: 'flex-start',
    marginVertical: 2,
  },
  spotBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: OrTrackColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // 5. Graphique
  chartSelector: {
    marginBottom: 12,
  },
  chartBtn: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  chartBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // 6. Alertes
  alertsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 16,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  alertsBtnText: {
    fontSize: 13,
    color: OrTrackColors.white,
    fontWeight: '500',
  },
  alertsArrow: {
    fontSize: 20,
    color: OrTrackColors.gold,
    fontWeight: '300',
    lineHeight: 22,
  },

  // Error banner
  errorBanner: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(224,112,112,0.3)',
    padding: 14,
    marginBottom: 16,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  errorIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E07070',
    lineHeight: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#E07070',
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E07070',
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E07070',
  },

});
