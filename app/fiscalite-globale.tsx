import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import Ionicons from '@expo/vector-icons/Ionicons';
import { METAL_CONFIG, getSpot } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { OrTrackColors } from '@/constants/theme';
import { formatEuro, stripMetalFromName } from '@/utils/format';
import { TaxResult, parseDate, calcYearsHeld, computeTax } from '@/utils/tax-helpers';
import { PARTIAL_ESTIMATE_NOTICE, REGIME_EQUALITY_THRESHOLD, isGainFiscalEligiblePosition } from '@/utils/fiscal';
import { computePositionCost, computePositionValue } from '@/utils/position-calc';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { Position } from '@/types/position';
import { usePositions } from '@/hooks/use-positions';
import { usePremium } from '@/contexts/premium-context';
import { trackEvent } from '@/services/analytics';

const C = OrTrackColors;

// ─── Analytics (à brancher) ──────────────────────────────────────────────────
// Aucun tracker commun n'est encore disponible. Events produit à câbler
// quand l'infrastructure sera en place :
//   - simulation_global_opened   → à l'ouverture de l'écran (mount ou focus)
//   - premium_teaser_seen        → premier render du teaser pour un free user
//   - premium_teaser_clicked     → clic CTA "Découvrir Premium" du teaser
//   - paywall_opened_from_simulation → juste avant l'appel à showPaywall()
// Pas de noop local : ne pas ajouter de stub avant que l'infrastructure existe.

// ─── Types ──────────────────────────────────────────────────────────────────

type PositionResult = {
  pos: Position;
  salePrice: number;
  costPrice: number;
  years: number;
  tax: TaxResult;
  bestRegime: 'forfaitaire' | 'plusvalues' | null;
};

// ─── Helpers (locaux, ≤ 10 lignes chacun) ───────────────────────────────────

const MAX_SIMULATION_YEARS = 30;
const FULL_PV_ABATEMENT_YEARS_FR = 22;

function getTodayLocalDate(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
}

function normalizeToNoonLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function toLocalDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function formatDisplayDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function addYearsSafe(date: Date, years: number): Date {
  const y = date.getFullYear() + years;
  const mo = date.getMonth();
  const d = date.getDate();
  const cand = new Date(y, mo, d, 12, 0, 0, 0);
  if (cand.getMonth() !== mo) return new Date(y, mo + 1, 0, 12, 0, 0, 0);
  return cand;
}

function isValidLocalDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

function clampSimulationDate(date: Date): Date {
  if (!isValidLocalDate(date)) return getTodayLocalDate();
  const today = getTodayLocalDate();
  const max = addYearsSafe(today, MAX_SIMULATION_YEARS);
  const k = toLocalDateKey(date);
  if (k < toLocalDateKey(today)) return today;
  if (k > toLocalDateKey(max)) return max;
  return normalizeToNoonLocal(date);
}

// GARDE-FOU : la logique d'orchestration de cette fonction (filtres d'exclusion,
// agrégation, comparaison contre REGIME_EQUALITY_THRESHOLD) doit rester strictement
// alignée avec le useMemo principal de ce fichier (calcul de computed[] / netForfaitaire / netPlusValues).
// Toute modification des règles d'exclusion ou de la logique d'agrégation dans le useMemo principal
// doit être reproduite ici. Le moteur fiscal lui-même (computeTax) reste l'unique source de calcul.
// Type `prices` dérivé via Parameters<typeof getSpot> pour éviter d'importer SpotPrices.
function computeBestRegimeForDate(
  positions: Position[],
  prices: Parameters<typeof getSpot>[1],
  date: Date,
): 'equality' | 'plusvalues' | 'forfaitaire' | 'unknown' {
  let totalSale = 0;
  let totalForfaitaire = 0;
  let totalPlusValuesTax = 0;
  let computedCount = 0;

  for (const pos of positions) {
    if (!isGainFiscalEligiblePosition(pos)) continue;

    const spot = getSpot(pos.metal, prices);
    const salePrice = computePositionValue(pos, spot);
    if (salePrice === null) continue;

    const purchaseDate = parseDate(pos.purchaseDate);
    if (purchaseDate === null) continue;
    if (date.getTime() < purchaseDate.getTime()) continue;

    const costPrice = computePositionCost(pos);
    const years = calcYearsHeld(purchaseDate, date);
    const tax = computeTax(salePrice, costPrice, years);

    totalSale += salePrice;
    totalForfaitaire += tax.forfaitaire;
    totalPlusValuesTax += tax.plusValuesTax;
    computedCount += 1;
  }

  if (computedCount === 0) return 'unknown';

  const netForfaitaire = totalSale - totalForfaitaire;
  const netPlusValues = totalSale - totalPlusValuesTax;

  if (Math.abs(netPlusValues - netForfaitaire) < REGIME_EQUALITY_THRESHOLD) {
    return 'equality';
  }

  return netPlusValues > netForfaitaire ? 'plusvalues' : 'forfaitaire';
}

// ─── Premium teaser (free users) ────────────────────────────────────────────

