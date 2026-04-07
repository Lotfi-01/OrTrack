import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { type MetalType, METAL_CONFIG, getSpot, OZ_TO_G } from '@/constants/metals';
import { OrTrackColors } from '@/constants/theme';
import { STATS } from '@/constants/stats-config';
import { formatEuro, formatG, formatPct } from '@/utils/format';
import { parseDate } from '@/utils/tax-helpers';
import { computePortfolioFiscalSummary, computeFiscalCountdown } from '@/utils/fiscal';
import {
  selectInsight,
  selectDecisionCards,
  computeMetalBreakdown,
  computePositionRanking,
} from '@/utils/stats-helpers';
import { usePremium } from '@/contexts/premium-context';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { usePositions } from '@/hooks/use-positions';

const C = OrTrackColors;

const PREMIUM_FEATURES = [
  { icon: '\uD83C\uDFC6', title: 'Classement de vos positions', sub: 'Par gain, performance et net estimé' },
  { icon: '\uD83D\uDCCA', title: 'Aide à la décision fiscale', sub: 'Net estimé, régime, fenêtre fiscale' },
  { icon: '\uD83D\uDCA1', title: 'Insights personnalisés', sub: 'Concentration, exposition, paliers' },
];

// ─── Composant ──────────────────────────────────────────────────────────────

