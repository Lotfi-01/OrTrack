import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Ionicons from '@expo/vector-icons/Ionicons';
import { METAL_CONFIG, getSpot, OZ_TO_G } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { OrTrackColors } from '@/constants/theme';
import { formatEuro, stripMetalFromName } from '@/utils/format';
import { TaxResult, parseDate, todayStr, calcYearsHeld, computeTax } from '@/utils/tax-helpers';
import { REGIME_EQUALITY_THRESHOLD } from '@/utils/fiscal';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { Position } from '@/types/position';
import { usePositions } from '@/hooks/use-positions';
import { usePremium } from '@/contexts/premium-context';

const C = OrTrackColors;

// ─── Types ──────────────────────────────────────────────────────────────────

type PositionResult = {
  pos: Position;
  salePrice: number;
  costPrice: number;
  years: number;
  tax: TaxResult;
  bestRegime: 'forfaitaire' | 'plusvalues' | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function autoFormatDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function spotValue(pos: Position, spot: number | null): number | null {
  if (spot === null) return null;
  return pos.quantity * (pos.weightG / OZ_TO_G) * spot;
}

// ─── Écran ──────────────────────────────────────────────────────────────────

export default function FiscaliteGlobaleScreen() {
  const { prices } = useSpotPrices();
  const { positions, reloadPositions } = usePositions();
  const { isPremium, showPaywall } = usePremium();
  const [saleDate, setSaleDate] = useState(todayStr());
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

  const m = (text: string) => (masked ? '\u2022\u2022\u2022\u2022\u2022\u2022' : text);

  // ── Calculs ─────────────────────────────────────────────────────────────

  const saleDateParsed = useMemo(() => parseDate(saleDate), [saleDate]);
  const saleDateValid = saleDateParsed !== null;

  const { computed, excluded, exclusionReason } = useMemo(() => {
    if (!saleDateValid) return { computed: [] as PositionResult[], excluded: [] as Position[], exclusionReason: null as string | null };

    const comp: PositionResult[] = [];
    const excl: Position[] = [];
    let spotMissing = 0;
    let dateMissing = 0;
    let dateFuture = 0;
    let dataInvalid = 0;

    for (const pos of positions) {
      // Garde-fou NaN / Infinity / négatif sur purchasePrice
      if (!Number.isFinite(pos.purchasePrice) || pos.purchasePrice <= 0) {
        excl.push(pos);
        dataInvalid++;
        continue;
      }

      const spot = getSpot(pos.metal, prices);
      const sv = spotValue(pos, spot);
      if (sv === null) { excl.push(pos); spotMissing++; continue; }

      const purchaseDateParsed = parseDate(pos.purchaseDate);
      if (purchaseDateParsed === null) { excl.push(pos); dateMissing++; continue; }

      if (saleDateParsed!.getTime() < purchaseDateParsed.getTime()) {
        excl.push(pos);
        dateFuture++;
        continue;
      }

      const salePrice = sv;
      const costPrice = pos.quantity * pos.purchasePrice;
      const years = calcYearsHeld(purchaseDateParsed, saleDateParsed!);
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
        reason = `${n} position${plural ? 's' : ''} exclue${plural ? 's' : ''} \u2014 date de cession antérieure à la date d\u2019achat`;
      } else if (spotMissing > 0 && dateFuture === 0 && dateMissing === 0 && dataInvalid === 0) {
        reason = `Cours indisponibles pour ${n} position${plural ? 's' : ''}`;
      } else if (dateMissing > 0 && spotMissing === 0 && dateFuture === 0 && dataInvalid === 0) {
        reason = `${n} position${plural ? 's' : ''} avec date d\u2019achat invalide`;
      } else if (dataInvalid > 0 && spotMissing === 0 && dateFuture === 0 && dateMissing === 0) {
        reason = `${n} position${plural ? 's' : ''} exclue${plural ? 's' : ''} \u2014 données incomplètes`;
      } else {
        reason = `${n} position${plural ? 's' : ''} exclue${plural ? 's' : ''} de la simulation`;
      }
    }

    return { computed: comp, excluded: excl, exclusionReason: reason };
  }, [positions, prices, saleDateValid, saleDateParsed]);

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

  // Abattement global unique (pour le bloc explicatif)
  const uniqueAbatement = useMemo(() => {
    if (computed.length === 0) return null;
    const first = computed[0].tax.abatement;
    const allSame = computed.every(r => r.tax.abatement === first);
    return allSame ? Math.round(first * 100) : null;
  }, [computed]);

  // ── Rendu ───────────────────────────────────────────────────────────────

  if (!isPremium) {
    return (
      <SafeAreaView style={st.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Simulation globale' }} />
        <View style={st.lockedCard}>
          <Text style={st.lockedTitle}>Fiscalité Premium</Text>
          <Text style={st.lockedText}>Les simulations fiscales globales sont réservées aux comptes Premium.</Text>
          <TouchableOpacity style={st.lockedButton} onPress={showPaywall} activeOpacity={0.8}>
            <Text style={st.lockedButtonText}>Débloquer la fiscalité</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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

          {/* ── DATE DE CESSION (toujours visible si positions existent) ── */}
          {positions.length > 0 && (
            <View style={st.section}>
              <Text style={st.sectionLabel}>DATE DE CESSION</Text>
              <TouchableOpacity style={st.dateRow} activeOpacity={0.8}>
                <TextInput
                  style={st.dateInput}
                  value={saleDate}
                  onChangeText={v => setSaleDate(autoFormatDate(v))}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder="JJ/MM/AAAA"
                  placeholderTextColor={C.subtext}
                  selectionColor={C.gold}
                />
                <Ionicons name="calendar-outline" size={18} color={C.gold} />
              </TouchableOpacity>
              {!saleDateValid ? (
                <Text style={st.dateError}>Date de cession invalide</Text>
              ) : (
                <Text style={st.inputHint}>
                  La date de cession détermine l{'\u2019'}abattement du régime plus-values (5 % par an dès la 3e année).
                </Text>
              )}
            </View>
          )}

          {/* ── CAS 2 : Date invalide → bloquer le reste ── */}
          {positions.length > 0 && !saleDateValid && (
            <View style={st.warningCard}>
              <Text style={st.warningTitle}>Date invalide</Text>
              <Text style={st.warningText}>Saisissez une date de cession valide pour lancer la simulation.</Text>
            </View>
          )}

          {/* ── CAS 3 : Toutes positions exclues ── */}
          {positions.length > 0 && saleDateValid && computed.length === 0 && excluded.length > 0 && (
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
                  Simulation sur {computed.length} position{computed.length > 1 ? 's' : ''} sur {positions.length}. {excluded.length} position{excluded.length > 1 ? 's' : ''} exclue{excluded.length > 1 ? 's' : ''}.
                </Text>
              )}

              {/* 3. HERO — Montant récupérable estimé */}
              <View style={st.heroCard}>
                <Text style={st.heroLabel}>MONTANT RÉCUPÉRABLE ESTIMÉ</Text>
                <Text style={st.heroValue}>{m(`${formatEuro(heroNet)} \u20AC`)}</Text>
                {masked ? (
                  <Text style={st.heroSub}>Résultat masqué en mode confidentialité</Text>
                ) : isEquality ? (
                  <Text style={st.heroSub}>Les deux régimes donnent un net équivalent à cette date.</Text>
                ) : (
                  <>
                    <Text style={st.heroDelta}>+{formatEuro(delta)} {'\u20AC'} avec le {bestRegimeName}</Text>
                    <Text style={st.heroDate}>au {saleDate}</Text>
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
              </View>

              {/* 5. POURQUOI CE RÉSULTAT ? */}
              <View style={st.explainCard}>
                <Text style={st.explainTitle}>Pourquoi ce résultat ?</Text>
                <Text style={st.explainText}>
                  Le forfaitaire taxe le prix de vente total.{'\n'}
                  Le régime plus-values taxe la plus-value après abattement.{'\n'}
                  La date de cession influence l{'\u2019'}abattement appliqué.
                </Text>
                {uniqueAbatement !== null && (
                  <Text style={st.explainAbatement}>Abattement pris en compte : {uniqueAbatement} %</Text>
                )}
              </View>

              {/* 6. COMPARAISON DES 2 RÉGIMES */}
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

              {/* 7. DÉTAIL PAR POSITION */}
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

              {/* 8. FOOTER CONFIANCE */}
              <Text style={st.reassurance}>Calcul basé sur les règles fiscales françaises en vigueur</Text>

              <View style={st.disclaimerBlock}>
                <Text style={st.disclaimerShort}>
                  Estimation indicative — ne constitue pas un conseil fiscal.
                </Text>
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
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  dateInput: { flex: 1, fontSize: 16, color: C.white, padding: 0 },
  inputHint: { fontSize: 11, color: C.tabIconDefault, marginTop: 5, fontStyle: 'italic' },
  dateError: { fontSize: 12, color: C.red, marginTop: 5, fontWeight: '600' },
  partialNotice: { fontSize: 11, color: C.textDim, textAlign: 'center', marginBottom: 12, fontStyle: 'italic' },

  // Hero
  heroCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', padding: 20, marginBottom: 16, alignItems: 'center' },
  heroLabel: { fontSize: 11, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  heroValue: { fontSize: 28, fontWeight: '800', color: C.white, marginBottom: 8 },
  heroSub: { fontSize: 12, color: C.textDim, textAlign: 'center', lineHeight: 18 },
  heroDelta: { fontSize: 13, fontWeight: '600', color: C.gold, textAlign: 'center' },
  heroDate: { fontSize: 11, color: C.textDim, textAlign: 'center', marginTop: 2 },

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
  lockedCard: { margin: 20, backgroundColor: C.card, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: C.border, gap: 12 },
  lockedTitle: { fontSize: 18, fontWeight: '700', color: C.white, textAlign: 'center' },
  lockedText: { fontSize: 13, color: C.subtext, textAlign: 'center', lineHeight: 20 },
  lockedButton: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  lockedButtonText: { color: C.background, fontSize: 14, fontWeight: '700' },

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
