import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { METAL_CONFIG, getSpot, OZ_TO_G } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { OrTrackColors } from '@/constants/theme';
import { formatEuro, stripMetalFromName } from '@/utils/format';
import { parseDate, todayStr, calcYearsHeld, computeTax } from '@/utils/tax-helpers';
import { REGIME_EQUALITY_THRESHOLD } from '@/utils/fiscal';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { usePositions } from '@/hooks/use-positions';
import { Position } from '@/types/position';
import { usePremium } from '@/contexts/premium-context';

const C = OrTrackColors;

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

export default function FiscaliteScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const { prices } = useSpotPrices();
  const { positions } = usePositions();
  const { isPremium, showPaywall } = usePremium();

  const [selectedId, setSelectedId] = useState<string>(positionId ?? '');
  const [salePriceStr, setSalePriceStr] = useState('');
  const [saleDate, setSaleDate] = useState(todayStr());
  const [showDetail, setShowDetail] = useState(false);
  const [showCessionDetails, setShowCessionDetails] = useState(false);
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);
  const [masked, setMasked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('@ortrack_privacy_mode')
        .then(v => setMasked(v === 'true'))
        .catch(() => {});
    }, []),
  );

  const m = (text: string) => (masked ? '\u2022\u2022\u2022\u2022\u2022\u2022' : text);

  const toggleCessionDetails = useCallback(() => {
    Keyboard.dismiss();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowCessionDetails(prev => !prev);
  }, []);

  useEffect(() => {
    if (positionId && positions.some(p => p.id === positionId)) {
      setSelectedId(positionId);
    } else if (positions.length > 0 && !positionId) {
      setSelectedId(positions[0].id);
    }
  }, [positionId, positions]);

  const selectedPos = useMemo(
    () => positions.find(p => p.id === selectedId) ?? null,
    [positions, selectedId],
  );

  useEffect(() => {
    if (!selectedPos) return;
    const mv = spotValue(selectedPos, getSpot(selectedPos.metal, prices));
    if (mv !== null) setSalePriceStr(mv.toFixed(2).replace('.', ','));
  }, [selectedPos, prices]);

  const salePrice = useMemo(() => {
    const num = parseFloat(salePriceStr.replace(',', '.').replace(/\s/g, ''));
    return isNaN(num) || num <= 0 ? null : num;
  }, [salePriceStr]);

  const costPrice = selectedPos ? selectedPos.quantity * selectedPos.purchasePrice : null;
  const purchaseDateParsed = selectedPos ? parseDate(selectedPos.purchaseDate) : null;
  const saleDateParsed = parseDate(saleDate);
  const saleDateValid = saleDateParsed !== null;

  // Guard: purchasePrice invalide
  const dataValid = selectedPos ? Number.isFinite(selectedPos.purchasePrice) && selectedPos.purchasePrice > 0 : false;
  // Guard: spot disponible
  const spotAvailable = selectedPos ? getSpot(selectedPos.metal, prices) !== null : false;
  // Guard: date de cession < date d'achat
  const dateFuture = saleDateParsed && purchaseDateParsed ? saleDateParsed.getTime() < purchaseDateParsed.getTime() : false;

  const years = useMemo(() => {
    if (!purchaseDateParsed || !saleDateParsed || dateFuture) return null;
    return calcYearsHeld(purchaseDateParsed, saleDateParsed);
  }, [purchaseDateParsed, saleDateParsed, dateFuture]);

  const taxResult = useMemo(() => {
    if (salePrice === null || costPrice === null || years === null) return null;
    return computeTax(salePrice, costPrice, years);
  }, [salePrice, costPrice, years]);

  const grossGain = salePrice !== null && costPrice !== null ? salePrice - costPrice : null;

  const taxDelta = taxResult ? Math.abs(taxResult.forfaitaire - taxResult.plusValuesTax) : 0;
  const isEquality = taxDelta < REGIME_EQUALITY_THRESHOLD;
  const bestRegime: 'forfaitaire' | 'plusvalues' | null = useMemo(() => {
    if (!taxResult) return null;
    if (isEquality) return null;
    if (taxResult.isExempt) return 'plusvalues';
    return taxResult.plusValuesTax < taxResult.forfaitaire ? 'plusvalues' : 'forfaitaire';
  }, [taxResult, isEquality]);

  const netForfaitaire = salePrice !== null && taxResult ? salePrice - taxResult.forfaitaire : null;
  const netPlusValues = salePrice !== null && taxResult ? salePrice - taxResult.plusValuesTax : null;
  const heroNet = bestRegime === 'plusvalues' ? netPlusValues : netForfaitaire;
  const bestRegimeName = bestRegime === 'plusvalues' ? 'plus-values' : 'forfaitaire';
  const abatementPct = taxResult ? Math.round(taxResult.abatement * 100) : null;

  // Can we show results?
  const canShow = taxResult !== null && salePrice !== null && costPrice !== null && saleDateValid && dataValid && !dateFuture;

  // Error message
  const errorMessage = !selectedPos
    ? null
    : !dataValid
    ? 'Données de la position incomplètes.'
    : !spotAvailable
    ? 'Cours indisponible — réessayez ultérieurement.'
    : !saleDateValid
    ? null // handled inline under date field
    : dateFuture
    ? 'La date de cession est antérieure à la date d\u2019achat.'
    : null;

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (!isPremium) {
    return (
      <SafeAreaView style={st.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Simulation fiscale' }} />
        <View style={st.lockedCard}>
          <Text style={st.lockedTitle}>Fiscalité Premium</Text>
          <Text style={st.lockedText}>Les simulations fiscales avancées sont réservées aux comptes Premium.</Text>
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
          title: 'Simulation fiscale',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 12 }}>
              <Text style={{ color: C.gold, fontSize: 16 }}>{'\u2190'} Retour</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {/* ── 1. SÉLECTEUR DE POSITION ── */}
          {positions.length > 1 && (
            <View style={st.section}>
              <Text style={st.sectionLabel}>Position à simuler</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.chipScroll}>
                {positions.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[st.posChip, p.id === selectedId && st.posChipSelected]}
                    onPress={() => setSelectedId(p.id)}
                  >
                    <Text style={[st.posChipText, p.id === selectedId && st.posChipTextSelected]} numberOfLines={1}>
                      {stripMetalFromName(p.product)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── 2. CONTEXTE POSITION ── */}
          {selectedPos && (
            <View style={[st.card, st.posInfoCard]}>
              <View style={st.posInfoRow}>
                {(() => {
                  const cfg = METAL_CONFIG[selectedPos.metal];
                  return (
                    <View style={[st.metalBadge, { backgroundColor: cfg.chipBg, borderColor: cfg.chipBorder }]}>
                      <Text style={[st.metalBadgeText, { color: cfg.chipText }]}>{cfg.symbol}</Text>
                    </View>
                  );
                })()}
                <Text style={st.posInfoProduct} numberOfLines={1}>{selectedPos.product}</Text>
                <Text style={st.posInfoSub}>
                  {selectedPos.quantity} pièce{selectedPos.quantity > 1 ? 's' : ''}
                  {years !== null ? ` \u00B7 Détention : ${years} an${years > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* ── Error messages ── */}
          {errorMessage && (
            <View style={st.warningCard}>
              <Text style={st.warningText}>{errorMessage}</Text>
            </View>
          )}

          {/* ── 3. HERO — Montant récupérable estimé ── */}
          {canShow && heroNet !== null && (
            <View style={st.heroCard}>
              <Text style={st.heroLabel}>MONTANT RÉCUPÉRABLE ESTIMÉ</Text>
              <Text style={st.heroValue}>{m(`${formatEuro(heroNet)} \u20AC`)}</Text>
              {masked ? (
                <Text style={st.heroSub}>Résultat masqué en mode confidentialité</Text>
              ) : isEquality ? (
                <Text style={st.heroSub}>Les deux régimes donnent un net équivalent à cette date.</Text>
              ) : (
                <>
                  <Text style={st.heroDelta}>+{formatEuro(taxDelta)} {'\u20AC'} avec le {bestRegimeName}</Text>
                  <Text style={st.heroDate}>au {saleDate}</Text>
                </>
              )}
            </View>
          )}

          {/* ── 4. BLOC D'ANCRAGE ── */}
          {canShow && salePrice !== null && costPrice !== null && grossGain !== null && (
            <View style={st.anchorCard}>
              <View style={st.anchorRow}>
                <Text style={st.anchorLabel}>Prix de cession</Text>
                <Text style={st.anchorValue}>{m(`${formatEuro(salePrice)} \u20AC`)}</Text>
              </View>
              <View style={st.anchorDivider} />
              <View style={st.anchorRow}>
                <Text style={st.anchorLabel}>Prix d{'\u2019'}achat</Text>
                <Text style={st.anchorValue}>{m(`${formatEuro(costPrice)} \u20AC`)}</Text>
              </View>
              <View style={st.anchorDivider} />
              <View style={st.anchorRow}>
                <Text style={st.anchorLabel}>{grossGain >= 0 ? 'Plus-value brute' : 'Moins-value brute'}</Text>
                <Text style={[st.anchorValue, { color: grossGain >= 0 ? '#4CAF50' : C.red }]}>
                  {m(`${grossGain >= 0 ? '+' : ''}${formatEuro(grossGain)} \u20AC`)}
                </Text>
              </View>
            </View>
          )}

          {/* ── 5. MODIFIER LA DATE ET LE PRIX ── */}
          {selectedPos && (
            <View style={st.section}>
              <TouchableOpacity style={st.cessionToggle} onPress={toggleCessionDetails} activeOpacity={0.7}>
                <View style={st.cessionToggleLeft}>
                  <Text style={st.cessionToggleText}>Modifier la date et le prix</Text>
                  <Ionicons name={showCessionDetails ? 'chevron-down' : 'chevron-forward'} size={14} color={C.gold} />
                </View>
                {!showCessionDetails && (
                  <Text style={st.cessionSummary}>
                    {masked ? '\u2022\u2022\u2022\u2022\u2022\u2022' : `${salePrice !== null ? `${formatEuro(salePrice)} \u20AC` : salePriceStr} \u00B7 ${saleDate}`}
                  </Text>
                )}
              </TouchableOpacity>

              {showCessionDetails && (
                <>
                  <View style={st.inputGroup}>
                    <Text style={st.inputLabel}>Prix de cession ({'\u20AC'})</Text>
                    <TextInput
                      style={st.input}
                      value={salePriceStr}
                      onChangeText={setSalePriceStr}
                      keyboardType="decimal-pad"
                      placeholder="Ex : 1 250,00"
                      placeholderTextColor={C.subtext}
                      selectionColor={C.gold}
                    />
                    {selectedPos && (
                      <Text style={st.inputHint}>
                        Valeur marché estimée :{' '}
                        {(() => {
                          const mv = spotValue(selectedPos, getSpot(selectedPos.metal, prices));
                          return mv !== null ? `${formatEuro(mv)} \u20AC` : 'cours indisponible';
                        })()}
                      </Text>
                    )}
                  </View>
                  <View style={st.inputGroup}>
                    <Text style={st.inputLabel}>Date de cession</Text>
                    <View style={st.dateRow}>
                      <TextInput
                        style={st.dateInput}
                        value={saleDate}
                        onChangeText={v => setSaleDate(autoFormatDate(v))}
                        keyboardType="number-pad"
                        placeholder="JJ/MM/AAAA"
                        placeholderTextColor={C.subtext}
                        selectionColor={C.gold}
                        maxLength={10}
                      />
                      <Ionicons name="calendar-outline" size={18} color={C.gold} />
                    </View>
                    {!saleDateValid && saleDate.length >= 10 && (
                      <Text style={st.dateError}>Date de cession invalide</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── 6. POURQUOI CE RÉSULTAT ? ── */}
          {canShow && (
            <View style={st.explainCard}>
              <Text style={st.explainTitle}>Pourquoi ce résultat ?</Text>
              <Text style={st.explainText}>
                Le forfaitaire taxe le prix de vente total.{'\n'}
                Le régime plus-values taxe la plus-value après abattement.{'\n'}
                La date de cession influence l{'\u2019'}abattement appliqué.
              </Text>
              {abatementPct !== null && (
                <Text style={st.explainAbatement}>Abattement pris en compte : {abatementPct} %</Text>
              )}
            </View>
          )}

          {/* ── 7. COMPARAISON DES 2 RÉGIMES ── */}
          {canShow && netForfaitaire !== null && netPlusValues !== null && taxResult && (
            <View style={st.section}>
              <Text style={st.sectionLabel}>COMPARAISON DES 2 RÉGIMES</Text>
              <View style={st.regimeColumns}>
                <View style={[st.regimeCol, !isEquality && bestRegime === 'forfaitaire' && st.regimeColBest]}>
                  <Text style={st.regimeColTitle}>Forfaitaire</Text>
                  <Text style={st.regimeColNet}>{m(`${formatEuro(netForfaitaire)} \u20AC`)}</Text>
                  <Text style={st.regimeColLabel}>Net encaissé</Text>
                  <Text style={st.regimeColTax}>Taxe ({TAX.labels.forfaitaire}) : {m(`${formatEuro(taxResult.forfaitaire)} \u20AC`)}</Text>
                  {!isEquality && bestRegime === 'forfaitaire' && (
                    <View style={st.leastTaxedBadge}><Text style={st.leastTaxedText}>Le plus avantageux</Text></View>
                  )}
                </View>
                <View style={[st.regimeCol, !isEquality && bestRegime === 'plusvalues' && st.regimeColBest]}>
                  <Text style={st.regimeColTitle}>Plus-values</Text>
                  <Text style={st.regimeColNet}>{m(`${formatEuro(netPlusValues)} \u20AC`)}</Text>
                  <Text style={st.regimeColLabel}>Net encaissé</Text>
                  <Text style={st.regimeColTax}>Taxe ({TAX.labels.plusValue}) : {m(`${formatEuro(taxResult.plusValuesTax)} \u20AC`)}</Text>
                  {!isEquality && bestRegime === 'plusvalues' && (
                    <View style={st.leastTaxedBadge}>
                      <Text style={st.leastTaxedText}>{taxResult.isExempt ? 'Exonéré' : 'Le plus avantageux'}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* ── 8. DÉTAIL DU CALCUL ── */}
          {canShow && taxResult && salePrice !== null && costPrice !== null && (
            <>
              <TouchableOpacity style={st.detailToggle} onPress={() => setShowDetail(v => !v)}>
                <Text style={st.detailToggleText}>
                  {showDetail ? 'Masquer le détail \u25B2' : 'Voir le détail du calcul \u25BC'}
                </Text>
              </TouchableOpacity>

              {showDetail && (
                <View style={[st.card, st.detailCard]}>
                  <Text style={st.detailTitle}>Détail du calcul</Text>

                  <View style={st.detailRow}>
                    <Text style={st.detailKey}>Prix de cession</Text>
                    <Text style={st.detailVal}>{m(`${formatEuro(salePrice)} \u20AC`)}</Text>
                  </View>
                  <View style={st.detailRow}>
                    <Text style={st.detailKey}>Prix d{'\u2019'}achat</Text>
                    <Text style={st.detailVal}>{m(`${formatEuro(costPrice)} \u20AC`)}</Text>
                  </View>
                  <View style={st.detailRow}>
                    <Text style={st.detailKey}>{taxResult.plusValue >= 0 ? 'Plus-value brute' : 'Moins-value brute'}</Text>
                    <Text style={[st.detailVal, taxResult.plusValue >= 0 ? st.positive : st.negative]}>
                      {m(`${taxResult.plusValue >= 0 ? '+' : ''}${formatEuro(taxResult.plusValue)} \u20AC`)}
                    </Text>
                  </View>

                  <View style={st.detailDivider} />
                  <Text style={st.detailSubtitle}>Régime forfaitaire</Text>
                  <View style={st.detailRow}>
                    <Text style={st.detailKey}>Base taxable</Text>
                    <Text style={st.detailVal}>Prix de cession</Text>
                  </View>
                  <View style={st.detailRow}>
                    <Text style={st.detailKey}>Taux</Text>
                    <Text style={st.detailVal}>{TAX.labels.forfaitaire}</Text>
                  </View>
                  <View style={st.detailRow}>
                    <Text style={[st.detailKey, st.detailKeyBold]}>Taxe</Text>
                    <Text style={[st.detailVal, st.detailValBold]}>{m(`${formatEuro(taxResult.forfaitaire)} \u20AC`)}</Text>
                  </View>

                  <View style={st.detailDivider} />
                  <Text style={st.detailSubtitle}>Régime plus-values</Text>
                  <View style={st.detailRow}>
                    <Text style={st.detailKey}>Durée de détention</Text>
                    <Text style={st.detailVal}>{taxResult.years} an{taxResult.years > 1 ? 's' : ''}</Text>
                  </View>
                  <View style={st.detailRow}>
                    <Text style={st.detailKey}>Abattement applicable</Text>
                    <Text style={st.detailVal}>{Math.round(taxResult.abatement * 100)} %</Text>
                  </View>
                  {!taxResult.isExempt && taxResult.plusValue > 0 && (
                    <>
                      <View style={st.detailRow}>
                        <Text style={st.detailKey}>Plus-value imposable</Text>
                        <Text style={st.detailVal}>{m(`${formatEuro(taxResult.taxablePV)} \u20AC`)}</Text>
                      </View>
                      <View style={st.detailRow}>
                        <Text style={st.detailKey}>Taux total d{'\u2019'}imposition</Text>
                        <Text style={st.detailVal}>{TAX.labels.plusValue}</Text>
                      </View>
                    </>
                  )}
                  <View style={st.detailRow}>
                    <Text style={[st.detailKey, st.detailKeyBold]}>Taxe</Text>
                    <Text style={[st.detailVal, st.detailValBold]}>{m(`${formatEuro(taxResult.plusValuesTax)} \u20AC`)}</Text>
                  </View>
                </View>
              )}
            </>
          )}

          {/* Waiting state */}
          {selectedPos && !canShow && !errorMessage && (
            <View style={st.waitingCard}>
              <Text style={st.waitingText}>Renseignez le prix et la date de cession pour lancer la simulation.</Text>
            </View>
          )}

          {/* ── 9. FOOTER CONFIANCE ── */}
          <Text style={st.reassurance}>Calcul basé sur les règles fiscales françaises en vigueur</Text>

          <View style={st.disclaimerBlock}>
            <Text style={st.disclaimerShort}>Estimation indicative — ne constitue pas un conseil fiscal.</Text>
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

          <TouchableOpacity style={st.exitCta} onPress={() => router.back()} activeOpacity={0.7} accessibilityLabel="Retour au portefeuille">
            <Text style={st.exitCtaText}>{'\u2190'} Retour au portefeuille</Text>
          </TouchableOpacity>
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

  // Position chips
  chipScroll: { marginHorizontal: -4 },
  posChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, marginHorizontal: 4 },
  posChipSelected: { borderColor: C.gold, backgroundColor: '#1F1B0A' },
  posChipText: { fontSize: 13, color: C.subtext, fontWeight: '500' },
  posChipTextSelected: { color: C.gold, fontWeight: '700' },

  // Card
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  posInfoCard: { marginBottom: 16 },
  posInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  posInfoProduct: { fontSize: 15, fontWeight: '700', color: C.white },
  posInfoSub: { fontSize: 13, color: C.subtext },
  metalBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  metalBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

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

  // Cession toggle
  cessionToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, backgroundColor: C.card },
  cessionToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cessionToggleText: { fontSize: 13, fontWeight: '600', color: C.gold },
  cessionSummary: { fontSize: 12, color: C.subtext },

  // Inputs
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 12, color: C.subtext, marginBottom: 6, fontWeight: '500', letterSpacing: 0.3 },
  input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.white },
  inputHint: { fontSize: 11, color: C.tabIconDefault, marginTop: 5, fontStyle: 'italic' },
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  dateInput: { flex: 1, fontSize: 16, color: C.white, padding: 0 },
  dateError: { fontSize: 12, color: C.red, marginTop: 5, fontWeight: '600' },

  // Explain
  explainCard: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  explainTitle: { fontSize: 13, fontWeight: '700', color: C.white, marginBottom: 8 },
  explainText: { fontSize: 12, color: C.textDim, lineHeight: 20 },
  explainAbatement: { fontSize: 12, color: C.gold, fontWeight: '600', marginTop: 8 },

  // Regime comparison (side by side)
  regimeColumns: { flexDirection: 'row', gap: 12 },
  regimeCol: { flex: 1, backgroundColor: C.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  regimeColBest: { borderColor: 'rgba(76,175,80,0.4)', backgroundColor: 'rgba(76,175,80,0.06)' },
  regimeColTitle: { fontSize: 12, fontWeight: '600', color: C.subtext, marginBottom: 6 },
  regimeColNet: { fontSize: 18, fontWeight: '800', color: '#4CAF50', marginBottom: 2 },
  regimeColLabel: { fontSize: 10, color: C.textDim, marginBottom: 6 },
  regimeColTax: { fontSize: 11, color: C.subtext, opacity: 0.85, marginBottom: 8, textAlign: 'center' },
  leastTaxedBadge: { backgroundColor: '#1F1B0A', borderWidth: 1, borderColor: C.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  leastTaxedText: { fontSize: 10, color: C.gold, fontWeight: '700' },

  // Detail
  detailToggle: { alignItems: 'center', paddingVertical: 12 },
  detailToggleText: { fontSize: 13, color: C.gold, fontWeight: '600' },
  detailCard: { marginTop: 0, padding: 16 },
  detailTitle: { fontSize: 12, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  detailSubtitle: { fontSize: 12, fontWeight: '700', color: C.subtext, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  detailKey: { fontSize: 13, color: C.subtext },
  detailKeyBold: { color: C.white, fontWeight: '600' },
  detailVal: { fontSize: 13, color: C.white, fontWeight: '500' },
  detailValBold: { fontWeight: '700' },
  detailDivider: { height: 1, backgroundColor: C.border, marginVertical: 12 },

  // Warning / Waiting
  warningCard: { backgroundColor: '#2A1800', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#8A4A00', marginBottom: 16 },
  warningText: { fontSize: 13, color: C.subtext, textAlign: 'center' },
  waitingCard: { backgroundColor: C.card, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: C.border, alignItems: 'center', marginBottom: 24 },
  waitingText: { fontSize: 14, color: C.subtext, textAlign: 'center', lineHeight: 22 },
  lockedCard: { margin: 20, backgroundColor: C.card, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: C.border, gap: 12 },
  lockedTitle: { fontSize: 18, fontWeight: '700', color: C.white, textAlign: 'center' },
  lockedText: { fontSize: 13, color: C.subtext, textAlign: 'center', lineHeight: 20 },
  lockedButton: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  lockedButtonText: { color: C.background, fontSize: 14, fontWeight: '700' },

  // Footer
  reassurance: { fontSize: 11, color: C.subtext, textAlign: 'center', marginTop: 16, marginBottom: 8 },
  exitCta: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.gold, paddingVertical: 14, alignItems: 'center', marginTop: 16, marginBottom: 20 },
  exitCtaText: { fontSize: 14, fontWeight: '600', color: C.gold },
  disclaimerBlock: { marginTop: 16 },
  disclaimerShort: { fontSize: 11, color: C.subtext, textAlign: 'center' },
  disclaimerToggle: { fontSize: 12, color: C.gold, textAlign: 'center', marginTop: 6, fontWeight: '600' },
  disclaimerToggleClose: { fontSize: 11, color: C.subtext, textAlign: 'center', marginTop: 6 },
  disclaimerFull: { fontSize: 11, color: C.subtext, marginTop: 8, lineHeight: 16 },

  positive: { color: '#4CAF50' },
  negative: { color: '#E07070' },
});
