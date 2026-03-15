import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { type MetalType, METAL_CONFIG, getSpot } from '@/constants/metals';
import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── Types ────────────────────────────────────────────────────────────────────

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

const STORAGE_KEY = '@ortrack:positions';
const OZ_TO_G = 31.10435;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace('.', ',');
}

function fmtG(g: number): string {
  if (g >= 1000) return `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} kg`;
  return `${g % 1 === 0 ? g : g.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function StatistiquesScreen() {
  const [positions, setPositions] = useState<Position[]>([]);
  const { prices, currencySymbol } = useSpotPrices();

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => setPositions(raw ? JSON.parse(raw) : []))
        .catch(() => setPositions([]));
    }, [])
  );

  // ── Calculs ───────────────────────────────────────────────────────────────

  const hasPositions = positions.length > 0;

  // Performance globale
  let totalCost = 0;
  let totalValue = 0;
  for (const p of positions) {
    const spot = getSpot(p.metal, prices);
    totalCost += p.quantity * p.purchasePrice;
    if (spot !== null) {
      totalValue += p.quantity * (p.weightG / OZ_TO_G) * spot;
    }
  }
  const totalGainLoss = totalCost > 0 ? totalValue - totalCost : null;
  const totalGainLossPct = totalGainLoss !== null && totalCost > 0
    ? (totalGainLoss / totalCost) * 100 : null;

  // Répartition par métal
  const metalKeys: MetalType[] = ['or', 'argent', 'platine', 'palladium', 'cuivre'];
  const metalValues = metalKeys.map((m) => {
    const spot = getSpot(m, prices);
    const value = positions
      .filter((p) => p.metal === m)
      .reduce((s, p) => {
        if (spot === null) return s;
        return s + p.quantity * (p.weightG / OZ_TO_G) * spot;
      }, 0);
    return { metal: m, value };
  }).filter((m) => m.value > 0);

  // Podium positions
  const positionsWithPerf = positions.map((p) => {
    const spot = getSpot(p.metal, prices);
    const currentValue = spot !== null
      ? p.quantity * (p.weightG / OZ_TO_G) * spot : null;
    const cost = p.quantity * p.purchasePrice;
    const gainPct = currentValue !== null && cost > 0
      ? ((currentValue - cost) / cost) * 100 : null;
    return { ...p, gainPct };
  }).filter((p) => p.gainPct !== null);

  const sorted = [...positionsWithPerf].sort((a, b) => (b.gainPct ?? 0) - (a.gainPct ?? 0));
  const best = sorted[0] ?? null;
  const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  // Métriques par métal
  const metalMetrics = metalKeys.map((m) => {
    const filtered = positions.filter((p) => p.metal === m);
    if (filtered.length === 0) return null;
    const totalG = filtered.reduce((s, p) => s + p.quantity * p.weightG, 0);
    const totalQty = filtered.reduce((s, p) => s + p.quantity, 0);
    const avgPrice = filtered.reduce((s, p) => s + p.purchasePrice, 0) / filtered.length;
    const avgMonths = filtered.reduce((s, p) => {
      const parts = p.purchaseDate.split('/');
      if (parts.length !== 3) return s;
      const purchase = new Date(
        parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])
      );
      const now = new Date();
      const months = (now.getFullYear() - purchase.getFullYear()) * 12 +
        (now.getMonth() - purchase.getMonth());
      return s + months;
    }, 0) / filtered.length;
    return { metal: m, totalG, totalQty, avgPrice, avgMonths };
  }).filter(Boolean) as {
    metal: MetalType;
    totalG: number;
    totalQty: number;
    avgPrice: number;
    avgMonths: number;
  }[];

  // Durée de détention moyenne globale
  const globalAvgMonths = metalMetrics.length > 0
    ? Math.round(metalMetrics.reduce((s, m) => s + m.avgMonths, 0) / metalMetrics.length)
    : 0;

  function fmtMonths(months: number): string {
    if (months < 1) return "Moins d'1 mois";
    if (months < 12) return `${months} mois`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem > 0
      ? `${years} an${years > 1 ? 's' : ''} ${rem} mois`
      : `${years} an${years > 1 ? 's' : ''}`;
  }

  // Ratio or/argent
  const goldG = positions
    .filter(p => p.metal === 'or')
    .reduce((s, p) => s + p.quantity * p.weightG, 0);
  const silverG = positions
    .filter(p => p.metal === 'argent')
    .reduce((s, p) => s + p.quantity * p.weightG, 0);
  const hasRatio = goldG > 0 && silverG > 0;
  const ratioNum = hasRatio ? silverG / goldG : null;
  const ratio = ratioNum !== null
    ? (Number.isInteger(Math.round(ratioNum * 10) / 10)
        ? Math.round(ratioNum).toString()
        : ratioNum.toFixed(1).replace('.', ','))
    : null;

  // Conseil intelligent
  const getAdvice = (): { text: string; type: 'warning' | 'good' | 'info' } => {
    if (!hasPositions) return {
      text: 'Ajoutez des positions pour obtenir une analyse personnalisée.',
      type: 'info',
    };
    const goldPct = totalValue > 0
      ? (metalValues.find(m => m.metal === 'or')?.value ?? 0) / totalValue * 100
      : 0;
    if (goldPct > 80) return {
      text: `Votre portefeuille est concentré à ${fmtPct(goldPct)}% sur l'or. Les experts recommandent de diversifier avec de l'argent (ratio 1:10) pour réduire le risque.`,
      type: 'warning',
    };
    if (goldG > 0 && silverG === 0) return {
      text: "Vous ne détenez pas d'argent. L'argent offre un potentiel de hausse plus fort que l'or sur le long terme.",
      type: 'info',
    };
    if (totalGainLossPct !== null && totalGainLossPct > 50) return {
      text: `Excellente performance ! Votre portefeuille a progressé de +${fmtPct(totalGainLossPct)}%. Pensez à la simulation fiscale avant toute cession.`,
      type: 'good',
    };
    return {
      text: "Portefeuille bien diversifié. Continuez à accumuler régulièrement pour lisser votre prix de revient.",
      type: 'good',
    };
  };
  const advice = getAdvice();

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Statistiques</Text>
        </View>

        {!hasPositions ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Aucune position</Text>
            <Text style={styles.emptyText}>
              Ajoutez des actifs pour voir vos statistiques.
            </Text>
          </View>
        ) : (
          <>
            {/* ── 1. Hero card performance globale ── */}
            <View style={[
              styles.heroCard,
              totalGainLoss !== null && totalGainLoss >= 0
                ? styles.heroCardPositive
                : styles.heroCardNegative,
            ]}>
              <Text style={styles.sectionLabel}>PERFORMANCE GLOBALE</Text>
              {totalGainLoss !== null && (
                <Text style={[
                  styles.heroValue,
                  totalGainLoss >= 0 ? styles.positive : styles.negative,
                ]}>
                  {totalGainLoss >= 0 ? '+' : ''}{fmtEur(totalGainLoss)} {currencySymbol}
                </Text>
              )}
              {totalGainLossPct !== null && (
                <Text style={[
                  styles.heroPercent,
                  totalGainLoss !== null && totalGainLoss >= 0
                    ? styles.positive : styles.negative,
                ]}>
                  {totalGainLoss !== null && totalGainLoss >= 0 ? '+' : ''}
                  {fmtPct(totalGainLossPct)} %
                </Text>
              )}
              <View style={styles.heroRow}>
                <View style={styles.heroCol}>
                  <Text style={styles.heroLabel}>Investi</Text>
                  <Text style={styles.heroAmount}>
                    {fmtEur(totalCost)} {currencySymbol}
                  </Text>
                </View>
                <View style={styles.heroSeparator} />
                <View style={[styles.heroCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.heroLabel}>Valeur actuelle</Text>
                  <Text style={styles.heroAmount}>
                    {fmtEur(totalValue)} {currencySymbol}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── 2. Répartition barres horizontales ── */}
            <Text style={styles.sectionTitle}>RÉPARTITION DU PORTEFEUILLE</Text>
            <View style={styles.card}>
              {metalValues.map((m) => {
                const pct = totalValue > 0 ? (m.value / totalValue) * 100 : 0;
                const cfg = METAL_CONFIG[m.metal];
                return (
                  <View key={m.metal} style={styles.barRow}>
                    <View style={styles.barMeta}>
                      <Text style={[styles.barLabel, { color: cfg.chipText }]}>
                        {cfg.name}
                      </Text>
                      <Text style={styles.barPct}>{fmtPct(pct, 1)} %</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[
                        styles.barFill,
                        {
                          width: `${pct}%` as any,
                          backgroundColor: cfg.chipBorder,
                        },
                      ]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* ── 3. Podium positions ── */}
            {positionsWithPerf.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>VOS POSITIONS</Text>
                <View style={styles.card}>
                  {best && (
                    <View style={styles.podiumRow}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankBadgeText}>1</Text>
                      </View>
                      <View style={styles.podiumInfo}>
                        <Text style={styles.podiumProduct}>{best.product}</Text>
                        <Text style={styles.podiumMetal}>
                          {METAL_CONFIG[best.metal].name}
                        </Text>
                      </View>
                      <Text style={styles.positive}>
                        +{fmtPct(best.gainPct ?? 0)} %
                      </Text>
                    </View>
                  )}
                  {sorted.length > 2 && sorted[1] && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.podiumRow}>
                        <View style={[styles.rankBadge, styles.rankBadgeSilver]}>
                          <Text style={[styles.rankBadgeText, styles.rankBadgeTextSilver]}>2</Text>
                        </View>
                        <View style={styles.podiumInfo}>
                          <Text style={styles.podiumProduct}>{sorted[1].product}</Text>
                          <Text style={styles.podiumMetal}>
                            {METAL_CONFIG[sorted[1].metal].name}
                          </Text>
                        </View>
                        <Text style={
                          (sorted[1].gainPct ?? 0) >= 0
                            ? styles.positive : styles.negative
                        }>
                          {(sorted[1].gainPct ?? 0) >= 0 ? '+' : ''}
                          {fmtPct(sorted[1].gainPct ?? 0)} %
                        </Text>
                      </View>
                    </>
                  )}
                  {worst && worst.id !== best?.id &&
                    (worst.gainPct ?? 0) < (best?.gainPct ?? 0) &&
                    (sorted.length < 3 || (worst.gainPct ?? 0) < (sorted[1]?.gainPct ?? 0)) && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.podiumRow}>
                        <View style={[styles.rankBadge, styles.rankBadgeLast]}>
                          <Text style={[styles.rankBadgeText, styles.rankBadgeTextLast]}>
                            {sorted.length}
                          </Text>
                        </View>
                        <View style={styles.podiumInfo}>
                          <Text style={styles.podiumProduct}>{worst.product}</Text>
                          <Text style={styles.podiumMetal}>
                            {METAL_CONFIG[worst.metal].name}
                          </Text>
                        </View>
                        <Text style={
                          (worst.gainPct ?? 0) >= 0
                            ? styles.positive : styles.negative
                        }>
                          {(worst.gainPct ?? 0) >= 0 ? '+' : ''}
                          {fmtPct(worst.gainPct ?? 0)} %
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </>
            )}

            {/* ── 4. Grid 2x2 métriques ── */}
            <Text style={styles.sectionTitle}>MÉTRIQUES CLÉS</Text>
            <View style={styles.grid}>

              <View style={styles.gridCard}>
                <Text style={styles.gridLabel}>PRIX DE REVIENT</Text>
                {metalMetrics.map((m) => (
                  <Text key={m.metal} style={styles.gridValue}>
                    {METAL_CONFIG[m.metal].name} — {fmtEur(m.avgPrice)} {currencySymbol}
                  </Text>
                ))}
              </View>

              <View style={styles.gridCard}>
                <Text style={styles.gridLabel}>POIDS TOTAL</Text>
                {metalMetrics.map((m) => (
                  <Text key={m.metal} style={styles.gridValue}>
                    {METAL_CONFIG[m.metal].name} — {fmtG(m.totalG)}
                  </Text>
                ))}
              </View>

              <View style={styles.gridCard}>
                <Text style={styles.gridLabel}>DÉTENTION MOYENNE</Text>
                <Text style={[styles.gridValue, styles.gridValueLarge]}>
                  {fmtMonths(globalAvgMonths)}
                </Text>
                {metalMetrics.map((m) => (
                  <Text key={m.metal} style={styles.gridSub}>
                    {METAL_CONFIG[m.metal].name} — {fmtMonths(Math.round(m.avgMonths))}
                  </Text>
                ))}
              </View>

              <View style={styles.gridCard}>
                <Text style={styles.gridLabel}>ALLOCATION OR / ARGENT</Text>
                {hasRatio ? (
                  <>
                    <Text style={[styles.gridValue, styles.gridValueLarge]}>
                      1 : {ratio}
                    </Text>
                    <Text style={styles.gridSub}>Poids argent / poids or</Text>
                  </>
                ) : (
                  <Text style={styles.gridSub}>
                    {goldG > 0
                      ? "Pas d'argent en portefeuille"
                      : "Pas d'or en portefeuille"}
                  </Text>
                )}
              </View>

            </View>

            {/* ── 5. Conseil intelligent ── */}
            <Text style={styles.sectionTitle}>ANALYSE ORTRACK</Text>
            <View style={[
              styles.adviceCard,
              advice.type === 'warning' && styles.adviceWarning,
              advice.type === 'good' && styles.adviceGood,
              advice.type === 'info' && styles.adviceInfo,
            ]}>
              <Text style={styles.adviceIcon}>
                {advice.type === 'warning' ? '⚠️' : advice.type === 'good' ? '✅' : '💡'}
              </Text>
              <View style={styles.adviceContent}>
                <Text style={styles.adviceText}>{advice.text}</Text>
                {advice.type === 'good' && totalGainLossPct !== null && totalGainLossPct > 50 && (
                  <TouchableOpacity
                    onPress={() => router.push('/fiscalite-globale' as never)}
                    style={styles.adviceLink}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.adviceLinkText}>Simuler ma fiscalité →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

          </>
        )}

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
    padding: 20,
    paddingBottom: 48,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  backBtn: {
    paddingVertical: 4,
  },
  backText: {
    fontSize: 13,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: OrTrackColors.white,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: OrTrackColors.white,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: OrTrackColors.subtext,
    textAlign: 'center',
  },

  // Section title
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 4,
  },

  // Hero card
  heroCard: {
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  heroCardPositive: {
    backgroundColor: OrTrackColors.card,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  heroCardNegative: {
    backgroundColor: OrTrackColors.card,
    borderColor: 'rgba(224,112,112,0.3)',
  },
  sectionLabel: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 2,
  },
  heroPercent: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  heroCol: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  heroSeparator: {
    width: 1,
    height: 32,
    backgroundColor: OrTrackColors.border,
    marginHorizontal: 12,
  },

  // Card générique
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  divider: {
    height: 1,
    backgroundColor: OrTrackColors.border,
    marginVertical: 10,
  },

  // Barres répartition
  barRow: {
    marginBottom: 12,
  },
  barMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  barPct: {
    fontSize: 13,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  barTrack: {
    height: 8,
    backgroundColor: OrTrackColors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },

  // Podium
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1F1B0A',
    borderWidth: 2,
    borderColor: OrTrackColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: OrTrackColors.gold,
  },
  rankBadgeSilver: {
    borderColor: '#A8A8B8',
    backgroundColor: '#18181F',
  },
  rankBadgeTextSilver: {
    color: '#A8A8B8',
  },
  rankBadgeLast: {
    borderColor: '#E07070',
    backgroundColor: '#1F1414',
  },
  rankBadgeTextLast: {
    color: '#E07070',
  },
  podiumInfo: {
    flex: 1,
  },
  podiumProduct: {
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  podiumMetal: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 1,
  },

  // Grid 2x2
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  gridCard: {
    width: '47.5%',
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    minHeight: 90,
  },
  gridLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '600',
    color: OrTrackColors.white,
    marginBottom: 2,
  },
  gridValueLarge: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  gridSub: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },

  // Conseil intelligent
  adviceCard: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  adviceWarning: {
    backgroundColor: 'rgba(255,193,7,0.08)',
    borderColor: 'rgba(255,193,7,0.3)',
  },
  adviceGood: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderColor: 'rgba(76,175,80,0.3)',
  },
  adviceInfo: {
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderColor: 'rgba(201,168,76,0.2)',
  },
  adviceIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  adviceContent: {
    flex: 1,
  },
  adviceText: {
    fontSize: 13,
    color: OrTrackColors.white,
    lineHeight: 20,
  },
  adviceLink: {
    marginTop: 8,
  },
  adviceLinkText: {
    fontSize: 13,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },

  // Colors
  positive: { color: '#4CAF50' },
  negative: { color: '#E07070' },
});
