import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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

import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── Types ────────────────────────────────────────────────────────────────────

type MetalType = 'or' | 'argent';

type Position = {
  id: string;
  metal: MetalType;
  product: string;
  weightG: number;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string; // JJ/MM/AAAA
  createdAt: string;
};

const STORAGE_KEY = '@ortrack:positions';
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

  // Charger les positions depuis AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
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
    const spot = selectedPos.metal === 'or' ? prices.gold : prices.silver;
    const mv = spotValue(selectedPos, spot);
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
      <Stack.Screen options={{ title: 'Simulation fiscale', headerBackTitle: 'Retour' }} />

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
                    <Text style={[styles.posChipText, p.id === selectedId && styles.posChipTextSelected]}>
                      {p.product} · {p.quantity} pcs
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── Info de la position sélectionnée ── */}
          {selectedPos && (
            <View style={[styles.card, styles.posInfoCard]}>
              <View style={styles.posInfoRow}>
                <View style={[styles.metalBadge, selectedPos.metal === 'or' ? styles.badgeGold : styles.badgeSilver]}>
                  <Text style={[styles.metalBadgeText, selectedPos.metal === 'or' ? styles.badgeTextGold : styles.badgeTextSilver]}>
                    {selectedPos.metal === 'or' ? 'XAU' : 'XAG'}
                  </Text>
                </View>
                <Text style={styles.posInfoProduct}>{selectedPos.product}</Text>
              </View>
              <Text style={styles.posInfoDetail}>
                {selectedPos.quantity} pcs · Acquis le {selectedPos.purchaseDate} · Prix de revient : {fmtEur(selectedPos.quantity * selectedPos.purchasePrice)} €
              </Text>
            </View>
          )}

          {/* ── Détails de la cession ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Détails de la cession</Text>

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
                    const spot = selectedPos.metal === 'or' ? prices.gold : prices.silver;
                    const mv = spotValue(selectedPos, spot);
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

              {/* Régime forfaitaire */}
              <View style={[styles.card, styles.regimeCard, bestRegime === 'forfaitaire' && styles.regimeBest]}>
                <View style={styles.regimeHeader}>
                  <Text style={styles.regimeName}>Taxe forfaitaire</Text>
                  {bestRegime === 'forfaitaire' && (
                    <View style={styles.recommendBadge}>
                      <Text style={styles.recommendBadgeText}>Recommandé</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.regimeDesc}>11,5 % du prix de cession, quels que soient la durée et le gain</Text>
                <Text style={styles.regimeTaxAmount}>{fmtEur(taxResult.forfaitaire)} €</Text>
                <Text style={styles.regimeNet}>
                  Net encaissé : <Text style={styles.regimeNetAmount}>{fmtEur(salePrice - taxResult.forfaitaire)} €</Text>
                </Text>
              </View>

              {/* Régime plus-values */}
              <View style={[styles.card, styles.regimeCard, bestRegime === 'plusvalues' && styles.regimeBest]}>
                <View style={styles.regimeHeader}>
                  <Text style={styles.regimeName}>Régime plus-values</Text>
                  {bestRegime === 'plusvalues' && (
                    <View style={styles.recommendBadge}>
                      <Text style={styles.recommendBadgeText}>
                        {taxResult.isExempt ? 'Exonéré' : 'Recommandé'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.regimeDesc}>
                  {taxResult.isExempt
                    ? 'Exonération totale — détention supérieure à 22 ans'
                    : taxResult.plusValue <= 0
                    ? 'Cession à perte — aucune plus-value imposable'
                    : `36,2 % sur la PV après abattement de ${Math.round(taxResult.abattement * 100)} %`}
                </Text>
                <Text style={styles.regimeTaxAmount}>
                  {fmtEur(taxResult.plusValuesTax)} €
                </Text>
                <Text style={styles.regimeNet}>
                  Net encaissé : <Text style={styles.regimeNetAmount}>{fmtEur(salePrice - taxResult.plusValuesTax)} €</Text>
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
                        <Text style={styles.detailKey}>PV imposable</Text>
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

          {/* ── Avertissement légal ── */}
          <View style={styles.legalCard}>
            <Text style={styles.legalText}>
              Cette simulation est fournie à titre purement indicatif et ne constitue pas un conseil fiscal ou juridique. Les règles fiscales applicables aux métaux précieux (art. 150 VI du CGI) peuvent évoluer. Consultez un conseiller fiscal ou la Direction générale des finances publiques (DGFiP) pour votre situation personnelle.
            </Text>
          </View>

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
  posInfoCard: { marginBottom: 24 },
  posInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  posInfoProduct: { fontSize: 16, fontWeight: '700', color: white, flex: 1 },
  posInfoDetail: { fontSize: 13, color: subtext, lineHeight: 20 },

  // Badges métal
  metalBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeGold: { backgroundColor: '#1F1B0A', borderColor: gold },
  badgeSilver: { backgroundColor: '#18181F', borderColor: '#A8A8B8' },
  metalBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  badgeTextGold: { color: gold },
  badgeTextSilver: { color: '#A8A8B8' },

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
    backgroundColor: '#1A1E2A',
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
  regimeBest: { borderColor: gold },
  regimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  regimeName: { fontSize: 15, fontWeight: '700', color: white },
  regimeDesc: { fontSize: 12, color: subtext, marginBottom: 10, lineHeight: 18 },
  regimeTaxAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: white,
    marginBottom: 4,
  },
  regimeNet: { fontSize: 12, color: subtext },
  regimeNetAmount: { color: white, fontWeight: '600' },

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

  // Avertissement légal
  legalCard: {
    backgroundColor: '#111118',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: border,
    marginTop: 4,
  },
  legalText: { fontSize: 11, color: tabIconDefault, lineHeight: 18 },

  positive: { color: '#4CAF50' },
  negative: { color: '#E07070' },
});