function PremiumTeaserBlock({
  onCtaPress,
  firedRef,
}: {
  onCtaPress: () => void;
  firedRef: { current: boolean };
}) {
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void trackEvent('premium_teaser_viewed');
  }, [firedRef]);

  return (
    <View style={st.premiumTeaser}>
      <Text style={st.premiumTeaserTitle}>Comparer les 2 régimes fiscaux</Text>
      <Text style={st.premiumTeaserText}>
        Débloquez le comparatif fiscal complet et le détail par position pour mieux préparer vos ventes.
      </Text>
      <TouchableOpacity
        style={st.premiumTeaserCta}
        onPress={onCtaPress}
        activeOpacity={0.8}
      >
        <Text style={st.premiumTeaserCtaText}>Découvrir Premium</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Écran ──────────────────────────────────────────────────────────────────

export default function FiscaliteGlobaleScreen() {
  const { prices } = useSpotPrices();
  const { positions, reloadPositions } = usePositions();
  const { isPremium, showPaywall } = usePremium();
  const [simulatedFiscalDate, setSimulatedFiscalDate] = useState<Date>(() => getTodayLocalDate());
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const isPickerOpenRef = useRef(false);
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [masked, setMasked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reloadPositions();
      AsyncStorage.getItem(STORAGE_KEYS.privacyMode)
        .then(v => setMasked(v === 'true'))
        .catch(() => {});
    }, [reloadPositions]),
  );

  // \u2500\u2500 Funnel analytics \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // global_simulation_opened: once per mount.
  // premium_teaser_viewed: once per mount when teaser becomes visible for a
  // free user. The teaser is rendered conditionally based on `!isPremium`
  // and the presence of computed results, so we guard with a ref to ensure
  // a single fire per mount.
  useEffect(() => {
    void trackEvent('global_simulation_opened');
  }, []);

  const teaserViewedFiredRef = useRef(false);

  const handleTeaserCtaPress = useCallback(() => {
    void trackEvent('premium_teaser_clicked');
    showPaywall();
  }, [showPaywall]);

  const m = (text: string) => (masked ? '••••••' : text);

  // ── Calculs ─────────────────────────────────────────────────────────────

  const { computed, excluded, exclusionReason, hasZeroPurchaseExcluded } = useMemo(() => {
    const comp: PositionResult[] = [];
    const excl: Position[] = [];
    let spotMissing = 0;
    let dateMissing = 0;
    let dateFuture = 0;
    let dataInvalid = 0;
    let zeroPurchasePrice = 0;

    for (const pos of positions) {
      if (!isGainFiscalEligiblePosition(pos)) {
        excl.push(pos);
        dataInvalid++;
        if (pos.purchasePrice === 0) zeroPurchasePrice++;
        continue;
      }

      const spot = getSpot(pos.metal, prices);
      const sv = computePositionValue(pos, spot);
      if (sv === null) { excl.push(pos); spotMissing++; continue; }

      const purchaseDateParsed = parseDate(pos.purchaseDate);
      if (purchaseDateParsed === null) { excl.push(pos); dateMissing++; continue; }

      if (simulatedFiscalDate.getTime() < purchaseDateParsed.getTime()) {
        excl.push(pos);
        dateFuture++;
        continue;
      }

      const salePrice = sv;
      const costPrice = computePositionCost(pos);
      const years = calcYearsHeld(purchaseDateParsed, simulatedFiscalDate);
      const tax = computeTax(salePrice, costPrice, years);
      const taxDelta = Math.abs(tax.plusValuesTax - tax.forfaitaire);
      const bestRegime = taxDelta < REGIME_EQUALITY_THRESHOLD ? null : tax.plusValuesTax < tax.forfaitaire ? ('plusvalues' as const) : ('forfaitaire' as const);

      comp.push({ pos, salePrice, costPrice, years, tax, bestRegime });
    }

    // Message d'exclusion adapté au motif
    let reason: string | null = null;
    if (excl.length > 0) {
      const n = excl.length;
      const plural = n > 1;
      if (dateFuture > 0 && spotMissing === 0 && dateMissing === 0 && dataInvalid === 0) {
        reason = `${n} position${plural ? 's' : ''} exclue${plural ? 's' : ''} \u2014 date fiscale simulée antérieure à la date d\u2019achat`;
      } else if (spotMissing > 0 && dateFuture === 0 && dateMissing === 0 && dataInvalid === 0) {
        reason = `Cours indisponibles pour ${n} position${plural ? 's' : ''}`;
      } else if (dateMissing > 0 && spotMissing === 0 && dateFuture === 0 && dataInvalid === 0) {
        reason = `${n} position${plural ? 's' : ''} avec date d\u2019achat invalide`;
      } else if (zeroPurchasePrice > 0 && zeroPurchasePrice === dataInvalid && spotMissing === 0 && dateFuture === 0 && dateMissing === 0) {
        reason = PARTIAL_ESTIMATE_NOTICE;
      } else if (dataInvalid > 0 && spotMissing === 0 && dateFuture === 0 && dateMissing === 0) {
        reason = `${n} position${plural ? 's' : ''} exclue${plural ? 's' : ''} \u2014 données incomplètes`;
      } else {
        reason = `${n} position${plural ? 's' : ''} exclue${plural ? 's' : ''} de la simulation`;
      }
    }

    return { computed: comp, excluded: excl, exclusionReason: reason, hasZeroPurchaseExcluded: zeroPurchasePrice > 0 };
  }, [positions, prices, simulatedFiscalDate]);

  // Horizon 22 ans (France-only confirmé via constants/tax) ──────────────────
  const horizonInfo = useMemo<{ disabled: true } | { disabled: false; target: Date }>(() => {
    const dates: Date[] = [];
    const todayKey = toLocalDateKey(getTodayLocalDate());
    for (const pos of positions) {
      if (!isGainFiscalEligiblePosition(pos)) continue;
      if (!Number.isFinite(pos.quantity) || pos.quantity <= 0) continue;
      const d = parseDate(pos.purchaseDate);
      if (!d) continue;
      if (toLocalDateKey(d) > todayKey) continue;
      dates.push(d);
    }
    if (dates.length === 0) return { disabled: true };
    const mostRecent = dates.reduce((m, d) => (d.getTime() > m.getTime() ? d : m), dates[0]);
    const horizon = addYearsSafe(normalizeToNoonLocal(mostRecent), FULL_PV_ABATEMENT_YEARS_FR);
    return { disabled: false, target: clampSimulationDate(horizon) };
  }, [positions]);

  // Ref-based tracker pour use_simulated_fiscal_date : permet aux callbacks
  // déclarés avant les agrégats (openDatePicker) de lire les valeurs à jour
  // sans inscrire bestGlobalRegime/isEquality/isPremium dans leurs deps
  // (variables déclarées plus bas dans le composant).
  const fireUseSimulatedFiscalDateRef = useRef<
    (preset: 'today' | 'one_year' | 'horizon_22' | 'custom', targetDate: Date) => void
  >(() => {});

  // DatePicker (impératif Android, inline iOS) ────────────────────────────────
  const openDatePicker = useCallback(() => {
    if (isPickerOpenRef.current) return;
    if (Platform.OS === 'ios') {
      isPickerOpenRef.current = true;
      setIosPickerVisible(true);
      return;
    }
    const today = getTodayLocalDate();
    const maxDate = addYearsSafe(today, MAX_SIMULATION_YEARS);
    isPickerOpenRef.current = true;
    try {
      DateTimePickerAndroid.open({
        value: simulatedFiscalDate,
        mode: 'date',
        minimumDate: today,
        maximumDate: maxDate,
        onChange: (event, date) => {
          isPickerOpenRef.current = false;
          if (event.type === 'dismissed' || !date) return;
          if (!isValidLocalDate(date)) {
            if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[simulatedFiscalDate] invalid date input');
            return;
          }
          const targetDate = clampSimulationDate(normalizeToNoonLocal(date));
          setSimulatedFiscalDate(targetDate);
          fireUseSimulatedFiscalDateRef.current('custom', targetDate);
        },
      });
    } catch {
      isPickerOpenRef.current = false;
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[DatePicker] open failed');
    }
  }, [simulatedFiscalDate]);

  const closeIosPicker = useCallback(() => {
    setIosPickerVisible(false);
    isPickerOpenRef.current = false;
  }, []);

  // Agrégats
  const totalSalePrice = computed.reduce((s, r) => s + r.salePrice, 0);
  const totalCostPrice = computed.reduce((s, r) => s + r.costPrice, 0);
  const grossGain = totalSalePrice - totalCostPrice;
  const totalForfaitaire = computed.reduce((s, r) => s + r.tax.forfaitaire, 0);
  const totalPlusValuesTax = computed.reduce((s, r) => s + r.tax.plusValuesTax, 0);
  const netForfaitaire = totalSalePrice - totalForfaitaire;
  const netPlusValues = totalSalePrice - totalPlusValuesTax;
  const delta = Math.abs(netPlusValues - netForfaitaire);
  const isEquality = delta < REGIME_EQUALITY_THRESHOLD;
  const bestGlobalRegime = isEquality ? null : netPlusValues > netForfaitaire ? 'plusvalues' : 'forfaitaire';
  const heroNet = bestGlobalRegime === 'plusvalues' ? netPlusValues : netForfaitaire;
  const bestRegimeName = bestGlobalRegime === 'plusvalues' ? 'plus-values' : 'forfaitaire';

  // Mise à jour à chaque rendu : la ref expose la fonction de tracking aux
  // callbacks (openDatePicker, picker iOS onChange, chips). bestRegime est
  // calculé contre la targetDate passée par l'appelant (date au moment du tap),
  // pas contre simulatedFiscalDate (qui n'a pas encore propagé via React state).
  fireUseSimulatedFiscalDateRef.current = (preset, targetDate) => {
    void trackEvent('use_simulated_fiscal_date', {
      preset,
      isPremium,
      positionsCount: positions.length,
      bestRegime: computeBestRegimeForDate(positions, prices, targetDate),
    });
  };

  // Abattement global unique (pour le bloc explicatif)
  const uniqueAbatement = useMemo(() => {
    if (computed.length === 0) return null;
    const first = computed[0].tax.abatement;
    const allSame = computed.every(r => r.tax.abatement === first);
    return allSame ? Math.round(first * 100) : null;
  }, [computed]);

  // ── Rendu ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={st.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Simulation globale',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 12 }}>
              <Text style={{ color: C.gold, fontSize: 16 }}>{'\u2190'} Retour</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {/* ── CAS 1 : Aucune position ── */}
          {positions.length === 0 && (
            <View style={st.emptyCard}>
              <Text style={st.emptyText}>Aucune position dans votre portefeuille</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/ajouter')}>
                <Text style={st.emptyLink}>{'Ajouter une position \u2192'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── DATE FISCALE SIMULÉE (toujours visible si positions existent) ── */}
          {positions.length > 0 && (
            <View style={st.section}>
              <Text style={st.sectionLabel}>DATE FISCALE SIMULÉE</Text>
              <TouchableOpacity
                style={st.dateRow}
                activeOpacity={0.8}
                onPress={openDatePicker}
                accessibilityRole="button"
                accessibilityLabel="Modifier la date fiscale simulée"
                accessibilityHint="Ouvre un calendrier pour choisir une date fiscale simulée"
              >
                <Text style={st.dateValue}>{formatDisplayDate(simulatedFiscalDate)}</Text>
                <Ionicons name="calendar-outline" size={18} color={C.gold} />
              </TouchableOpacity>
              {isPremium ? (
                <Text style={st.inputHint}>
                  La date fiscale simulée détermine l{'\u2019'}abattement du régime plus-values (5 % par an dès la 3e année).
                </Text>
              ) : (
                <Text style={st.inputHint}>
                  Le cours utilisé reste le cours du jour. Seule la fiscalité change.
                </Text>
              )}
              {(() => {
                const today = getTodayLocalDate();
                const oneYear = addYearsSafe(today, 1);
                const isTodaySelected = isSameLocalDay(simulatedFiscalDate, today);
                const isOneYearSelected = isSameLocalDay(simulatedFiscalDate, oneYear);
                const isHorizonDisabled = horizonInfo.disabled;
                const isHorizonSelected = !isHorizonDisabled && isSameLocalDay(simulatedFiscalDate, horizonInfo.target);
                return (
                  <>
                    <View style={st.chipsRow}>
                      <TouchableOpacity
                        style={[st.chip, isTodaySelected && st.chipActive]}
                        activeOpacity={0.8}
                        onPress={() => {
                          const targetDate = getTodayLocalDate();
                          setSimulatedFiscalDate(targetDate);
                          fireUseSimulatedFiscalDateRef.current('today', targetDate);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Simuler la fiscalité aujourd'hui"
                        accessibilityState={{ selected: isTodaySelected }}
                      >
                        <Text style={[st.chipText, isTodaySelected && st.chipTextActive]}>{'Aujourd’hui'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.chip, isOneYearSelected && st.chipActive]}
                        activeOpacity={0.8}
                        onPress={() => {
                          const targetDate = addYearsSafe(getTodayLocalDate(), 1);
                          setSimulatedFiscalDate(targetDate);
                          fireUseSimulatedFiscalDateRef.current('one_year', targetDate);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Simuler la fiscalité dans un an"
                        accessibilityState={{ selected: isOneYearSelected }}
                      >
                        <Text style={[st.chipText, isOneYearSelected && st.chipTextActive]}>Dans 1 an</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.chip, isHorizonSelected && st.chipActive, isHorizonDisabled && st.chipDisabled]}
                        activeOpacity={0.8}
                        disabled={isHorizonDisabled}
                        onPress={() => {
                          if (!horizonInfo.disabled) {
                            setSimulatedFiscalDate(horizonInfo.target);
                            fireUseSimulatedFiscalDateRef.current('horizon_22', horizonInfo.target);
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={"Simuler l'horizon où toutes vos positions auront 22 ans"}
                        accessibilityState={{ disabled: isHorizonDisabled, selected: isHorizonSelected }}
                      >
                        <Text style={[st.chipText, isHorizonSelected && st.chipTextActive]}>Horizon 22 ans</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={st.horizonHint}>{'Selon les dates d’achat renseignées.'}</Text>
                  </>
                );
              })()}
              {Platform.OS === 'ios' && iosPickerVisible && (
                <View style={st.iosPickerWrap}>
                  <DateTimePicker
                    value={simulatedFiscalDate}
                    mode="date"
                    display="inline"
                    minimumDate={getTodayLocalDate()}
                    maximumDate={addYearsSafe(getTodayLocalDate(), MAX_SIMULATION_YEARS)}
                    themeVariant="dark"
                    locale="fr-FR"
                    onChange={(event, date) => {
                      if (event.type === 'dismissed') { closeIosPicker(); return; }
                      if (!date || !isValidLocalDate(date)) {
                        if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[simulatedFiscalDate] invalid date input');
                        return;
                      }
                      const targetDate = clampSimulationDate(normalizeToNoonLocal(date));
                      setSimulatedFiscalDate(targetDate);
                      fireUseSimulatedFiscalDateRef.current('custom', targetDate);
                    }}
                  />
                  <TouchableOpacity style={st.iosPickerDone} onPress={closeIosPicker} activeOpacity={0.8}>
                    <Text style={st.iosPickerDoneText}>Fermer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── CAS : Toutes positions exclues ── */}
          {positions.length > 0 && computed.length === 0 && excluded.length > 0 && (
            <View style={st.warningCard}>
              <Text style={st.warningTitle}>Simulation impossible</Text>
              <Text style={st.warningText}>{exclusionReason}</Text>
            </View>
          )}

          {/* ── CAS 4 : Résultats disponibles ── */}
          {computed.length > 0 && (
            <>
              {/* POSITIONS EXCLUES — bandeau */}
              {excluded.length > 0 && exclusionReason && (
                <View style={st.excludedBanner}>
                  <Text style={st.excludedText}>{'\u26A0\uFE0F'} {exclusionReason}</Text>
                </View>
              )}

              {/* SIMULATION PARTIELLE — avertissement */}
              {excluded.length > 0 && (
                <Text style={st.partialNotice}>
                  {hasZeroPurchaseExcluded
                    ? PARTIAL_ESTIMATE_NOTICE
                    : `Simulation sur ${computed.length} position${computed.length > 1 ? 's' : ''} sur ${positions.length}. ${excluded.length} position${excluded.length > 1 ? 's' : ''} exclue${excluded.length > 1 ? 's' : ''}.`}
                </Text>
              )}

              {/* 3. HERO — Montant récupérable estimé */}
              <View style={st.heroCard}>
                <Text style={st.heroLabel}>MONTANT RÉCUPÉRABLE ESTIMÉ</Text>
                <Text style={st.heroValue}>{m(`${formatEuro(heroNet)} \u20AC`)}</Text>
                {masked ? (
                  <Text style={st.heroSub}>Résultat masqué en mode confidentialité</Text>
                ) : isEquality ? (
                  <>
                    <Text style={st.heroSub}>Les deux régimes donnent un net équivalent à cette date.</Text>
                    <Text style={st.heroPriceNote}>Avec les cours actuels</Text>
                  </>
                ) : !isPremium ? (
                  <>
                    <Text style={st.heroSub}>Régime {bestRegimeName} au {formatDisplayDate(simulatedFiscalDate)}</Text>
                    <Text style={st.heroPriceNote}>Avec les cours actuels</Text>
                  </>
                ) : (
                  <>
                    <Text style={st.heroDelta}>+{formatEuro(delta)} {'\u20AC'} avec le {bestRegimeName}</Text>
                    <Text style={st.heroDate}>au {formatDisplayDate(simulatedFiscalDate)}</Text>
                    <Text style={st.heroPriceNote}>Avec les cours actuels</Text>
                  </>
                )}
              </View>

              {/* 4. BLOC D'ANCRAGE — Inputs de calcul */}
              <View style={st.anchorCard}>
                <View style={st.anchorRow}>
                  <Text style={st.anchorLabel}>Montant total investi</Text>
                  <Text style={st.anchorValue}>{m(`${formatEuro(totalCostPrice)} \u20AC`)}</Text>
                </View>
                <View style={st.anchorDivider} />
                <View style={st.anchorRow}>
                  <Text style={st.anchorLabel}>Montant total de vente</Text>
                  <Text style={st.anchorValue}>{m(`${formatEuro(totalSalePrice)} \u20AC`)}</Text>
                </View>
                <View style={st.anchorDivider} />
                <View style={st.anchorRow}>
                  <Text style={st.anchorLabel}>
                    {grossGain >= 0 ? 'Plus-value brute estimée' : 'Moins-value brute estimée'}
                  </Text>
                  <Text style={[st.anchorValue, { color: grossGain >= 0 ? C.green : C.red }]}>
                    {m(`${grossGain >= 0 ? '+' : ''}${formatEuro(grossGain)} \u20AC`)}
                  </Text>
                </View>
                <View style={st.anchorDivider} />
                <View style={st.anchorRow}>
                  <Text style={st.anchorLabel}>Fiscalité estimée</Text>
                  <Text style={[st.anchorValue, { color: (bestGlobalRegime === 'plusvalues' ? totalPlusValuesTax : totalForfaitaire) > 0 ? C.red : C.white }]}>
                    {m(`${(bestGlobalRegime === 'plusvalues' ? totalPlusValuesTax : totalForfaitaire) > 0 ? '-' : ''}${formatEuro(bestGlobalRegime === 'plusvalues' ? totalPlusValuesTax : totalForfaitaire)} €`)}
                  </Text>
                </View>
                {isPremium && !masked && bestGlobalRegime === 'plusvalues' && uniqueAbatement !== null && (
                  <>
                    <View style={st.anchorDivider} />
                    <View style={st.anchorRow}>
                      <Text style={st.anchorLabel}>Abattement appliqué</Text>
                      <Text style={st.anchorValue}>{m(`${uniqueAbatement} %`)}</Text>
                    </View>
                  </>
                )}
              </View>

              {/* 5. POURQUOI CE RÉSULTAT ? — aligné sur le régime retenu du hero */}
              <View style={st.explainCard}>
                <Text style={st.explainTitle}>Pourquoi ce résultat ?</Text>
                {masked ? (
                  <Text style={st.explainText}>Détails masqués en mode confidentialité.</Text>
                ) : isEquality ? (
                  <Text style={st.explainText}>
                    Les deux régimes donnent un net équivalent à cette date.{'\n'}
                    Le régime forfaitaire est appliqué par défaut.
                  </Text>
                ) : bestGlobalRegime === 'plusvalues' && totalPlusValuesTax > 0 ? (
                  <>
                    <Text style={st.explainText}>
                      Le régime des plus-values taxe la plus-value estimée après abattement.{'\n'}
                      La durée de détention réduit la fiscalité appliquée à cette date.
                    </Text>
                    {uniqueAbatement === null && (
                      <Text style={st.explainText}>Plusieurs abattements selon les durées de détention.</Text>
                    )}
                  </>
                ) : bestGlobalRegime === 'plusvalues' && totalPlusValuesTax === 0 ? (
                  <Text style={st.explainText}>
                    À cette date, la fiscalité estimée au régime des plus-values est de 0,00 €.{'\n'}
                    La durée de détention permet d{'’'}atteindre ce résultat selon les données renseignées.
                  </Text>
                ) : bestGlobalRegime === 'forfaitaire' ? (
                  <Text style={st.explainText}>
                    Le régime forfaitaire taxe le prix de vente total à un taux unique.{'\n'}
                    À cette date, ce régime donne le net estimé retenu par la simulation.
                  </Text>
                ) : (
                  <Text style={st.explainText}>
                    Cette estimation dépend des données renseignées et du régime fiscal applicable.{'\n'}
                    Complétez les informations d{'’'}achat pour affiner le résultat.
                  </Text>
                )}
              </View>

              {/* 6. COMPARAISON DES 2 RÉGIMES — Premium uniquement */}
              {!isPremium && (
                <PremiumTeaserBlock
                  onCtaPress={handleTeaserCtaPress}
                  firedRef={teaserViewedFiredRef}
                />
              )}
              {isPremium && (
              <View style={st.section}>
                <Text style={st.sectionLabel}>COMPARAISON DES 2 RÉGIMES</Text>
                <View style={st.regimeColumns}>
                  <View style={[st.regimeCol, !isEquality && bestGlobalRegime === 'forfaitaire' && st.regimeColBest]}>
                    <Text style={st.regimeColTitle}>Forfaitaire</Text>
                    <Text style={st.regimeColNet}>{m(`${formatEuro(netForfaitaire)} \u20AC`)}</Text>
                    <Text style={st.regimeColLabel}>Net encaissé</Text>
                    <Text style={st.regimeColTax}>Taxe ({TAX.labels.forfaitaire}) : {m(`${formatEuro(totalForfaitaire)} \u20AC`)}</Text>
                    {!isEquality && bestGlobalRegime === 'forfaitaire' && (
                      <View style={st.leastTaxedBadge}><Text style={st.leastTaxedText}>Le plus avantageux</Text></View>
                    )}
                  </View>
                  <View style={[st.regimeCol, !isEquality && bestGlobalRegime === 'plusvalues' && st.regimeColBest]}>
                    <Text style={st.regimeColTitle}>Plus-values</Text>
                    <Text style={st.regimeColNet}>{m(`${formatEuro(netPlusValues)} \u20AC`)}</Text>
                    <Text style={st.regimeColLabel}>Net encaissé</Text>
                    <Text style={st.regimeColTax}>Taxe ({TAX.labels.plusValue}) : {m(`${formatEuro(totalPlusValuesTax)} \u20AC`)}</Text>
                    {!isEquality && bestGlobalRegime === 'plusvalues' && (
                      <View style={st.leastTaxedBadge}><Text style={st.leastTaxedText}>Le plus avantageux</Text></View>
                    )}
                  </View>
                </View>
              </View>
              )}

              {/* 7. DÉTAIL PAR POSITION — Premium uniquement (contient la comparaison fine par position) */}
              {isPremium && (
              <>
              <TouchableOpacity
                onPress={() => setDetailExpanded(!detailExpanded)}
                activeOpacity={0.7}
                style={st.detailToggle}
              >
                <Text style={st.detailToggleText}>
                  {detailExpanded ? 'Masquer le détail' : 'Voir le détail par position'}
                </Text>
                <Ionicons name={detailExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.gold} />
              </TouchableOpacity>
              {detailExpanded && (
                <View style={st.section}>
                  <Text style={st.sectionLabel}>DÉTAIL PAR POSITION ({computed.length})</Text>
                  <View style={st.card}>
                    {computed.map((r, i) => {
                      const cfg = METAL_CONFIG[r.pos.metal];
                      return (
                        <View key={r.pos.id}>
                          {i > 0 && <View style={st.separator} />}
                          <View style={st.posRow}>
                            <View style={[st.badge, { backgroundColor: cfg.chipBg, borderColor: cfg.chipBorder }]}>
                              <Text style={[st.badgeText, { color: cfg.chipText }]}>{cfg.symbol}</Text>
                            </View>
                            <Text style={st.posProduct} numberOfLines={1}>{stripMetalFromName(r.pos.product)}</Text>
                            <Text style={st.posDuration}>Détention : {r.years} an{r.years > 1 ? 's' : ''}</Text>
                          </View>
                          <View style={{ marginTop: 4 }}>
                            <View style={st.taxLineRow}>
                              <Text
                                style={[
                                  st.taxLabel,
                                  { color: r.bestRegime === 'forfaitaire' ? C.gold : C.subtext, fontWeight: r.bestRegime === 'forfaitaire' ? '700' : '400' },
                                ]}
                              >
                                Taxe forfaitaire : {m(`${formatEuro(r.tax.forfaitaire)} \u20AC`)}
                              </Text>
                              {r.bestRegime === 'forfaitaire' && (
                                <View style={st.miniBadge}><Text style={st.miniBadgeText}>Le moins taxé</Text></View>
                              )}
                            </View>
                            <View style={st.taxLineRow}>
                              <Text
                                style={[
                                  st.taxLabel,
                                  { color: r.bestRegime === 'plusvalues' ? C.gold : C.subtext, fontWeight: r.bestRegime === 'plusvalues' ? '700' : '400', marginTop: 2 },
                                ]}
                              >
                                Taxe plus-values : {m(`${formatEuro(r.tax.plusValuesTax)} \u20AC`)}
                              </Text>
                              {r.bestRegime === 'plusvalues' && (
                                <View style={st.miniBadge}>
                                  <Text style={st.miniBadgeText}>{r.tax.isExempt ? 'Exonéré' : 'Le moins taxé'}</Text>
                                </View>
                              )}
                            </View>
                            {r.bestRegime === null && (
                              <Text style={{ color: C.subtext, fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>Régimes équivalents pour cette position</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
              </>
              )}

              {/* 8. FOOTER CONFIANCE */}
              <Text style={st.reassurance}>Calcul basé sur les règles fiscales françaises en vigueur</Text>

              <View style={st.disclaimerBlock}>
                <Text style={st.disclaimerShort}>Estimation indicative</Text>
                <Text style={st.disclaimerShort}>Ne constitue pas un conseil fiscal</Text>
                <TouchableOpacity onPress={() => setDisclaimerExpanded(!disclaimerExpanded)} activeOpacity={0.7}>
                  <Text style={disclaimerExpanded ? st.disclaimerToggleClose : st.disclaimerToggle}>
                    {disclaimerExpanded ? 'Masquer' : 'Mentions fiscales'}
                  </Text>
                </TouchableOpacity>
                {disclaimerExpanded && (
                  <Text style={st.disclaimerFull}>
                    Cette simulation est fournie à titre purement indicatif et ne constitue pas un conseil fiscal ou juridique. Les règles fiscales applicables aux métaux précieux (art. 150 VI du CGI) peuvent évoluer. Consultez un professionnel du droit fiscal ou la Direction générale des finances publiques (DGFiP) pour votre situation personnelle.
                  </Text>
                )}
              </View>

              {/* 9. RETOUR */}
              <TouchableOpacity
                style={st.exitCta}
                onPress={() => router.back()}
                activeOpacity={0.7}
                accessibilityLabel="Retour au portefeuille"
              >
                <Text style={st.exitCtaText}>{'\u2190'} Retour au portefeuille</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scroll: { padding: 20, paddingBottom: 48 },

  section: { marginBottom: 28 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },

  // Date input
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1A17', borderWidth: 1, borderColor: '#2A2620', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 10, minHeight: 44 },
  dateValue: { flex: 1, fontSize: 16, color: '#F5F0E8' },
  inputHint: { fontSize: 11, color: C.tabIconDefault, marginTop: 5, fontStyle: 'italic' },
  partialNotice: { fontSize: 11, color: C.textDim, textAlign: 'center', marginBottom: 12, fontStyle: 'italic' },

  // Chips raccourcis
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { borderColor: C.gold, backgroundColor: 'rgba(201,168,76,0.12)' },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 12, fontWeight: '600', color: C.subtext },
  chipTextActive: { color: C.gold },
  horizonHint: { fontSize: 10, color: C.subtext, fontStyle: 'italic', marginTop: 6 },

  // iOS picker inline
  iosPickerWrap: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 8, marginTop: 12 },
  iosPickerDone: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  iosPickerDoneText: { color: C.gold, fontSize: 13, fontWeight: '600' },

  // Hero
  heroCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', padding: 20, marginBottom: 16, alignItems: 'center' },
  heroLabel: { fontSize: 11, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  heroValue: { fontSize: 28, fontWeight: '800', color: C.white, marginBottom: 8 },
  heroSub: { fontSize: 12, color: C.textDim, textAlign: 'center', lineHeight: 18 },
  heroDelta: { fontSize: 13, fontWeight: '600', color: C.gold, textAlign: 'center' },
  heroDate: { fontSize: 11, color: C.textDim, textAlign: 'center', marginTop: 2 },
  heroPriceNote: { fontSize: 11, color: '#7A7060', textAlign: 'center', marginTop: 6, fontStyle: 'italic' },

  // Anchor
  anchorCard: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  anchorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  anchorLabel: { fontSize: 12, color: C.textDim },
  anchorValue: { fontSize: 13, fontWeight: '600', color: C.white },
  anchorDivider: { height: 1, backgroundColor: C.divider, marginVertical: 4 },

  // Explain
  explainCard: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  explainTitle: { fontSize: 13, fontWeight: '700', color: C.white, marginBottom: 8 },
  explainText: { fontSize: 12, color: C.textDim, lineHeight: 20 },
  explainAbatement: { fontSize: 12, color: C.gold, fontWeight: '600', marginTop: 8 },

  // Regime comparison
  regimeColumns: { flexDirection: 'row', gap: 12 },
  regimeCol: { flex: 1, backgroundColor: C.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  regimeColBest: { borderColor: 'rgba(76,175,80,0.4)', backgroundColor: 'rgba(76,175,80,0.06)' },
  regimeColTitle: { fontSize: 12, fontWeight: '600', color: C.subtext, marginBottom: 6 },
  regimeColNet: { fontSize: 18, fontWeight: '800', color: '#4CAF50', marginBottom: 2 },
  regimeColLabel: { fontSize: 10, color: C.textDim, marginBottom: 6 },
  regimeColTax: { fontSize: 11, color: C.subtext, opacity: 0.85, marginBottom: 8, textAlign: 'center' },
  leastTaxedBadge: { backgroundColor: '#1F1B0A', borderWidth: 1, borderColor: C.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  leastTaxedText: { fontSize: 10, color: C.gold, fontWeight: '700' },

  // Card
  card: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16 },
  separator: { height: 1, backgroundColor: C.border, marginVertical: 12 },

  // Position detail
  posRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  posProduct: { fontSize: 14, fontWeight: '600', color: C.white, flex: 1 },
  posDuration: { fontSize: 11, color: C.subtext },
  taxLineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taxLabel: { fontSize: 12 },
  miniBadge: { backgroundColor: '#1F1B0A', borderWidth: 1, borderColor: C.gold, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  miniBadgeText: { fontSize: 9, color: C.gold, fontWeight: '700' },

  // Detail toggle
  detailToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 8, marginBottom: 8, borderTopWidth: 1, borderTopColor: C.border },
  detailToggleText: { fontSize: 13, fontWeight: '600', color: C.gold },

  // Empty / Warning
  emptyCard: { backgroundColor: C.card, borderRadius: 12, padding: 32, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  emptyText: { fontSize: 14, color: C.subtext, textAlign: 'center' },
  emptyLink: { fontSize: 13, color: C.gold, fontWeight: '600', marginTop: 12 },
  warningCard: { backgroundColor: '#2A1800', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#8A4A00' },
  warningTitle: { fontSize: 15, fontWeight: '700', color: C.white, marginBottom: 6 },
  warningText: { fontSize: 13, color: C.subtext },
  excludedBanner: { backgroundColor: '#2A1800', borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#8A4A00' },
  excludedText: { fontSize: 12, color: '#E0A060' },
  // Premium teaser (remplace COMPARAISON DES 2 RÉGIMES pour free users)
  premiumTeaser: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', padding: 20, marginBottom: 20, alignItems: 'center', gap: 10 },
  premiumTeaserTitle: { fontSize: 15, fontWeight: '700', color: C.white, textAlign: 'center' },
  premiumTeaserText: { fontSize: 12, color: C.subtext, textAlign: 'center', lineHeight: 18 },
  premiumTeaserCta: { backgroundColor: C.gold, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 4 },
  premiumTeaserCtaText: { color: C.background, fontSize: 13, fontWeight: '700' },

  // Footer
  reassurance: { fontSize: 11, color: C.subtext, textAlign: 'center', marginTop: 16, marginBottom: 8 },
  exitCta: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.gold, paddingVertical: 14, alignItems: 'center', marginTop: 16, marginBottom: 20 },
  exitCtaText: { fontSize: 14, fontWeight: '600', color: C.gold },

  // Disclaimer
  disclaimerBlock: { marginTop: 16 },
  disclaimerShort: { fontSize: 11, color: C.subtext, textAlign: 'center' },
  disclaimerToggle: { fontSize: 12, color: C.gold, textAlign: 'center', marginTop: 6, fontWeight: '600' },
  disclaimerToggleClose: { fontSize: 11, color: C.subtext, textAlign: 'center', marginTop: 6 },
  disclaimerFull: { fontSize: 11, color: C.subtext, marginTop: 8, lineHeight: 16 },
});
