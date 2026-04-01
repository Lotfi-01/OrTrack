import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { type MetalType, METAL_CONFIG, getSpot } from '@/constants/metals';
import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { Position } from '@/types/position';
import { STORAGE_KEYS } from '@/constants/storage-keys';
const OZ_TO_G = 31.10435;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDate(str: string): Date | null {
  if (!str || str.length < 10) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y || y < 1900 || y > 2100) return null;
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

function todayStr(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${now.getFullYear()}`;
}

function autoFormatDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function calcYearsHeld(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000)));
}

function spotValue(pos: Position, spot: number | null): number | null {
  if (spot === null) return null;
  return pos.quantity * (pos.weightG / OZ_TO_G) * spot;
}

// ─── Calcul fiscal ────────────────────────────────────────────────────────────

interface TaxResult {
  forfaitaire: number;
  plusValuesTax: number;
  plusValue: number;
  abattement: number; // 0 → 1
  years: number;
  isExempt: boolean;
  taxablePV: number;
}

function computeTax(salePrice: number, costPrice: number, years: number): TaxResult {
  // Régime 1 — Taxe forfaitaire : 11,5 % sur le prix de cession
  const forfaitaire = salePrice * 0.115;

  // Régime 2 — Plus-values avec abattement
  const plusValue = salePrice - costPrice;
  let abattement = 0;
  let isExempt = false;

  if (years >= 22) {
    abattement = 1;
    isExempt = true;
  } else if (years >= 3) {
    abattement = Math.min(1, (years - 2) * 0.05); // 5 % par an à partir de la 3e année
  }

  const taxablePV = Math.max(0, plusValue) * (1 - abattement);
  const plusValuesTax = isExempt || plusValue <= 0 ? 0 : taxablePV * 0.362; // 36,2 % = 19 % CGP + 17,2 % CS

  return { forfaitaire, plusValuesTax, plusValue, abattement, years, isExempt, taxablePV };
}

// ─── Écran ────────────────────────────────────────────────────────────────────

export default function FiscaliteScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const { prices } = useSpotPrices();

  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedId, setSelectedId] = useState<string>(positionId ?? '');
  const [salePriceStr, setSalePriceStr] = useState('');
  const [saleDate, setSaleDate] = useState(todayStr());
  const [showDetail, setShowDetail] = useState(false);
  const [showCessionDetails, setShowCessionDetails] = useState(false);
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);

  const toggleCessionDetails = useCallback(() => {
    Keyboard.dismiss();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowCessionDetails(prev => !prev);
  }, []);

  // Charger les positions depuis AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.positions).then((raw) => {
      const loaded: Position[] = raw ? JSON.parse(raw) : [];
      setPositions(loaded);
      if (positionId && loaded.some((p) => p.id === positionId)) {
        setSelectedId(positionId);
      } else if (loaded.length > 0 && !positionId) {
        setSelectedId(loaded[0].id);
      }
    });
  }, [positionId]);

  const selectedPos = useMemo(
    () => positions.find((p) => p.id === selectedId) ?? null,
    [positions, selectedId]
  );

  // Pré-remplir le prix de cession avec la valeur de marché
  useEffect(() => {
    if (!selectedPos) return;
    const mv = spotValue(selectedPos, getSpot(selectedPos.metal, prices));
    if (mv !== null) {
      setSalePriceStr(mv.toFixed(2).replace('.', ','));
    }
  }, [selectedPos, prices]);

  // Parser le prix de cession
  const salePrice = useMemo(() => {
    const num = parseFloat(salePriceStr.replace(',', '.').replace(/\s/g, ''));
    return isNaN(num) || num <= 0 ? null : num;
  }, [salePriceStr]);

  const costPrice = selectedPos ? selectedPos.quantity * selectedPos.purchasePrice : null;
  const purchaseDateParsed = selectedPos ? parseDate(selectedPos.purchaseDate) : null;
  const saleDateParsed = parseDate(saleDate);

  const years = useMemo(() => {
    if (!purchaseDateParsed || !saleDateParsed) return null;
    return calcYearsHeld(purchaseDateParsed, saleDateParsed);
  }, [purchaseDateParsed, saleDateParsed]);

  const taxResult = useMemo(() => {
    if (salePrice === null || costPrice === null || years === null) return null;
    return computeTax(salePrice, costPrice, years);
  }, [salePrice, costPrice, years]);

  const bestRegime: 'forfaitaire' | 'plusvalues' | null = useMemo(() => {
    if (!taxResult) return null;
    if (taxResult.isExempt) return 'plusvalues';
    return taxResult.plusValuesTax <= taxResult.forfaitaire ? 'plusvalues' : 'forfaitaire';
  }, [taxResult]);

  const savings = useMemo(() => {
    if (!taxResult) return null;
    return Math.abs(taxResult.forfaitaire - taxResult.plusValuesTax);
  }, [taxResult]);

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'Simulation fiscale',
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 12 }}>
            <Text style={{ color: OrTrackColors.gold, fontSize: 16 }}>← Retour</Text>
          </TouchableOpacity>
        ),
      }} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Sélecteur de position (si plusieurs) ── */}
          {positions.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Position à simuler</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {positions.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.posChip, p.id === selectedId && styles.posChipSelected]}
                    onPress={() => setSelectedId(p.id)}>
                    <Text style={[styles.posChipText, p.id === selectedId && styles.posChipTextSelected]} numberOfLines={1}>
                      {p.product}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── Info de la position sélectionnée (compacte) ── */}
          {selectedPos && (
            <View style={[styles.card, styles.posInfoCard]}>
              <View style={styles.posInfoRow}>
                {(() => { const cfg = METAL_CONFIG[selectedPos.metal]; return (
                <View style={[styles.metalBadge, { backgroundColor: cfg.chipBg, borderColor: cfg.chipBorder }]}>
                  <Text style={[styles.metalBadgeText, { color: cfg.chipText }]}>
                    {cfg.symbol}
                  </Text>
                </View>
              ); })()}
                <Text style={styles.posInfoProduct} numberOfLines={1}>{selectedPos.product}</Text>
                <Text style={styles.posInfoSub}>
                  {selectedPos.quantity} pièce{selectedPos.quantity > 1 ? 's' : ''}
                  {years !== null ? ` · ${years} an${years > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* ── Détails de la cession (repliable) ── */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.cessionToggle}
              onPress={toggleCessionDetails}
              activeOpacity={0.7}
            >
              <View style={styles.cessionToggleLeft}>
                <Text style={styles.cessionToggleText}>
                  {showCessionDetails ? 'Masquer les paramètres' : 'Modifier les paramètres'}
                </Text>
                <Ionicons
                  name={showCessionDetails ? 'chevron-down' : 'chevron-forward'}
                  size={14}
                  color={OrTrackColors.gold}
                />
              </View>
              {!showCessionDetails && (
                <Text style={styles.cessionSummary}>
                  {salePrice !== null ? `${fmtEur(salePrice)} €` : salePriceStr} · {saleDate}
                </Text>
              )}
            </TouchableOpacity>

            {showCessionDetails && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Prix de cession (€)</Text>
                  <TextInput
                    style={styles.input}
                    value={salePriceStr}
                    onChangeText={setSalePriceStr}
                    keyboardType="decimal-pad"
                    placeholder="Ex : 1 250,00"
                    placeholderTextColor={OrTrackColors.subtext}
                    selectionColor={OrTrackColors.gold}
                  />
                  {selectedPos && (
                    <Text style={styles.inputHint}>
                      Valeur marché estimée :&nbsp;
                      {(() => {
                        const mv = spotValue(selectedPos, getSpot(selectedPos.metal, prices));
                        return mv !== null ? `${fmtEur(mv)} €` : 'cours indisponible';
                      })()}
                    </Text>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Date de cession</Text>
                  <TextInput
                    style={styles.input}
                    value={saleDate}
                    onChangeText={(v) => setSaleDate(autoFormatDate(v))}
                    keyboardType="number-pad"
                    placeholder="JJ/MM/AAAA"
                    placeholderTextColor={OrTrackColors.subtext}
                    selectionColor={OrTrackColors.gold}
                    maxLength={10}
                  />
                </View>
              </>
            )}
          </View>

          {/* ── Résultats ── */}
          {taxResult && salePrice !== null && costPrice !== null ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Résultats de la simulation</Text>

              {/* Durée de détention */}
              <View style={styles.holdingBanner}>
                <Text style={styles.holdingText}>
                  Durée de détention : <Text style={styles.holdingYears}>{taxResult.years} an{taxResult.years > 1 ? 's' : ''}</Text>
                </Text>
              </View>

              {/* Recommandation */}
              <View style={styles.recommendCard}>
                <Text style={styles.recommendTitle}>
                  {taxResult.isExempt
                    ? 'Régime plus-values — exonération totale'
                    : taxResult.plusValue <= 0 && bestRegime === 'plusvalues'
                    ? 'Régime plus-values conseillé — cession à perte, aucune taxe'
                    : `Régime ${bestRegime === 'forfaitaire' ? 'forfaitaire' : 'plus-values'} conseillé`}
                </Text>
                {!taxResult.isExempt && taxResult.plusValue > 0 && (
                  <Text style={styles.recommendSaving}>
                    Économie estimée : {fmtEur(savings!)} €
                  </Text>
                )}
              </View>

              {/* Régime forfaitaire */}
              <View style={[styles.card, styles.regimeCard, bestRegime === 'forfaitaire' && styles.regimeBest]}>
                <View style={styles.regimeHeader}>
                  <Text style={styles.regimeName}>Taxe forfaitaire</Text>
                  {bestRegime === 'forfaitaire' && (
                    <View style={styles.recommendBadge}>
                      <Text style={styles.recommendBadgeText}>Le moins taxé</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.regimeDesc}>11,5 % du prix de cession</Text>
                <Text style={styles.regimeNetLabel}>Net encaissé</Text>
                <Text style={styles.regimeNetAmount}>{fmtEur(salePrice - taxResult.forfaitaire)} €</Text>
                <Text style={styles.regimeTaxLine}>Taxe (11,5%) : {fmtEur(taxResult.forfaitaire)} €</Text>
              </View>

              {/* Régime plus-values */}
              <View style={[styles.card, styles.regimeCard, bestRegime === 'plusvalues' && styles.regimeBest]}>
                <View style={styles.regimeHeader}>
                  <Text style={styles.regimeName}>Régime plus-values</Text>
                  {bestRegime === 'plusvalues' && (
                    <View style={styles.recommendBadge}>
                      <Text style={styles.recommendBadgeText}>
                        {taxResult.isExempt ? 'Exonéré' : 'Le moins taxé'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.regimeDesc}>
                  {taxResult.isExempt
                    ? 'Exonération totale — détention supérieure à 22 ans'
                    : taxResult.plusValue <= 0
                    ? 'Cession à perte — aucune plus-value imposable'
                    : '36,2 % sur la plus-value après abattement'}
                </Text>
                <Text style={styles.regimeNetLabel}>Net encaissé</Text>
                <Text style={styles.regimeNetAmount}>{fmtEur(salePrice - taxResult.plusValuesTax)} €</Text>
                <Text style={styles.regimeTaxLine}>Taxe (36,2%) : {fmtEur(taxResult.plusValuesTax)} €</Text>
              </View>

              {/* Bouton afficher/masquer détail */}
              <TouchableOpacity style={styles.detailToggle} onPress={() => setShowDetail((v) => !v)}>
                <Text style={styles.detailToggleText}>
                  {showDetail ? 'Masquer le détail ▲' : 'Voir le détail du calcul ▼'}
                </Text>
              </TouchableOpacity>

              {/* Détail expandable */}
              {showDetail && (
                <View style={[styles.card, styles.detailCard]}>
                  <Text style={styles.detailTitle}>Détail du calcul</Text>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Prix de cession</Text>
                    <Text style={styles.detailVal}>{fmtEur(salePrice)} €</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Prix de revient</Text>
                    <Text style={styles.detailVal}>{fmtEur(costPrice)} €</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Plus-value brute</Text>
                    <Text style={[styles.detailVal, taxResult.plusValue >= 0 ? styles.positive : styles.negative]}>
                      {taxResult.plusValue >= 0 ? '+' : ''}{fmtEur(taxResult.plusValue)} €
                    </Text>
                  </View>

                  <View style={styles.detailDivider} />
                  <Text style={styles.detailSubtitle}>Régime forfaitaire</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Assiette</Text>
                    <Text style={styles.detailVal}>Prix de cession</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Taux</Text>
                    <Text style={styles.detailVal}>11,5 %</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, styles.detailKeyBold]}>Taxe</Text>
                    <Text style={[styles.detailVal, styles.detailValBold]}>{fmtEur(taxResult.forfaitaire)} €</Text>
                  </View>

                  <View style={styles.detailDivider} />
                  <Text style={styles.detailSubtitle}>Régime plus-values</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Durée de détention</Text>
                    <Text style={styles.detailVal}>{taxResult.years} an{taxResult.years > 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Abattement applicable</Text>
                    <Text style={styles.detailVal}>{Math.round(taxResult.abattement * 100)} %</Text>
                  </View>
                  {!taxResult.isExempt && taxResult.plusValue > 0 && (
                    <>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailKey}>Plus-value imposable</Text>
                        <Text style={styles.detailVal}>{fmtEur(taxResult.taxablePV)} €</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailKey}>Taux global (CGP + CS)</Text>
                        <Text style={styles.detailVal}>36,2 %</Text>
                      </View>
                    </>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, styles.detailKeyBold]}>Taxe</Text>
                    <Text style={[styles.detailVal, styles.detailValBold]}>{fmtEur(taxResult.plusValuesTax)} €</Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            selectedPos && (
              <View style={styles.waitingCard}>
                <Text style={styles.waitingText}>
                  Renseignez le prix et la date de cession pour lancer la simulation.
                </Text>
              </View>
            )
          )}

          <Text style={styles.reassuranceLine}>
            Calcul basé sur les règles fiscales françaises en vigueur
          </Text>

          {/* ── Avertissement légal ── */}
          <View style={styles.disclaimerBlock}>
            <Text style={styles.disclaimerShort}>
              Estimation indicative — ne constitue pas un conseil fiscal.
            </Text>
            <TouchableOpacity
              onPress={() => setDisclaimerExpanded(!disclaimerExpanded)}
              activeOpacity={0.7}
            >
              <Text style={disclaimerExpanded ? styles.disclaimerToggleClose : styles.disclaimerToggle}>
                {disclaimerExpanded ? 'Masquer' : 'Mentions fiscales'}
              </Text>
            </TouchableOpacity>
            {disclaimerExpanded && (
              <Text style={styles.disclaimerFull}>
                Cette simulation est fournie à titre purement indicatif et ne constitue pas un conseil fiscal ou juridique. Les règles fiscales applicables aux métaux précieux (art. 150 VI du CGI) peuvent évoluer. Consultez un conseiller fiscal ou la Direction générale des finances publiques (DGFiP) pour votre situation personnelle.
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.exitCta}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityLabel="Retour au portefeuille"
          >
            <Text style={styles.exitCtaText}>← Retour au portefeuille</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { background, gold, white, card, border, subtext, tabIconDefault } = OrTrackColors;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: background },
  scroll: { padding: 20, paddingBottom: 48 },

  // Sections
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // Position chips (sélecteur)
  chipScroll: { marginHorizontal: -4 },
  posChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: card,
    marginHorizontal: 4,
  },
  posChipSelected: {
    borderColor: gold,
    backgroundColor: '#1F1B0A',
  },
  posChipText: {
    fontSize: 13,
    color: subtext,
    fontWeight: '500',
  },
  posChipTextSelected: {
    color: gold,
    fontWeight: '700',
  },

  // Carte info position
  card: {
    backgroundColor: card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: border,
  },
  posInfoCard: { marginBottom: 16 },
  posInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  posInfoProduct: { fontSize: 15, fontWeight: '700', color: white },
  posInfoSub: { fontSize: 13, color: subtext },

  // Badges métal
  metalBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  metalBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  // Cession toggle
  cessionToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  cessionToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cessionToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: gold,
  },
  cessionSummary: {
    fontSize: 12,
    color: subtext,
  },

  // Inputs
  inputGroup: { marginBottom: 14 },
  inputLabel: {
    fontSize: 12,
    color: subtext,
    marginBottom: 6,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: card,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: white,
  },
  inputHint: {
    fontSize: 11,
    color: tabIconDefault,
    marginTop: 5,
    fontStyle: 'italic',
  },

  // Durée de détention
  holdingBanner: {
    backgroundColor: card,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: border,
  },
  holdingText: { fontSize: 13, color: subtext },
  holdingYears: { color: white, fontWeight: '700' },

  // Cartes régime
  regimeCard: { marginBottom: 12 },
  regimeBest: { borderColor: 'rgba(76,175,80,0.4)', backgroundColor: 'rgba(76,175,80,0.05)' },
  regimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  regimeName: { fontSize: 15, fontWeight: '700', color: white },
  regimeDesc: { fontSize: 12, color: subtext, marginBottom: 10, lineHeight: 18 },
  regimeNetLabel: { fontSize: 12, color: subtext, marginBottom: 2 },
  regimeNetAmount: { fontSize: 30, fontWeight: '800', color: '#4CAF50', marginBottom: 4 },
  regimeTaxLine: { fontSize: 23, fontWeight: '400', color: subtext, opacity: 0.7 },

  recommendBadge: {
    backgroundColor: '#1F1B0A',
    borderWidth: 1,
    borderColor: gold,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recommendBadgeText: { fontSize: 10, color: gold, fontWeight: '700' },

  // Recommandation
  recommendCard: {
    backgroundColor: '#161C10',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2E4A1A',
    marginBottom: 16,
  },
  recommendTitle: { fontSize: 14, color: white, fontWeight: '600', marginBottom: 4 },
  recommendSaving: { fontSize: 13, color: '#7EC85A', fontWeight: '700' },

  // Détail expandable
  detailToggle: { alignItems: 'center', paddingVertical: 12 },
  detailToggleText: { fontSize: 13, color: gold, fontWeight: '600' },
  detailCard: { marginTop: 0, padding: 16 },
  detailTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  detailSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailKey: { fontSize: 13, color: subtext },
  detailKeyBold: { color: white, fontWeight: '600' },
  detailVal: { fontSize: 13, color: white, fontWeight: '500' },
  detailValBold: { fontWeight: '700' },
  detailDivider: {
    height: 1,
    backgroundColor: border,
    marginVertical: 12,
  },

  // État d'attente
  waitingCard: {
    backgroundColor: card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: border,
    alignItems: 'center',
    marginBottom: 24,
  },
  waitingText: { fontSize: 14, color: subtext, textAlign: 'center', lineHeight: 22 },

  // Disclaimer
  disclaimerBlock: {
    marginTop: 16,
  },
  disclaimerShort: {
    fontSize: 11,
    color: subtext,
    textAlign: 'center',
  },
  disclaimerToggle: {
    fontSize: 11,
    color: gold,
    textAlign: 'center',
    marginTop: 6,
  },
  disclaimerToggleClose: {
    fontSize: 11,
    color: subtext,
    textAlign: 'center',
    marginTop: 6,
  },
  disclaimerFull: {
    fontSize: 11,
    color: subtext,
    marginTop: 8,
    lineHeight: 16,
  },

  reassuranceLine: {
    fontSize: 11,
    color: subtext,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  exitCta: {
    backgroundColor: card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: gold,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  exitCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: gold,
  },

  positive: { color: '#4CAF50' },
  negative: { color: '#E07070' },
});
