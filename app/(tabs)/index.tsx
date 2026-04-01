import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { loadPriceHistory } from '@/hooks/use-metal-history';
import { type SpotPrices, useSpotPrices } from '@/hooks/use-spot-prices';
import { OZ_TO_G } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { formatEuro, formatG, formatPct, formatQty, formatTimeFR, JOURS_FR, MOIS_FR } from '@/utils/format';
import { Position } from '@/types/position';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { usePositions } from '@/hooks/use-positions';

// ─── Types ───────────────────────────────────────────────────────────────────

type MetalType = 'or' | 'argent' | 'platine' | 'palladium' | 'cuivre';

type PricePoint = {
  timestamp: number;
  gold: number;
  silver: number;
  platinum: number;
  palladium: number;
  copper: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


// ─── Config cours & graphique ────────────────────────────────────────────────

type ChartMetal = 'gold' | 'silver' | 'platinum' | 'palladium' | 'copper';

const METALS_CONFIG: { metal: ChartMetal; name: string; symbol: string; color: string }[] = [
  { metal: 'gold', name: 'Or', symbol: 'XAU', color: '#C9A84C' },
  { metal: 'silver', name: 'Argent', symbol: 'XAG', color: '#A8A8B8' },
  { metal: 'platinum', name: 'Platine', symbol: 'XPT', color: '#E0E0E0' },
  { metal: 'palladium', name: 'Palladium', symbol: 'XPD', color: '#CBA135' },
  { metal: 'copper', name: 'Cuivre', symbol: 'XCU', color: '#B87333' },
];

const METAL_SPOT_KEY: Record<string, keyof SpotPrices> = {
  or: 'gold', argent: 'silver', platine: 'platinum',
  palladium: 'palladium', cuivre: 'copper',
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function TableauDeBordScreen() {
  const { prices, pricesUsd, loading, refreshing, error, lastUpdated, refresh, currency, currencySymbol } = useSpotPrices();
  const { positions, loading: positionsLoading, reloadPositions } = usePositions();
  const positionsLoaded = !positionsLoading;
  const [selectedChartMetal, setSelectedChartMetal] = useState<ChartMetal>('gold');
  const [change24h, setChange24h] = useState<Partial<Record<string, number>>>({});
  const [hideValue, setHideValue] = useState(false);
  const [dateStr, setDateStr] = useState('');

  // Date française — rafraîchie au retour sur l'onglet
  useFocusEffect(
    useCallback(() => {
      const d = new Date();
      setDateStr(JOURS_FR[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_FR[d.getMonth()]);
    }, [])
  );

  // Recharge positions à chaque activation de l'onglet
  useFocusEffect(
    useCallback(() => {
      reloadPositions();
    }, [reloadPositions])
  );

  useFocusEffect(
    useCallback(() => {
      async function checkCacheAndRefresh() {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.spotCache);
        if (!cached) {
          refresh();
        }
      }
      checkCacheAndRefresh();
    }, [refresh])
  );

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEYS.hidePortfolioValue).then((val) => {
        setHideValue(val === 'true');
      });
    }, [])
  );

  const toggleHideValue = useCallback(() => {
    setHideValue((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEYS.hidePortfolioValue, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    async function compute24hChange() {
      try {
        const history = await loadPriceHistory('1S', 'USD');
        if (history.length < 2) return;

        // Cibler explicitement la date d'hier
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const point24h = history.find(p => p.date === yesterdayStr)
          ?? history[history.length - 2];
        if (!point24h) return;

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

    // Net global estimé (forfaitaire)
    const totalNetEstime = (totalGainLoss !== null && totalGainLoss > 0)
      ? totalValue - (totalValue * TAX.forfaitaireRate) - totalCost
      : totalGainLoss;

    return {
      goldTotalG, silverTotalG, platinumTotalG, palladiumTotalG, copperTotalG,
      goldPieces, silverPieces, platinumPieces, palladiumPieces, copperPieces,
      totalValue, totalCost, totalGainLoss, totalGainLossPct, totalNetEstime,
    };
  }, [positions, prices]);

  const portfolioMetals = useMemo(() =>
    [
      { key: 'or', label: 'Or', symbol: 'XAU', color: '#C9A84C', totalG: portfolio.goldTotalG, pieces: portfolio.goldPieces },
      { key: 'argent', label: 'Argent', symbol: 'XAG', color: '#A8A8B8', totalG: portfolio.silverTotalG, pieces: portfolio.silverPieces },
      { key: 'platine', label: 'Platine', symbol: 'XPT', color: '#E0E0E0', totalG: portfolio.platinumTotalG, pieces: portfolio.platinumPieces },
      { key: 'palladium', label: 'Palladium', symbol: 'XPD', color: '#CBA135', totalG: portfolio.palladiumTotalG, pieces: portfolio.palladiumPieces },
      { key: 'cuivre', label: 'Cuivre', symbol: 'XCU', color: '#B87333', totalG: portfolio.copperTotalG, pieces: portfolio.copperPieces },
    ]
    .filter((m) => m.totalG > 0)
    .map(m => {
      const spotKey = METAL_SPOT_KEY[m.key];
      const spot = spotKey ? prices[spotKey] : null;
      const value = spot && m.totalG ? (m.totalG / OZ_TO_G) * spot : null;

      // Net estimé par métal
      const cost = positions
        .filter(p => p.metal === m.key)
        .reduce((s, p) => s + p.quantity * p.purchasePrice, 0);
      const gain = value !== null ? value - cost : null;
      const netEstime = (value !== null && gain !== null && gain > 0)
        ? value - (value * TAX.forfaitaireRate) - cost
        : gain;

      return { ...m, value, netEstime };
    }),
    [portfolio, prices, positions]
  );

  const selectedMetalConfig = useMemo(() =>
    METALS_CONFIG.find(m => m.metal === selectedChartMetal)!,
    [selectedChartMetal]
  );

  // ── Navigation inter-tabs ────────────────────────────────────────────────

  const navigateToPortfolio = useCallback(() => {
    router.navigate('/(tabs)/portefeuille');
  }, []);

  const navigateToAjouter = useCallback(() => {
    router.navigate('/(tabs)/ajouter');
  }, []);

  const handleSelectMetal = useCallback((metal: ChartMetal) => {
    setSelectedChartMetal(metal);
  }, []);

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

        {/* ── 1. Header — date + heure ── */}
        <View style={styles.headerRow}>
          <Text style={styles.headerDate}>{dateStr}</Text>
          {loading && !prices.gold ? (
            <ActivityIndicator size="small" color={OrTrackColors.gold} />
          ) : lastUpdated ? (
            <Text style={styles.headerTime}>Mis à jour à {formatTimeFR(lastUpdated)}</Text>
          ) : null}
        </View>

        {/* ── 2. Hero card — valeur totale ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroLabelRow}>
            <Text style={styles.heroLabel}>VALEUR DE VOTRE PORTEFEUILLE</Text>
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
                  {formatEuro(portfolio.totalValue)} {currencySymbol}
                </Text>
              )}
              {portfolio.totalGainLoss !== null && !hideValue && (
                <View style={styles.gainRow}>
                  <Text style={[
                    styles.gainValue,
                    portfolio.totalGainLoss >= 0 ? styles.changePositive : styles.changeNegative,
                  ]}>
                    {portfolio.totalGainLoss >= 0 ? '+' : ''}
                    {formatEuro(portfolio.totalGainLoss)} {currencySymbol}
                  </Text>
                  {portfolio.totalGainLossPct !== null && (
                    <Text style={[
                      styles.gainPct,
                      portfolio.totalGainLoss >= 0 ? styles.changePositive : styles.changeNegative,
                    ]}>
                      {'  '}{portfolio.totalGainLoss >= 0 ? '+' : ''}
                      {formatPct(portfolio.totalGainLossPct, 2)}
                    </Text>
                  )}
                </View>
              )}
              {portfolio.totalNetEstime !== null && !hideValue &&
               portfolio.totalGainLoss !== null && portfolio.totalGainLoss > 0 && (
                <View style={styles.netGlobalRow}
                  accessibilityLabel={`Si vous vendez aujourd'hui, environ ${formatEuro(portfolio.totalNetEstime ?? 0)} euros nets`}
                >
                  <Text style={styles.netGlobalLabel}>
                    GAIN NET ESTIMÉ
                  </Text>
                  <Text style={styles.netGlobalValue}>
                    ~{formatEuro(portfolio.totalNetEstime)} {currencySymbol}
                  </Text>
                  <Text style={styles.netGlobalSub}>
                    Estimation après impôts
                  </Text>
                  <View style={styles.reassuranceRow}>
                    <Text style={styles.reassuranceItem}>Calcul instantané</Text>
                    <Text style={styles.reassuranceDot}>·</Text>
                    <Text style={styles.reassuranceItem}>Données privées</Text>
                  </View>
                </View>
              )}
              {portfolio.totalGainLoss !== null && portfolio.totalGainLoss <= 0 && !hideValue && (
                <Text style={styles.netGlobalNoTax}>
                  Aucun impôt si vente en régime plus-values
                </Text>
              )}
            </>
          )}
          {/* TODO: sparkline */}
        </View>

        {/* CTA Simuler mes ventes */}
        {hasPositions && pricesReady && (
          <TouchableOpacity
            style={styles.simulerCta}
            onPress={() => router.push('/fiscalite-globale' as never)}
            activeOpacity={0.7}
            accessibilityLabel="Voir combien je récupère"
          >
            <Ionicons name="calculator-outline" size={18} color={OrTrackColors.gold} />
            <Text style={styles.simulerCtaText}>Voir combien je récupère →</Text>
          </TouchableOpacity>
        )}

        {/* ── 3. MARCHÉS — chips horizontales ── */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>MARCHÉS</Text>

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

        {!pricesReady ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20 }}
            contentContainerStyle={{ paddingLeft: 20, paddingRight: 40, gap: 8, marginBottom: 16 }}>
            {[1, 2, 3].map(i => (
              <View key={i} style={styles.marketPlaceholder} />
            ))}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20 }}
            contentContainerStyle={{ paddingLeft: 20, paddingRight: 40, gap: 8, marginBottom: 16 }}>
            {METALS_CONFIG.map((m) => {
              const active = selectedChartMetal === m.metal;
              const spot = prices[m.metal];
              const isCopper = m.metal === 'copper';
              const displayPrice = spot !== null
                ? isCopper ? spot * (1000 / OZ_TO_G) : spot
                : null;
              const unitLabel = isCopper ? `${currencySymbol}/kg` : `${currencySymbol}/oz`;
              const variationEur = (change24h[m.metal] !== undefined && spot !== null)
                ? isCopper
                  ? (spot * change24h[m.metal]! / 100) * (1000 / OZ_TO_G)
                  : spot * change24h[m.metal]! / 100
                : null;
              return (
                <TouchableOpacity
                  key={m.metal}
                  onPress={() => handleSelectMetal(m.metal)}
                  activeOpacity={0.75}
                  accessibilityLabel={`${m.name} ${displayPrice !== null ? formatEuro(displayPrice) + ' ' + unitLabel : ''}`}
                  style={[
                    styles.marketChip,
                    active && { borderColor: m.color, backgroundColor: `${m.color}15` },
                  ]}>
                  <Text style={styles.marketChipName}>{m.name}</Text>
                  {displayPrice !== null ? (
                    <>
                      <Text style={styles.marketChipPrice}>{formatEuro(displayPrice)}</Text>
                      <Text style={styles.marketChipUnit}>{unitLabel}</Text>
                      {variationEur !== null && change24h[m.metal] !== undefined && (
                        <Text style={[
                          styles.marketChipVariation,
                          change24h[m.metal]! >= 0 ? styles.changePositive : styles.changeNegative,
                        ]}>
                          {change24h[m.metal]! >= 0 ? '▲' : '▼'}{' '}
                          {formatPct(Math.abs(change24h[m.metal]!), 2)}
                          {'  '}{change24h[m.metal]! >= 0 ? '+' : '-'}
                          {formatEuro(Math.abs(variationEur))}{currencySymbol}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.marketChipPrice}>—</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── 4. MA DÉTENTION ── */}
        {positionsLoaded && (
          <>
            <View style={styles.detentionTitleRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>MA DÉTENTION</Text>
              {hasPositions && !hideValue && (
                <TouchableOpacity
                  onPress={navigateToPortfolio}
                  activeOpacity={0.7}
                  accessibilityLabel="Voir mes positions"
                >
                  <Text style={styles.detentionViewAll}>Voir mes positions ›</Text>
                </TouchableOpacity>
              )}
            </View>

            {hasPositions && portfolioMetals.length > 0 && !hideValue ? (
              <View style={styles.detentionCard}>
                {portfolioMetals.map((m, i) => (
                  <TouchableOpacity
                    key={m.key}
                    onPress={navigateToPortfolio}
                    activeOpacity={0.7}
                    accessibilityLabel={`${m.label} ${formatG(m.totalG)} ${m.value !== null ? formatEuro(m.value) + ' ' + currencySymbol : ''}`}
                  >
                    {i > 0 && <View style={styles.separator} />}
                    <View style={styles.detentionRow}>
                      <View style={styles.detentionLeft}>
                        <View style={[styles.miniBadge, { borderColor: m.color }]}>
                          <Text style={[styles.miniBadgeText, { color: m.color }]}>{m.symbol}</Text>
                        </View>
                        <View style={styles.detentionNameCol}>
                          <Text style={styles.detentionLabel}>{m.label}</Text>
                          <Text style={styles.detentionSub}>{formatG(m.totalG)} · {formatQty(m.pieces)} pièce{m.pieces > 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                      <View style={styles.detentionRight}>
                        {m.value !== null && (
                          <View style={styles.detentionValues}>
                            <Text style={styles.detentionValue}>
                              {formatEuro(m.value)} {currencySymbol}
                            </Text>
                            {m.netEstime !== null && (m.netEstime ?? 0) > 0 && (
                              <Text style={[
                                styles.detentionNet,
                                styles.changePositive,
                              ]}>
                                Gain net : +{formatEuro(m.netEstime)} {currencySymbol}
                              </Text>
                            )}
                          </View>
                        )}
                        <Text style={styles.detentionChevron}>›</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
                <View style={styles.separator} />
                <TouchableOpacity
                  onPress={navigateToAjouter}
                  style={styles.detentionCta}
                  activeOpacity={0.7}
                  accessibilityLabel="Ajouter une position"
                >
                  <Text style={styles.detentionCtaIcon}>+</Text>
                  <Text style={styles.detentionCtaText}>Ajouter une position</Text>
                </TouchableOpacity>
              </View>
            ) : !hasPositions ? (
              <View style={styles.detentionCard}>
                <Text style={styles.detentionEmptyText}>Aucune position pour le moment.</Text>
                <TouchableOpacity
                  onPress={navigateToAjouter}
                  style={styles.detentionCta}
                  activeOpacity={0.7}
                  accessibilityLabel="Ajouter une position"
                >
                  <Text style={styles.detentionCtaIcon}>+</Text>
                  <Text style={styles.detentionCtaText}>Ajouter votre première position</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}

        {/* ── 5. COURS [MÉTAL] ── */}
        <View style={styles.courseTitleRow}>
          <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>
            Cours {selectedMetalConfig.name} ({selectedMetalConfig.symbol})
          </Text>
          {change24h[selectedChartMetal] !== undefined && (
            <Text style={[
              styles.courseVariation,
              change24h[selectedChartMetal]! >= 0 ? styles.changePositive : styles.changeNegative,
            ]}>
              {change24h[selectedChartMetal]! >= 0 ? '▲' : '▼'}{' '}
              {formatPct(Math.abs(change24h[selectedChartMetal]!), 2)}
            </Text>
          )}
        </View>

        <PriceChart
          metal={selectedChartMetal}
          currency={currency}
          compact
          height={160}
          onFullScreen={() => router.push(`/graphique?metal=${selectedChartMetal}&currency=${currency}` as any)}
        />

        {/* ── 6. Alertes de prix ── */}
        <TouchableOpacity
          style={styles.alertCard}
          onPress={() => router.navigate('/(tabs)/alertes')}
          activeOpacity={0.7}
          accessibilityLabel="Configurer les alertes de prix"
        >
          <View style={styles.alertCardInner}>
            <Ionicons name="notifications-outline" size={18} color={OrTrackColors.gold} style={{ opacity: 0.75 }} />
            <Text style={styles.alertCardText}>Configurer mes alertes de prix</Text>
          </View>
          <Text style={styles.alertCardChevron}>›</Text>
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
    paddingBottom: 90,
  },

  // 1. Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerDate: {
    fontSize: 13,
    fontWeight: '500',
    color: OrTrackColors.subtext,
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
    marginBottom: 12,
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
    marginBottom: 4,
  },
  gainValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  gainPct: {
    fontSize: 12,
    fontWeight: '400',
  },
  changePositive: { color: '#4CAF50' },
  changeNegative: { color: '#E07070' },

  // Net global dans la hero card
  netGlobalRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  netGlobalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  netGlobalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#4CAF50',
  },
  netGlobalSub: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },
  reassuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  reassuranceItem: {
    fontSize: 10,
    color: OrTrackColors.subtext,
  },
  reassuranceDot: {
    fontSize: 10,
    color: OrTrackColors.subtext,
  },
  netGlobalNoTax: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginTop: 8,
  },

  // CTA Simuler
  simulerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
    gap: 8,
  },
  simulerCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },

  // Net dans détention
  detentionValues: {
    alignItems: 'flex-end',
    gap: 4,
  },
  detentionNet: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 0,
  },

  // Section title (shared)
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },

  // 3. MARCHÉS chips
  marketChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  marketChipName: {
    fontSize: 12,
    fontWeight: '500',
    color: OrTrackColors.white,
  },
  marketChipPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: OrTrackColors.white,
    marginTop: 2,
  },
  marketChipUnit: {
    fontSize: 10,
    color: OrTrackColors.subtext,
    marginTop: 1,
  },
  marketChipVariation: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  marketPlaceholder: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: OrTrackColors.card,
    opacity: 0.5,
    minWidth: 80,
    height: 80,
  },

  // 4. MA DÉTENTION
  detentionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  detentionViewAll: {
    fontSize: 12,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },
  detentionCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  detentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  detentionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detentionNameCol: {
    marginLeft: 10,
  },
  detentionLabel: {
    fontSize: 14,
    color: OrTrackColors.white,
    fontWeight: '500',
  },
  detentionSub: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },
  detentionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detentionValue: {
    fontSize: 14,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  detentionChevron: {
    fontSize: 20,
    color: OrTrackColors.subtext,
    fontWeight: '300',
    lineHeight: 22,
  },
  detentionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    gap: 6,
  },
  detentionCtaIcon: {
    fontSize: 18,
    fontWeight: '300',
    color: OrTrackColors.gold,
  },
  detentionCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },
  detentionEmptyText: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    textAlign: 'center',
    marginBottom: 12,
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
  separator: {
    height: 1,
    backgroundColor: OrTrackColors.border,
  },

  // 5. COURS
  courseTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  courseVariation: {
    fontSize: 11,
    fontWeight: '600',
  },

  // 6. Alertes
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    padding: 14,
    marginTop: 12,
  },
  alertCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertCardText: {
    fontSize: 13,
    fontWeight: '500',
    color: OrTrackColors.white,
    opacity: 0.75,
  },
  alertCardChevron: {
    fontSize: 20,
    color: OrTrackColors.subtext,
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