export default function StatistiquesScreen() {
  const { positions, reloadPositions } = usePositions();
  const { prices, currencySymbol, lastUpdated } = useSpotPrices();
  const { isPremium, showPaywall } = usePremium();
  const [masked, setMasked] = useState(false);
  const [rankMode, setRankMode] = useState<'eur' | 'pct' | 'sale'>('eur');
  const [detailsOpen, setDetailsOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reloadPositions();
      AsyncStorage.getItem('@ortrack_privacy_mode')
        .then(v => setMasked(v === 'true'))
        .catch(() => {});
    }, [reloadPositions]),
  );

  const m = (text: string) => (masked ? '\u2022\u2022\u2022\u2022\u2022\u2022' : text);

  // ── Snapshot ────────────────────────────────────────────────────────────

  const hasPositions = positions.length > 0;

  const { totalCost, totalValue, totalGain, totalGainPct } = useMemo(() => {
    let cost = 0;
    let value = 0;
    for (const p of positions) {
      const spot = getSpot(p.metal, prices);
      cost += p.quantity * p.purchasePrice;
      if (spot !== null) value += p.quantity * (p.weightG / OZ_TO_G) * spot;
    }
    const gain = cost > 0 ? value - cost : 0;
    const gainPct = cost > 0 ? (gain / cost) * 100 : null;
    return { totalCost: cost, totalValue: value, totalGain: gain, totalGainPct: gainPct };
  }, [positions, prices]);

  const fiscal = useMemo(
    () => computePortfolioFiscalSummary(positions, prices),
    [positions, prices],
  );

  const metalBreakdown = useMemo(
    () => computeMetalBreakdown(positions, prices),
    [positions, prices],
  );

  const insight = useMemo(
    () => selectInsight(fiscal, metalBreakdown, totalGain, positions.length),
    [fiscal, metalBreakdown, totalGain, positions.length],
  );

  const decisionCards = useMemo(
    () => selectDecisionCards(fiscal, totalGain, positions.length),
    [fiscal, totalGain, positions.length],
  );

  const ranking = useMemo(
    () => computePositionRanking(fiscal, positions, prices),
    [fiscal, positions, prices],
  );

  const oldestDate = useMemo(() => {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const p of positions) {
      const d = parseDate(p.purchaseDate);
      if (d && d.getTime() < oldestTime) { oldestTime = d.getTime(); oldest = p.purchaseDate; }
    }
    return oldest;
  }, [positions]);

  // Metal metrics for details
  const metalMetrics = useMemo(() => {
    const metalKeys: MetalType[] = ['or', 'argent', 'platine', 'palladium'];
    return metalKeys.map(mk => {
      const filtered = positions.filter(p => p.metal === mk);
      if (filtered.length === 0) return null;
      const totalG = filtered.reduce((s, p) => s + p.quantity * p.weightG, 0);
      const avgPrice = filtered.reduce((s, p) => s + p.purchasePrice, 0) / filtered.length;
      const avgMonths = filtered.reduce((s, p) => {
        const parts = p.purchaseDate.split('/');
        if (parts.length !== 3) return s;
        const purchase = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        const now = new Date();
        return s + (now.getFullYear() - purchase.getFullYear()) * 12 + (now.getMonth() - purchase.getMonth());
      }, 0) / filtered.length;
      return { metal: mk, totalG, avgPrice, avgMonths };
    }).filter(Boolean) as { metal: MetalType; totalG: number; avgPrice: number; avgMonths: number }[];
  }, [positions]);

  const globalAvgMonths = metalMetrics.length > 0 ? Math.round(metalMetrics.reduce((s, mm) => s + mm.avgMonths, 0) / metalMetrics.length) : 0;

  function fmtMonths(months: number): string {
    if (months < 1) return "Moins d\u20191 mois";
    if (months < 12) return `${months} mois`;
    const y = Math.floor(months / 12);
    const r = months % 12;
    return r > 0 ? `${y} an${y > 1 ? 's' : ''} ${r} mois` : `${y} an${y > 1 ? 's' : ''}`;
  }

  const timeStr = lastUpdated ? `${String(lastUpdated.getHours()).padStart(2, '0')}:${String(lastUpdated.getMinutes()).padStart(2, '0')}` : null;

  // Ranking sorted
  const sortedRanking = useMemo(() => {
    const r = [...ranking];
    if (rankMode === 'eur') r.sort((a, b) => b.gainEur - a.gainEur);
    else if (rankMode === 'pct') r.sort((a, b) => b.gainPct - a.gainPct);
    else r.sort((a, b) => (b.netEstimate ?? 0) - (a.netEstimate ?? 0));
    return r.slice(0, STATS.MAX_VISIBLE_POSITIONS);
  }, [ranking, rankMode]);

  const useTabsMode = ranking.length > STATS.MAX_VISIBLE_POSITIONS;
  const dominantMetal = metalBreakdown.length > 0 ? metalBreakdown[0] : null;

  // ─── Rendu ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={st.container}>
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={st.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Text style={st.backText}>{'\u2190'} Retour</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>Statistiques</Text>
        </View>

        {!hasPositions ? (
          <View style={st.emptyState}>
            <Text style={st.emptyTitle}>Aucune position</Text>
            <Text style={st.emptyText}>Ajoutez des actifs pour voir vos statistiques.</Text>
          </View>
        ) : (
          <>
            {/* ── BLOC 1 — HERO PERFORMANCE ── */}
            <View style={st.heroCard}>
              <Text style={st.sectionLabel}>PERFORMANCE GLOBALE</Text>
              <Text style={[st.heroValue, totalGain >= 0 ? st.positive : st.negative]}>
                {m(`${totalGain >= 0 ? '+' : ''}${formatEuro(totalGain)} ${currencySymbol}`)}
              </Text>
              {totalGainPct !== null && (
                <Text style={[st.heroPercent, totalGain >= 0 ? st.positive : st.negative]}>
                  {totalGain >= 0 ? '+' : ''}{formatPct(totalGainPct, 2)}
                </Text>
              )}
              {oldestDate && <Text style={st.heroRef}>Depuis votre 1ère position ({oldestDate})</Text>}

              <View style={st.heroRow}>
                <View style={st.heroCol}>
                  <Text style={st.heroLabel}>Investi</Text>
                  <Text style={st.heroAmount}>{m(`${formatEuro(totalCost)} ${currencySymbol}`)}</Text>
                </View>
                <View style={st.heroSep} />
                <View style={[st.heroCol, { alignItems: 'flex-end' }]}>
                  <Text style={st.heroLabel}>Valeur actuelle</Text>
                  <Text style={st.heroAmount}>{m(`${formatEuro(totalValue)} ${currencySymbol}`)}</Text>
                </View>
              </View>

              {fiscal ? (
                <View style={st.heroNetBlock}>
                  <View style={st.heroNetRow}>
                    <Text style={st.heroNetLabel}>Net estimé si vente aujourd{'\u2019'}hui</Text>
                    <TouchableOpacity onPress={() => Alert.alert('Net estimé', 'Estimé selon le régime le plus favorable aujourd\u2019hui. Hors frais de revente.')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="information-circle-outline" size={14} color={C.textDim} />
                    </TouchableOpacity>
                  </View>
                  <Text style={st.heroNetValue}>{m(`${formatEuro(fiscal.bestNet)} ${currencySymbol}`)}</Text>
                  {(() => {
                    // Dériver la fiscalité du même totalValue affiché pour garantir A - B = C visuellement
                    const fiscDisplayed = totalValue - fiscal.bestNet;
                    return <Text style={st.heroNetFiscal}>Fiscalité estimée : {m(`${formatEuro(fiscDisplayed)} ${currencySymbol}`)}</Text>;
                  })()}
                  <Text style={st.heroMethod}>(Régime le plus favorable {'\u00B7'} hors frais)</Text>
                </View>
              ) : (
                <Text style={st.heroNetUnavailable}>Net estimé indisponible {'\u00B7'} Simulation requise</Text>
              )}

              <TouchableOpacity onPress={() => router.push('/fiscalite-globale' as never)} style={st.heroBridge} activeOpacity={0.7}>
                <Text style={st.heroBridgeText}>{'Estimer mon net après impôt \u2192'}</Text>
              </TouchableOpacity>
            </View>

            {/* ── BLOC 2 — INSIGHT PREMIUM ── */}
            {isPremium && insight.type !== 'fallback' && (
              <>
                <Text style={st.sectionTitle}>INSIGHT ORTRACK</Text>
                <View style={st.insightCard}>
                  <Text style={st.insightTitle}>{insight.title}</Text>
                  <Text style={st.insightPhrase}>{insight.phrase}</Text>
                  {insight.subtext ? <Text style={st.insightSub}>{insight.subtext}</Text> : null}
                  {insight.method ? <Text style={st.insightMethod}>{insight.method}</Text> : null}
                  {insight.action && (
                    <TouchableOpacity onPress={() => router.push({ pathname: insight.action!.route as any, params: insight.action!.params })} style={st.insightAction} activeOpacity={0.7}>
                      <Text style={st.insightActionText}>{insight.action.label}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
            {isPremium && insight.type === 'fallback' && (
              <>
                <Text style={st.sectionTitle}>ANALYSE</Text>
                <View style={st.insightCard}>
                  <Text style={st.insightPhrase}>{insight.phrase}</Text>
                </View>
              </>
            )}

            {/* ── BLOC 3 — VOTRE PORTEFEUILLE ── */}
            <Text style={st.sectionTitle}>VOTRE PORTEFEUILLE</Text>
            {/* Metal summary */}
            <View style={st.card}>
              {metalBreakdown.map(mb => (
                <View key={mb.metal} style={st.metalRow}>
                  <View style={[st.metalBadge, { borderColor: METAL_CONFIG[mb.metal].chipBorder }]}>
                    <Text style={[st.metalBadgeText, { color: METAL_CONFIG[mb.metal].chipText }]}>{METAL_CONFIG[mb.metal].symbol}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.metalName}>{mb.name}</Text>
                    <Text style={st.metalSub}>
                      {m(`${formatEuro(mb.value)} ${currencySymbol}`)} {'\u00B7'} {Math.round(mb.partValue * 100)} % du portefeuille
                      {totalGain > 0 && mb.gainEur > 0 ? ` \u00B7 ${Math.round(mb.partGain * 100)} % du gain` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Position ranking (premium) */}
            {isPremium && ranking.length > 1 && (
              <>
                <Text style={st.sectionTitle}>
                  {rankMode === 'eur' ? 'VOS POSITIONS (par gain \u20AC)' : rankMode === 'pct' ? 'VOS POSITIONS (par performance %)' : 'VOS POSITIONS (par net estimé)'}
                </Text>
                <View style={st.toggleRow}>
                  {(useTabsMode ? (['eur', 'pct', 'sale'] as const) : (['eur', 'pct'] as const)).map(mode => (
                    <TouchableOpacity key={mode} style={[st.toggleBtn, rankMode === mode && st.toggleBtnActive]} onPress={() => setRankMode(mode)}>
                      <Text style={[st.toggleBtnText, rankMode === mode && st.toggleBtnTextActive]}>
                        {mode === 'eur' ? 'Gain \u20AC' : mode === 'pct' ? 'Perf %' : 'Vente'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={st.card}>
                  {sortedRanking.map((pos, idx) => {
                    const badgeStyle = idx === 0 ? st.rankGold : idx === 1 ? st.rankSilver : idx === 2 ? st.rankBronze : st.rankGray;
                    const badgeTextStyle = idx === 0 ? st.rankGoldText : idx === 1 ? st.rankSilverText : idx === 2 ? st.rankBronzeText : st.rankGrayText;
                    return (
                      <View key={pos.id}>
                        {idx > 0 && <View style={st.divider} />}
                        <View style={st.podiumRow}>
                          <View style={[st.rankBadge, badgeStyle]}><Text style={[st.rankBadgeText, badgeTextStyle]}>{idx + 1}</Text></View>
                          <View style={st.podiumInfo}>
                            <Text style={st.podiumProduct}>{pos.product}</Text>
                            <Text style={st.podiumMetal}>{METAL_CONFIG[pos.metal].name}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            {rankMode === 'eur' && (
                              <>
                                <Text style={pos.gainEur >= 0 ? st.positive : st.negative}>
                                  {m(`${pos.gainEur >= 0 ? '+' : ''}${formatEuro(pos.gainEur)} \u20AC`)}
                                </Text>
                                <Text style={st.podiumSecondary}>{pos.gainEur >= 0 ? '+' : ''}{formatPct(pos.gainPct, 2)}</Text>
                                {!useTabsMode && (() => {
                                  // Differentiate: if this position's sub-line is identical to a previous one, use the next priority level
                                  const primary = pos.fiscalNote || pos.regimeLabel;
                                  if (!primary) return null;
                                  const prevLines = sortedRanking.slice(0, idx).map(p => p.fiscalNote || p.regimeLabel);
                                  const line = prevLines.includes(primary) ? (pos.regimeLabel && pos.regimeLabel !== primary ? pos.regimeLabel : null) : primary;
                                  const display = line?.replace('Régime le plus favorable', 'Régime favorable');
                                  return display ? <Text style={st.podiumFiscalNote}>{display}</Text> : null;
                                })()}
                              </>
                            )}
                            {rankMode === 'pct' && (
                              <>
                                <Text style={pos.gainPct >= 0 ? st.positive : st.negative}>
                                  {pos.gainPct >= 0 ? '+' : ''}{formatPct(pos.gainPct, 2)}
                                </Text>
                                <Text style={st.podiumSecondary}>{m(`${pos.gainEur >= 0 ? '+' : ''}${formatEuro(pos.gainEur)} \u20AC`)}</Text>
                              </>
                            )}
                            {rankMode === 'sale' && pos.netEstimate !== null && (
                              <>
                                <Text style={st.podiumNet}>{m(`${formatEuro(pos.netEstimate)} \u20AC`)}</Text>
                                {pos.regimeLabel && <Text style={st.podiumSecondary}>{pos.regimeLabel.replace('Régime le plus favorable', 'Régime favorable')}</Text>}
                                {pos.fiscalNote && <Text style={st.podiumFiscalNote}>{pos.fiscalNote}</Text>}
                              </>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
                {ranking.length > STATS.MAX_VISIBLE_POSITIONS && (
                  <TouchableOpacity style={st.showAllBtn} activeOpacity={0.7}>
                    <Text style={st.showAllText}>Voir toutes les positions {'\u2192'}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* ── BLOC 4 — AIDE À LA DÉCISION (premium) ── */}
            {isPremium && (
              <>
                <Text style={st.sectionTitle}>AIDE À LA DÉCISION</Text>
                {decisionCards.length >= 3 ? (
                  <View style={st.decisionGrid}>
                    {decisionCards.slice(0, 4).map(card => (
                      <View key={card.id} style={st.decisionCard}>
                        <Text style={st.decisionTitle}>{card.title}</Text>
                        <Text style={st.decisionValue}>{masked && card.id !== 'regime' ? '\u2022\u2022\u2022\u2022\u2022\u2022' : card.value}</Text>
                        <Text style={st.decisionSub}>{masked && (card.id === 'net' || card.id === 'window') ? '\u2022\u2022\u2022\u2022\u2022\u2022' : card.subtext}</Text>
                        <Text style={st.decisionMethod}>{card.method.replace('Comparaison TMP vs TPV', 'Forfaitaire vs plus-values')}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={st.card}>
                    <Text style={st.decisionTitle}>AUCUNE ACTION FISCALE PRIORITAIRE</Text>
                    <Text style={st.decisionSub}>Pas d{'\u2019'}optimisation majeure immédiate identifiée.</Text>
                  </View>
                )}
              </>
            )}

            {/* ── BLOC 5 — DÉTAILS DU PORTEFEUILLE (accordion) ── */}
            {isPremium && (
              <>
                <TouchableOpacity style={st.detailsToggle} onPress={() => setDetailsOpen(v => !v)} activeOpacity={0.7}>
                  <Text style={st.detailsToggleText}>DÉTAILS DU PORTEFEUILLE</Text>
                  <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.gold} />
                </TouchableOpacity>
                {detailsOpen && (
                  <View style={st.card}>
                    <View style={st.detailRow}>
                      <Text style={st.detailKey}>Nombre de positions</Text>
                      <Text style={st.detailVal}>{positions.length}</Text>
                    </View>
                    {dominantMetal && (
                      <View style={st.detailRow}>
                        <Text style={st.detailKey}>Métal dominant</Text>
                        <Text style={st.detailVal}>{dominantMetal.name} ({Math.round(dominantMetal.partValue * 100)} %)</Text>
                      </View>
                    )}
                    <View style={st.detailRow}>
                      <Text style={st.detailKey}>Ancienneté moyenne</Text>
                      <Text style={st.detailVal}>{fmtMonths(globalAvgMonths)}</Text>
                    </View>
                    {metalMetrics.length > 1 && metalMetrics.map(mm => (
                      <View key={mm.metal} style={st.detailRow}>
                        <Text style={st.detailKeySub}>{METAL_CONFIG[mm.metal].name}</Text>
                        <Text style={st.detailValSub}>{fmtMonths(Math.round(mm.avgMonths))}</Text>
                      </View>
                    ))}
                    <View style={st.detailDivider} />
                    {metalMetrics.map(mm => (
                      <View key={mm.metal}>
                        <View style={st.detailRow}>
                          <Text style={st.detailKey}>Coût moyen {METAL_CONFIG[mm.metal].name}</Text>
                          <Text style={st.detailVal}>{m(`${formatEuro(mm.avgPrice)} ${currencySymbol}/pièce`)}</Text>
                        </View>
                        <View style={st.detailRow}>
                          <Text style={st.detailKey}>Poids total {METAL_CONFIG[mm.metal].name}</Text>
                          <Text style={st.detailVal}>{formatG(mm.totalG)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Non-premium CTA */}
            {!isPremium && (
              <>
                <Text style={st.sectionTitle}>ANALYSES PREMIUM</Text>
                <View style={st.card}>
                  {PREMIUM_FEATURES.map((item, i) => (
                    <View key={item.title} style={[st.premiumRow, i < PREMIUM_FEATURES.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                      <View style={st.premiumIcon}><Text style={{ fontSize: 20 }}>{item.icon}</Text></View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={st.premiumTitle}>{item.title}</Text>
                        <Text style={st.premiumSub}>{item.sub}</Text>
                      </View>
                      <Ionicons name="lock-closed" size={16} color={C.gold} />
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={st.premiumCta} onPress={showPaywall} activeOpacity={0.7}>
                  <Text style={st.premiumCtaText}>Débloquer les analyses</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Timestamp */}
            {timeStr && <Text style={st.timestamp}>Cours du jour à {timeStr}</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scroll: { padding: 20, paddingBottom: 48 },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 13, color: C.gold, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.white, marginBottom: 8 },
  emptyText: { fontSize: 14, color: C.subtext, textAlign: 'center' },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },
  sectionLabel: { fontSize: 11, color: C.subtext, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  // Hero
  heroCard: { backgroundColor: C.card, borderRadius: 14, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)' },
  heroValue: { fontSize: 32, fontWeight: '800', marginBottom: 2 },
  heroPercent: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  heroRef: { fontSize: 11, color: C.textDim, marginBottom: 12, fontStyle: 'italic' },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 4 },
  heroCol: { flex: 1 },
  heroLabel: { fontSize: 11, color: C.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  heroAmount: { fontSize: 15, fontWeight: '600', color: C.white },
  heroSep: { width: 1, height: 32, backgroundColor: C.border, marginHorizontal: 12 },
  heroNetBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  heroNetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  heroNetLabel: { fontSize: 12, color: C.textDim },
  heroNetValue: { fontSize: 20, fontWeight: '700', color: C.gold, marginBottom: 2 },
  heroNetFiscal: { fontSize: 12, color: C.subtext, marginBottom: 2 },
  heroMethod: { fontSize: 10, color: C.textDim },
  heroNetUnavailable: { fontSize: 12, color: C.textDim, marginTop: 12, fontStyle: 'italic' },
  heroBridge: { marginTop: 12, alignItems: 'center' },
  heroBridgeText: { fontSize: 13, color: C.gold, fontWeight: '600' },

  // Insight
  insightCard: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  insightTitle: { fontSize: 10, fontWeight: '700', color: C.gold, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  insightPhrase: { fontSize: 13, color: C.white, lineHeight: 20, marginBottom: 4 },
  insightSub: { fontSize: 12, color: C.textDim, marginBottom: 4 },
  insightMethod: { fontSize: 10, color: C.textDim, fontStyle: 'italic', marginTop: 4 },
  insightAction: { marginTop: 8 },
  insightActionText: { fontSize: 13, color: C.gold, fontWeight: '600' },

  // Card
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },

  // Metal breakdown
  metalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  metalBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  metalBadgeText: { fontSize: 8, fontWeight: '700' },
  metalName: { fontSize: 14, fontWeight: '600', color: C.white },
  metalSub: { fontSize: 11, color: C.subtext, marginTop: 1 },

  // Toggle
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggleBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  toggleBtnActive: { borderColor: C.gold, backgroundColor: 'rgba(201,168,76,0.12)' },
  toggleBtnText: { fontSize: 12, color: C.subtext, fontWeight: '500' },
  toggleBtnTextActive: { color: C.gold, fontWeight: '700' },

  // Podium
  podiumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  rankBadgeText: { fontSize: 12, fontWeight: '700' },
  rankGold: { backgroundColor: '#1F1B0A', borderColor: C.gold },
  rankGoldText: { color: C.gold },
  rankSilver: { backgroundColor: '#18181F', borderColor: '#A8A8B8' },
  rankSilverText: { color: '#A8A8B8' },
  rankBronze: { backgroundColor: '#1F1A10', borderColor: '#CD7F32' },
  rankBronzeText: { color: '#CD7F32' },
  rankGray: { backgroundColor: '#1A1A1A', borderColor: '#666' },
  rankGrayText: { color: '#666' },
  podiumInfo: { flex: 1 },
  podiumProduct: { fontSize: 14, fontWeight: '600', color: C.white },
  podiumMetal: { fontSize: 11, color: C.subtext, marginTop: 1 },
  podiumSecondary: { fontSize: 11, color: C.textDim, marginTop: 1 },
  podiumNet: { fontSize: 14, fontWeight: '600', color: C.gold },
  podiumFiscalNote: { fontSize: 10, color: C.textDim, marginTop: 2, fontStyle: 'italic' },
  showAllBtn: { alignItems: 'center', paddingVertical: 8 },
  showAllText: { fontSize: 13, color: C.gold, fontWeight: '600' },

  // Decision grid
  decisionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  decisionCard: { width: '47%', backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, minHeight: 100 },
  decisionTitle: { fontSize: 9, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  decisionValue: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 4 },
  decisionSub: { fontSize: 11, color: C.subtext, marginBottom: 4 },
  decisionMethod: { fontSize: 10, color: C.textDim, fontStyle: 'italic' },

  // Details accordion
  detailsToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border, marginTop: 8 },
  detailsToggleText: { fontSize: 11, fontWeight: '700', color: C.gold, letterSpacing: 1 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  detailKey: { fontSize: 13, color: C.subtext },
  detailVal: { fontSize: 13, fontWeight: '600', color: C.white },
  detailKeySub: { fontSize: 12, color: C.textDim, paddingLeft: 12 },
  detailValSub: { fontSize: 12, color: C.textDim },
  detailDivider: { height: 1, backgroundColor: C.border, marginVertical: 8 },

  // Premium features
  premiumRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  premiumIcon: { width: 36, alignItems: 'center' },
  premiumTitle: { fontSize: 14, fontWeight: '600', color: C.white },
  premiumSub: { fontSize: 12, color: C.subtext, marginTop: 2 },
  premiumCta: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  premiumCtaText: { color: C.background, fontSize: 15, fontWeight: '700' },

  timestamp: { fontSize: 11, color: C.textDim, textAlign: 'center', marginTop: 16 },

  positive: { color: '#4CAF50' },
  negative: { color: '#E07070' },
});
