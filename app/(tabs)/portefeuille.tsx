// ─── ÉTAPE 0 — Hooks et sources identifiés ───
// Hook positions : usePositions (hooks/use-positions.ts) → positions, loading, reloadPositions, deletePosition
// Hook spot : useSpotPrices (hooks/use-spot-prices.ts) → prices, loading, lastUpdated, currencySymbol, error
// Fonction suppression position : deletePosition(id: string) → from usePositions
// Fonction calcul fiscal : utils/fiscal.ts (computeRegimeComparison, computeFiscalCountdown, computeSellerNetForfaitaire)
// Route fiscalité : /fiscalite-globale (stack push)
// Route Ajouter (édition) : /(tabs)/ajouter + param editId
// Structure position : { id, metal, product, weightG, quantity, purchasePrice, purchaseDate, createdAt, note? }
// react-native-svg : installé (v15.12.1)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type MetalType, METAL_CONFIG, getSpot } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { formatEuro, formatQty, formatPctSigned, truncName } from '@/utils/format';
import { computePositionViewModels, computePortfolioSummary, getBestPerformerName } from '@/utils/portfolio';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { usePositions } from '@/hooks/use-positions';

const C = OrTrackColors;

// TODO ARCHITECTURE: extraire la logique fiscale dans un service dédié (utils/fiscal.ts ou domain/tax/)
// Les calculs d'abattement, exonération, comparaison de régimes ne doivent pas vivre dans le composant UI
// Prépare le multi-pays (FR → BE/CH/LU)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function symbolToMetal(sym: string): MetalType | null {
  const entry = (Object.entries(METAL_CONFIG) as [MetalType, (typeof METAL_CONFIG)[MetalType]][]).find(
    ([, cfg]) => cfg.symbol === sym,
  );
  return entry ? entry[0] : null;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function PortefeuilleScreen() {
  const { positions, loading: positionsLoading, reloadPositions, deletePosition } = usePositions();
  const { prices, loading: spotLoading, lastUpdated, currencySymbol, error: spotError } = useSpotPrices();
  const { showPaywall, isPremium, limits } = usePremium();

  const { metal: paramMetal } = useLocalSearchParams<{ metal?: string }>();

  const [masked, setMasked] = useState(false);
  const [filterMetal, setFilterMetal] = useState<MetalType | null>(null);
  const prevParamRef = useRef<string | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const [level2Id, setLevel2Id] = useState<string | null>(null);

  // ── Privacy mode ─────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('@ortrack_privacy_mode')
        .then(v => setMasked(v === 'true'))
        .catch(() => {});
    }, []),
  );

  const toggleMask = useCallback(async () => {
    const next = !masked;
    setMasked(next);
    setOpenId(null);
    setLevel2Id(null);
    try {
      await AsyncStorage.setItem('@ortrack_privacy_mode', String(next));
    } catch {}
  }, [masked]);

  // ── Reload on focus ──────────────────────────────────────────────────

  useFocusEffect(useCallback(() => { reloadPositions(); }, [reloadPositions]));

  // ── Filter from route param ──────────────────────────────────────────

  useEffect(() => {
    if (paramMetal && paramMetal !== prevParamRef.current) {
      const mt = symbolToMetal(paramMetal);
      setFilterMetal(mt);
      prevParamRef.current = paramMetal;
    } else if (!paramMetal && prevParamRef.current) {
      setFilterMetal(null);
      prevParamRef.current = undefined;
    }
  }, [paramMetal]);

  const filterMetalName = useMemo(() => {
    if (!filterMetal) return null;
    return METAL_CONFIG[filterMetal]?.name ?? filterMetal;
  }, [filterMetal]);

  const clearFilter = useCallback(() => {
    setFilterMetal(null);
    prevParamRef.current = undefined;
    // expo-router ne permet pas de supprimer un param proprement ; on replace sans params
    router.replace('/(tabs)/portefeuille' as never);
  }, []);

  // ── Filtered positions ───────────────────────────────────────────────

  const filteredPositions = useMemo(() => {
    if (!filterMetal) return positions;
    return positions.filter(p => p.metal === filterMetal);
  }, [positions, filterMetal]);

  // ── pricesReady (same pattern as Accueil) ────────────────────────────

  const heldMetals = useMemo(() => {
    if (!filteredPositions || filteredPositions.length === 0) return [];
    return [...new Set(filteredPositions.map(p => p.metal))];
  }, [filteredPositions]);

  const pricesReady = useMemo(() => {
    if (spotLoading) return false;
    if (heldMetals.length === 0) return true;
    return heldMetals.every(metal => {
      const spot = prices[METAL_CONFIG[metal].spotKey];
      return spot !== null && spot !== undefined;
    });
  }, [spotLoading, heldMetals, prices]);

  // ── View models + summary ────────────────────────────────────────────

  const viewModels = useMemo(
    () => computePositionViewModels(filteredPositions, (metal) => getSpot(metal, prices)),
    [filteredPositions, prices],
  );

  const summary = useMemo(() => computePortfolioSummary(viewModels), [viewModels]);

  const hasPositions = positions.length > 0;
  const hasFilteredPositions = filteredPositions.length > 0;

  // ── Card toggle ──────────────────────────────────────────────────────

  const toggleCard = useCallback(
    (id: string) => {
      setOpenId(prev => (prev === id ? null : id));
      setLevel2Id(null);
    },
    [],
  );

  // ── Last updated time ────────────────────────────────────────────────

  const timeStr = useMemo(() => {
    if (!lastUpdated) return null;
    return `${String(lastUpdated.getHours()).padStart(2, '0')}:${String(lastUpdated.getMinutes()).padStart(2, '0')}`;
  }, [lastUpdated]);

  const m = (text: string) => (masked ? '\u2022\u2022\u2022\u2022\u2022\u2022' : text);

  const bestPerformerName = useMemo(() => getBestPerformerName(viewModels), [viewModels]);

  // ── Loading guard ─────────────────────────────────────────────────────

  if (positionsLoading) {
    return (
      <SafeAreaView style={st.container}>
        <ScrollView contentContainerStyle={st.scroll}>
          <Text style={st.headerTitle}>Portefeuille</Text>
          <View style={{ marginTop: 14 }}>
            <View style={{ width: 180, height: 28, borderRadius: 6, backgroundColor: C.border, marginBottom: 12 }} />
            <View style={{ width: 120, height: 16, borderRadius: 4, backgroundColor: C.border, marginBottom: 8 }} />
            <View style={{ width: '100%', height: 38, borderRadius: 9, backgroundColor: C.border }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // TODO ARCHITECTURE: extraire PortfolioHero, PositionCard, PositionTaxSummary en composants dédiés
  // Le screen actuel est trop gros pour une maintenance long terme

  return (
    <SafeAreaView style={st.container}>
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* ── 1. HEADER ──────────────────────────────────── */}
        <View style={st.header}>
          <Text style={st.headerTitle}>Portefeuille</Text>
          <TouchableOpacity onPress={toggleMask} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={masked ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textDim} />
          </TouchableOpacity>
        </View>

        {/* ── 2. FILTRE CONTEXTE ─────────────────────────── */}
        {filterMetal && !masked && (
          <View style={st.filterBar}>
            <View style={st.filterLeft}>
              <View style={st.filterDot} />
              <Text style={st.filterLabel}>Filtre : {filterMetalName}</Text>
            </View>
            <TouchableOpacity onPress={clearFilter}>
              <Text style={st.filterClear}>{'Tout afficher →'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 3. RÉSUMÉ ──────────────────────────────────── */}
        <View style={st.heroCard}>
          {pricesReady ? (
            <>
              <Text style={st.resumeValue}>{m(`${formatEuro(summary.totalValue)} ${currencySymbol}`)}</Text>
              {hasFilteredPositions && !masked && (
                <>
                  <View style={st.resumeGainRow}>
                    <Text style={[st.resumeGain, { color: summary.gain >= 0 ? C.green : C.red }]}>
                      {'Gain brut : '}{summary.gain >= 0 ? '+' : ''}{formatEuro(summary.gain)} {currencySymbol}
                    </Text>
                    <Text style={st.resumeGainPct}>({formatPctSigned(summary.gainPct)})</Text>
                  </View>
                  <View style={st.resumeNetRow}>
                    <Text style={st.resumeNetVendeur}>
                      {'Net vendeur estimé : ~'}{formatEuro(summary.sellerNet)} {currencySymbol}
                    </Text>
                    <Text style={st.resumeNetSub}>{'Estimé au régime forfaitaire'}</Text>
                  </View>
                </>
              )}
              {masked && hasFilteredPositions && (
                <Text style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>{'\u2022\u2022\u2022\u2022\u2022\u2022'}</Text>
              )}
            </>
          ) : spotError ? (
            <Text style={{ color: C.textMuted, fontSize: 12, textAlign: 'center' }}>Cours indisponibles</Text>
          ) : (
            <View>
              <View style={{ width: 180, height: 26, borderRadius: 6, backgroundColor: C.border, marginBottom: 10 }} />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <View style={{ width: 80, height: 20, borderRadius: 5, backgroundColor: C.border }} />
                <View style={{ width: 70, height: 20, borderRadius: 5, backgroundColor: C.border }} />
              </View>
              <View style={{ width: '100%', height: 36, borderRadius: 9, backgroundColor: C.border }} />
            </View>
          )}

          {/* CTA fiscal */}
          <TouchableOpacity
            style={[st.ctaFiscal, (!hasFilteredPositions || !pricesReady || masked) && { opacity: 0.5 }]}
            onPress={() => hasFilteredPositions && pricesReady && !masked && router.push('/fiscalite-globale')}
            activeOpacity={0.7}
            disabled={!hasFilteredPositions || !pricesReady || masked}
          >
            <Text style={st.ctaFiscalText}>{'Voir combien je récupère →'}</Text>
          </TouchableOpacity>
          <Text style={st.ctaSub}>Comparez les régimes et voyez votre net de vente</Text>
        </View>

        {/* ── 4. POSITIONS ───────────────────────────────── */}
        <View style={st.posHeader}>
          <Text style={st.posHeaderTitle}>POSITIONS ({filteredPositions.length})</Text>
          {!masked && !isPremium && (
            <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
              {positions.length >= limits.maxPositions ? (
                <Text style={st.quotaFull}>
                  <Text style={{ color: C.gold }}>{positions.length}/{limits.maxPositions} incluses</Text>
                  {' \u00B7 '}
                  <Text style={{ color: C.gold, fontWeight: '600' }}>Passez à Premium</Text>
                </Text>
              ) : (
                <Text style={st.quota}>
                  {positions.length}/{limits.maxPositions} incluses{' \u00B7 '}
                  <Text style={{ color: C.gold, opacity: 0.85 }}>Premium illimité</Text>
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {hasFilteredPositions ? (
          viewModels.map(vm => {
            const { position: pos, metrics } = vm;
            const isOpen = openId === pos.id;
            const isL2 = level2Id === pos.id;
            const cfg = METAL_CONFIG[pos.metal];
            const { currentValue, totalCost, gainLoss, gainPct, fiscal, regime: sellerNets, sellerNetForfaitaire: posSellerNet } = metrics;

            return (
              <View key={pos.id} style={[st.card, isOpen && st.cardOpen]}>
                {/* ── FERMÉ ── */}
                <TouchableOpacity
                  style={st.cardRow}
                  onPress={() => toggleCard(pos.id)}
                  activeOpacity={0.7}
                  disabled={masked}
                >
                  <View style={st.badgeCircle}>
                    <Text style={st.badgeText}>{cfg.symbol}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={st.cardName} numberOfLines={1}>{pos.product}</Text>
                    {masked ? null : gainLoss !== null ? (
                      <Text style={[st.cardGain, { color: gainLoss >= 0 ? C.green : C.red }]}>
                        {'Gain : '}{gainLoss >= 0 ? '+' : ''}{formatEuro(gainLoss)} {currencySymbol} ({formatPctSigned(gainPct ?? 0)})
                      </Text>
                    ) : (
                      <Text style={st.cardGainPlaceholder}>{'\u2014'}</Text>
                    )}
                    {!masked && (() => {
                      const qtyLabel = `${formatQty(pos.quantity)} pièce${pos.quantity > 1 ? 's' : ''}`;
                      if (!fiscal) return <Text style={st.cardMicro}>{qtyLabel}</Text>;
                      if (fiscal.isExonere) return <Text style={st.cardMicro}>{qtyLabel} {'\u00B7'} Exonéré</Text>;
                      const yLeft = fiscal.exemptionYear - new Date().getFullYear();
                      if (yLeft <= 3) return <Text style={[st.cardMicro, { color: C.textDim }]}>{qtyLabel} {'\u00B7'} Bientôt exonéré ({fiscal.exemptionYear})</Text>;
                      return <Text style={st.cardMicro}>{qtyLabel} {'\u00B7'} Réduction fiscale : {fiscal.abattement} %</Text>;
                    })()}
                  </View>
                  {!masked && (
                    <>
                      <Text style={st.cardValue}>
                        {currentValue !== null ? `${formatEuro(currentValue)} ${currencySymbol}` : '\u2014'}
                      </Text>
                      <Text style={[st.chev, { transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }]}>{'\u203A'}</Text>
                    </>
                  )}
                  {masked && (
                    <Text style={{ color: C.textDim, fontSize: 13 }}>{'\u2022\u2022\u2022\u2022\u2022\u2022'}</Text>
                  )}
                </TouchableOpacity>

                {/* ── L1 — FISCAL ── */}
                {isOpen && !masked && (() => {
                  return (
                  <View style={st.l1}>
                    <Text style={st.l1Title}>{'NET VENDEUR ESTIMÉ'}</Text>
                    <View style={st.l1Row}>
                      <Text style={st.l1Regime}>{'Régime forfaitaire ('}{TAX.labels.forfaitaire}{')'}</Text>
                      {posSellerNet !== null ? (
                        <Text style={st.l1NetVendeur}>
                          {'~'}{formatEuro(posSellerNet)} {currencySymbol}
                        </Text>
                      ) : (
                        <Text style={st.l1NetVendeur}>{'\u2014'}</Text>
                      )}
                    </View>
                    <View style={st.l1Trust}>
                      <Text style={st.l1TrustText}>
                        Régime : Forfaitaire {TAX.labels.forfaitaire} {'\u00B7'} Cours du jour
                        {timeStr ? ` \u00B7 Mis à jour à ${timeStr}` : ''}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={st.ctaSimuler}
                      onPress={() => router.push({ pathname: '/fiscalite', params: { positionId: pos.id } } as never)}
                      activeOpacity={0.7}
                    >
                      <Text style={st.ctaSimulerText}>{'Simuler ma vente →'}</Text>
                    </TouchableOpacity>

                    {!isPremium && (
                      <TouchableOpacity style={st.premiumTeaser} onPress={showPaywall} activeOpacity={0.7}>
                        <Ionicons name="lock-closed-outline" size={12} color={C.textDim} />
                        <View style={{ flex: 1 }}>
                          <Text style={st.premiumTeaserTitle}>
                            {(() => {
                              if (!sellerNets) return 'Comparer les 2 régimes fiscaux';
                              if (sellerNets.bestRegime === 'plusvalues' && sellerNets.delta > 50)
                                return `Un autre régime pourrait vous faire économiser ~${formatEuro(sellerNets.delta)}`;
                              return 'Comparer les 2 régimes fiscaux';
                            })()}
                          </Text>
                          <Text style={st.premiumTeaserSub}>
                            {sellerNets && sellerNets.bestRegime === 'plusvalues' && sellerNets.delta > 50
                              ? 'Comparez en 1 clic'
                              : 'Quel régime vous laisse le plus de net ?'}
                          </Text>
                        </View>
                        <View style={st.premiumBadge}>
                          <Text style={st.premiumBadgeText}>PREMIUM</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {!isL2 && (
                      <TouchableOpacity style={st.expandBtn} onPress={() => setLevel2Id(pos.id)}>
                        <Text style={st.expandBtnText}>{'Voir achat et fiscalité '}{'\u203A'}</Text>
                      </TouchableOpacity>
                    )}

                    {/* ── L2 — DÉTAILS ── */}
                    {isL2 && (
                      <View style={st.l2}>
                        {fiscal && (
                          <>
                            <Text style={st.l2SectionTitle}>EXONÉRATION FISCALE</Text>
                            <View style={st.l2FiscalRow}>
                              <Text style={st.l2FiscalText}>Détention : {fiscal.detentionLabel}</Text>
                              <Text style={st.l2FiscalText}>Abattement : {fiscal.abattement} %</Text>
                            </View>
                            <View style={st.progressBg}>
                              <View
                                style={[
                                  st.progressFill,
                                  { width: `${Math.max(0, Math.min(fiscal.abattement, 100))}%` },
                                ]}
                              />
                            </View>
                            {fiscal.isExonere ? (
                              <Text style={{ color: C.white, fontSize: 12, fontWeight: '600' }}>Exonéré {'\u2713'}</Text>
                            ) : (
                              <Text style={{ color: C.white, fontSize: 12, fontWeight: '600' }}>
                                Totalement exonéré en {fiscal.exemptionLabel}
                              </Text>
                            )}
                          </>
                        )}

                        <View style={st.l2Grid}>
                          <View style={st.l2GridItem}>
                            <Text style={st.l2GridLabel}>Quantité</Text>
                            <Text style={st.l2GridValue}>
                              {formatQty(pos.quantity)} pièce{pos.quantity > 1 ? 's' : ''}
                            </Text>
                          </View>
                          <View style={st.l2GridItem}>
                            <Text style={st.l2GridLabel}>Acheté le</Text>
                            <Text style={st.l2GridValue}>{pos.purchaseDate}</Text>
                          </View>
                          <View style={st.l2GridItem}>
                            <Text style={st.l2GridLabel}>Prix d{'\u2019'}achat</Text>
                            <Text style={st.l2GridValue}>{formatEuro(pos.purchasePrice)} {'€'}</Text>
                          </View>
                        </View>

                        <View style={st.l2Compare}>
                          <View style={{ flex: 1 }}>
                            <Text style={st.l2CompareLabel}>Investi</Text>
                            <Text style={st.l2CompareValue}>{formatEuro(totalCost)} {currencySymbol}</Text>
                          </View>
                          <View style={st.l2CompareDivider} />
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Text style={st.l2CompareLabel}>Vaut aujourd{'\u2019'}hui</Text>
                            <Text style={st.l2CompareValue}>
                              {currentValue !== null ? `${formatEuro(currentValue)} ${currencySymbol}` : '\u2014'}
                            </Text>
                          </View>
                        </View>

                        {pos.note != null && pos.note.trim().length > 0 && pos.note.trim() !== 'Note' && (
                          <Text style={st.l2Note}>{pos.note}</Text>
                        )}

                        <View style={st.l2Actions}>
                          <TouchableOpacity
                            onPress={() =>
                              router.replace({ pathname: '/(tabs)/ajouter' as never, params: { editId: pos.id } })
                            }
                          >
                            <Text style={st.l2Edit}>Modifier</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert('Position', undefined, [
                                {
                                  text: 'Supprimer',
                                  style: 'destructive',
                                  onPress: () => {
                                    Alert.alert('Supprimer cette position ?', 'Cette action est irréversible.', [
                                      { text: 'Annuler', style: 'cancel' },
                                      {
                                        text: 'Supprimer',
                                        style: 'destructive',
                                        onPress: () => {
                                          deletePosition(pos.id);
                                          setOpenId(null);
                                          setLevel2Id(null);
                                        },
                                      },
                                    ]);
                                  },
                                },
                                { text: 'Annuler', style: 'cancel' },
                              ]);
                            }}
                          >
                            <Ionicons name="ellipsis-vertical" size={16} color={C.textDim} />
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={st.collapseBtn} onPress={() => setLevel2Id(null)}>
                          <Text style={st.collapseBtnText}>Réduire</Text>
                          <Text style={st.collapseChev}>{'\u203A'}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  );
                })()}
              </View>
            );
          })
        ) : hasPositions && filterMetal ? (
          <View style={st.emptyState}>
            <Ionicons name="briefcase-outline" size={40} color={C.textMuted} style={{ marginBottom: 12 }} />
            <Text style={st.emptyTitle}>Aucune position en {filterMetalName?.toLowerCase()}</Text>
            <TouchableOpacity onPress={clearFilter}>
              <Text style={st.emptyAction}>{'Tout afficher →'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace('/(tabs)/ajouter' as never)}>
              <Text style={st.emptyAction}>{'Ajouter une position →'}</Text>
            </TouchableOpacity>
          </View>
        ) : !hasPositions ? (
          <View style={st.emptyState}>
            <Ionicons name="briefcase-outline" size={40} color={C.textMuted} style={{ marginBottom: 12 }} />
            <Text style={st.emptyTitle}>Aucune position</Text>
            <Text style={st.emptyText}>Ajoutez votre premier achat pour suivre votre portefeuille.</Text>
            <TouchableOpacity onPress={() => router.replace('/(tabs)/ajouter' as never)}>
              <Text style={st.emptyAction}>{'Ajouter une position →'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── 5. STATS TEASER ────────────────────────────── */}
        <TouchableOpacity
          style={st.statsTeaser}
          onPress={() => Alert.alert('Premium', 'Débloquez les statistiques avec OrTrack Premium')}
          activeOpacity={0.7}
        >
          <Ionicons name="bar-chart-outline" size={18} color={C.gold} />
          <View style={{ flex: 1 }}>
            <Text style={st.statsTeaserTitle}>Statistiques</Text>
            <Text style={st.statsTeaserSub}>
              {bestPerformerName
                ? `Votre ${truncName(bestPerformerName)} est votre meilleur performer`
                : 'Voyez quelles positions tirent vraiment votre performance'}
            </Text>
          </View>
          <View style={st.premiumBadgeLg}>
            <Text style={st.premiumBadgeLgText}>PREMIUM</Text>
          </View>
        </TouchableOpacity>

        {/* ── 6. TRUST FOOTER ────────────────────────────── */}
        <View style={st.trustFooter}>
          <Text style={st.trustLine1}>
            Cours du jour{timeStr ? ` \u00B7 Mis à jour à ${timeStr}` : ''}
          </Text>
          <Text style={st.trustLine2}>Estimation indicative {'\u00B7'} Ne constitue pas un conseil fiscal</Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scroll: { padding: 20, paddingBottom: 90 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: C.white },

  // Filter bar
  filterBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  filterLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  filterLabel: { color: C.white, fontSize: 12, fontWeight: '600' },
  filterClear: { color: C.textDim, fontSize: 11, fontWeight: '600' },

  // Résumé (hero card)
  heroCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  resumeValue: { fontSize: 30, fontWeight: '700', color: C.white, letterSpacing: -0.5 },
  resumeGainRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  resumeGain: { fontSize: 12, fontWeight: '600' },
  resumeGainPct: { color: C.textMuted, fontSize: 12 },
  resumeNetRow: { marginTop: 10 },
  resumeNetVendeur: { color: C.gold, fontSize: 17, fontWeight: '700' },
  resumeNetSub: { color: C.textDim, fontSize: 11, fontStyle: 'italic', marginTop: 2 },

  // CTA fiscal
  ctaFiscal: { borderWidth: 1.5, borderColor: C.gold, backgroundColor: 'transparent', borderRadius: 12, paddingVertical: 11, marginTop: 14 },
  ctaFiscalText: { color: C.gold, fontSize: 13.5, fontWeight: '700', textAlign: 'center' },
  ctaSub: { textAlign: 'center', marginTop: 5, fontSize: 11, color: C.textMuted },

  // Positions header
  posHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  posHeaderTitle: { fontSize: 12, fontWeight: '700', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1 },
  quota: { fontSize: 10, color: C.textDim },
  quotaFull: { fontSize: 10, color: C.gold, fontWeight: '600' },

  // Card
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 10 },
  cardOpen: { backgroundColor: C.cardOpen, borderColor: C.openBorder },
  cardRow: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 16, gap: 0 },
  badgeCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: C.gold, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: C.gold, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  cardName: { color: C.white, fontSize: 14, fontWeight: '600' },
  cardGain: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  cardGainPlaceholder: { color: C.textMuted, fontSize: 11, marginTop: 1 },
  cardMicro: { color: C.textMuted, fontSize: 10, marginTop: 2 },
  cardValue: { color: C.white, fontSize: 14, fontWeight: '600', flexShrink: 0, marginRight: 8, textAlign: 'right' },
  chev: { color: C.textDim, opacity: 0.75, fontSize: 18 },

  // L1 — Fiscal
  l1: { borderTopWidth: 1, borderTopColor: C.divider, paddingHorizontal: 16, paddingBottom: 14 },
  l1Title: { color: C.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 8, textTransform: 'uppercase' },
  l1Row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  l1Regime: { color: C.textDim, fontSize: 12 },
  l1NetVendeur: { color: C.gold, fontSize: 16, fontWeight: '700' },
  l1Trust: { backgroundColor: 'rgba(201,168,76,0.03)', borderRadius: 6, padding: 8, marginBottom: 12 },
  l1TrustText: { color: C.textDim, fontSize: 10 },
  ctaSimuler: { borderWidth: 1.5, borderColor: C.gold, backgroundColor: 'transparent', borderRadius: 10, paddingVertical: 12, marginBottom: 12 },
  ctaSimulerText: { color: C.gold, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  premiumTeaser: { backgroundColor: 'rgba(201,168,76,0.03)', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  premiumTeaserTitle: { color: C.textDim, fontSize: 11, fontWeight: '600' },
  premiumTeaserSub: { color: C.textDim, fontSize: 9.5, marginTop: 1 },
  premiumBadge: { backgroundColor: C.goldDim, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 },
  premiumBadgeText: { color: C.gold, fontSize: 8, fontWeight: '700' },
  expandBtn: { borderTopWidth: 1, borderTopColor: C.divider, paddingVertical: 10, alignItems: 'center' },
  expandBtnText: { color: C.textDim, fontSize: 11 },

  // L2 — Détails
  l2: { borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 12, paddingHorizontal: 16 },
  l2SectionTitle: { color: C.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  l2FiscalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  l2FiscalText: { color: C.textMuted, fontSize: 11 },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: C.border, opacity: 0.8, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.gold },
  l2Grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  l2GridItem: { width: '48%', marginBottom: 8 },
  l2GridLabel: { color: C.textDim, fontSize: 10, marginBottom: 2 },
  l2GridValue: { color: C.white, fontSize: 12, fontWeight: '600' },
  l2Compare: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  l2CompareLabel: { color: C.textDim, fontSize: 10, marginBottom: 4 },
  l2CompareValue: { color: C.white, fontSize: 15, fontWeight: '700' },
  l2CompareDivider: { width: 1, backgroundColor: C.border, marginHorizontal: 12, alignSelf: 'stretch' },
  l2Note: { color: C.gold, fontSize: 11, fontStyle: 'italic', marginBottom: 8 },
  l2Actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 12, marginBottom: 8 },
  l2Edit: { color: C.gold, fontSize: 12, fontWeight: '600' },
  collapseBtn: { borderTopWidth: 1, borderTopColor: C.divider, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  collapseBtnText: { color: C.textDim, fontSize: 11 },
  collapseChev: { color: C.textDim, fontSize: 12, transform: [{ rotate: '-90deg' }] },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { color: C.textDim, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  emptyText: { color: C.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20, marginBottom: 8 },
  emptyAction: { color: C.gold, fontSize: 13, fontWeight: '600', marginTop: 14 },

  // Stats teaser
  statsTeaser: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  statsTeaserTitle: { color: C.white, fontSize: 13, fontWeight: '600' },
  statsTeaserSub: { color: C.textDim, fontSize: 10, marginTop: 1 },
  premiumBadgeLg: { backgroundColor: C.goldDim, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8 },
  premiumBadgeLgText: { color: C.gold, fontSize: 9, fontWeight: '700' },

  // Trust footer
  trustFooter: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.divider, alignItems: 'center' },
  trustLine1: { color: C.trustPrimary, fontSize: 12, textAlign: 'center' },
  trustLine2: { color: C.trustSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
