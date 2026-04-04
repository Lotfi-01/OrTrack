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
import { truncName } from '@/utils/format';
import { computePositionViewModels, computePortfolioSummary, getBestPerformerName } from '@/utils/portfolio';
import { OrTrackColors } from '@/constants/theme';
import PortfolioHero from '@/components/portfolio/PortfolioHero';
import PositionCard from '@/components/portfolio/PositionCard';
import PortfolioEmptyState from '@/components/portfolio/PortfolioEmptyState';
import PortfolioStatsTeaser from '@/components/portfolio/PortfolioStatsTeaser';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRef = useRef<string | null>(null);

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
        <PortfolioHero
          summary={summary}
          currencySymbol={currencySymbol}
          masked={masked}
          pricesReady={pricesReady}
          spotError={spotError}
          hasFilteredPositions={hasFilteredPositions}
          onPressFiscal={() => router.push('/fiscalite-globale')}
          ctaDisabled={!hasFilteredPositions || !pricesReady || masked}
        />

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
          viewModels.map(vm => (
            <PositionCard
              key={vm.position.id}
              viewModel={vm}
              isOpen={openId === vm.position.id}
              isLevel2={level2Id === vm.position.id}
              masked={masked}
              currencySymbol={currencySymbol}
              isPremium={isPremium}
              timeStr={timeStr}
              onToggle={() => toggleCard(vm.position.id)}
              onExpandL2={() => setLevel2Id(vm.position.id)}
              onCollapseL2={() => setLevel2Id(null)}
              onEdit={() => router.replace({ pathname: '/(tabs)/ajouter' as never, params: { editId: vm.position.id } })}
              onDelete={() => {
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
                          onPress: async () => {
                            if (deletingRef.current) return;
                            deletingRef.current = vm.position.id;
                            setDeletingId(vm.position.id);
                            try {
                              await deletePosition(vm.position.id);
                              if (openId === vm.position.id) setOpenId(null);
                              if (level2Id === vm.position.id) setLevel2Id(null);
                            } catch {
                              Alert.alert('Erreur', 'La suppression a échoué. Réessayez.');
                            } finally {
                              deletingRef.current = null;
                              setDeletingId(null);
                            }
                          },
                        },
                      ]);
                    },
                  },
                  { text: 'Annuler', style: 'cancel' },
                ]);
              }}
              onSimulateSale={() => router.push({ pathname: '/fiscalite', params: { positionId: vm.position.id } } as never)}
              onShowPaywall={showPaywall}
              isDeleting={deletingId !== null}
            />
          ))
        ) : hasPositions && filterMetal ? (
          <PortfolioEmptyState
            isFilterActive
            metalName={filterMetalName}
            onAdd={() => router.replace('/(tabs)/ajouter' as never)}
            onClearFilter={clearFilter}
          />
        ) : !hasPositions ? (
          <PortfolioEmptyState
            isFilterActive={false}
            onAdd={() => router.replace('/(tabs)/ajouter' as never)}
            onClearFilter={clearFilter}
          />
        ) : null}

        {/* ── 5. STATS TEASER ────────────────────────────── */}
        <PortfolioStatsTeaser
          subtitleText={bestPerformerName
            ? `Votre ${truncName(bestPerformerName)} est votre meilleur performer`
            : 'Voyez quelles positions tirent vraiment votre performance'}
          onPress={() => Alert.alert('Premium', 'Débloquez les statistiques avec OrTrack Premium')}
        />

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


  // Positions header
  posHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  posHeaderTitle: { fontSize: 12, fontWeight: '700', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1 },
  quota: { fontSize: 10, color: C.textDim },
  quotaFull: { fontSize: 10, color: C.gold, fontWeight: '600' },

  // Trust footer
  trustFooter: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.divider, alignItems: 'center' },
  trustLine1: { color: C.trustPrimary, fontSize: 12, textAlign: 'center' },
  trustLine2: { color: C.trustSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
