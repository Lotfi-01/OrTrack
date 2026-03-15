import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
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

import { type MetalType, METAL_CONFIG, getSpot } from '@/constants/metals';
import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── Types & Constantes ──────────────────────────────────────────────────────

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

type PositionResult = {
  pos: Position;
  salePrice: number;
  costPrice: number;
  years: number;
  tax: TaxResult;
  bestRegime: 'forfaitaire' | 'plusvalues';
};

const STORAGE_KEY = '@ortrack:positions';
const OZ_TO_G = 31.10435;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Calcul fiscal ───────────────────────────────────────────────────────────

interface TaxResult {
  forfaitaire: number;
  plusValuesTax: number;
  plusValue: number;
  abattement: number;
  years: number;
  isExempt: boolean;
  taxablePV: number;
}

function computeTax(salePrice: number, costPrice: number, years: number): TaxResult {
  const forfaitaire = salePrice * 0.115;

  const plusValue = salePrice - costPrice;
  let abattement = 0;
  let isExempt = false;

  if (years >= 22) {
    abattement = 1;
    isExempt = true;
  } else if (years >= 3) {
    abattement = Math.min(1, (years - 2) * 0.05);
  }

  const taxablePV = Math.max(0, plusValue) * (1 - abattement);
  const plusValuesTax = isExempt || plusValue <= 0 ? 0 : taxablePV * 0.362;

  return { forfaitaire, plusValuesTax, plusValue, abattement, years, isExempt, taxablePV };
}

// ─── Écran ───────────────────────────────────────────────────────────────────

export default function FiscaliteGlobaleScreen() {
  const { prices } = useSpotPrices();

  const [positions, setPositions] = useState<Position[]>([]);
  const [saleDate, setSaleDate] = useState(todayStr());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const loaded: Position[] = raw ? JSON.parse(raw) : [];
      setPositions(loaded);
    });
  }, []);

  // ── Calculs ──────────────────────────────────────────────────────────────

  const { computed, excluded } = useMemo(() => {
    const saleDateParsed = parseDate(saleDate);
    const comp: PositionResult[] = [];
    const excl: Position[] = [];

    for (const pos of positions) {
      const spot = getSpot(pos.metal, prices);
      const sv = spotValue(pos, spot);
      const purchaseDateParsed = parseDate(pos.purchaseDate);

      if (sv === null || saleDateParsed === null || purchaseDateParsed === null) {
        excl.push(pos);
        continue;
      }

      const salePrice = sv;
      const costPrice = pos.quantity * pos.purchasePrice;
      const years = calcYearsHeld(purchaseDateParsed, saleDateParsed);
      const tax = computeTax(salePrice, costPrice, years);
      const bestRegime = tax.plusValuesTax <= tax.forfaitaire ? 'plusvalues' : 'forfaitaire';

      comp.push({ pos, salePrice, costPrice, years, tax, bestRegime });
    }

    return { computed: comp, excluded: excl };
  }, [positions, prices, saleDate]);

  // Agrégats
  const totalSalePrice = computed.reduce((s, r) => s + r.salePrice, 0);
  const totalForfaitaire = computed.reduce((s, r) => s + r.tax.forfaitaire, 0);
  const totalPlusValuesTax = computed.reduce((s, r) => s + r.tax.plusValuesTax, 0);
  const bestGlobalRegime = totalPlusValuesTax <= totalForfaitaire ? 'plusvalues' : 'forfaitaire';
  const economieGlobale = Math.abs(totalForfaitaire - totalPlusValuesTax);
  const netForfaitaire = totalSalePrice - totalForfaitaire;
  const netPlusValues = totalSalePrice - totalPlusValuesTax;

  // ── Rendu ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'Simulation globale',
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 12 }}>
            <Text style={{ color: OrTrackColors.gold, fontSize: 16 }}>← Retour</Text>
          </TouchableOpacity>
        ),
      }} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* ── CAS 1 : Aucune position ── */}
          {positions.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Aucune position dans votre portefeuille</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/ajouter')}>
                <Text style={styles.emptyLink}>Ajouter une position →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── CAS 2 : Positions mais toutes exclues ── */}
          {positions.length > 0 && computed.length === 0 && excluded.length > 0 && (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Cours indisponibles</Text>
              <Text style={styles.warningText}>Réessayez lorsque les cours seront disponibles.</Text>
            </View>
          )}

          {/* ── CAS 3 : Positions avec résultats ── */}
          {computed.length > 0 && (
            <>
              {/* 1. DATE DE CESSION */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DATE DE CESSION</Text>
                <TextInput
                  style={styles.input}
                  value={saleDate}
                  onChangeText={(v) => setSaleDate(autoFormatDate(v))}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder="JJ/MM/AAAA"
                  placeholderTextColor={OrTrackColors.subtext}
                  selectionColor={OrTrackColors.gold}
                />
                <Text style={styles.inputHint}>La date de cession détermine l'abattement du régime plus-values (5 % par an dès la 3e année de détention).</Text>
              </View>

              {/* 2. POSITIONS EXCLUES */}
              {excluded.length > 0 && (
                <View style={styles.excludedBanner}>
                  <Text style={styles.excludedText}>
                    ⚠️ {excluded.length} position{excluded.length > 1 ? 's' : ''} exclue{excluded.length > 1 ? 's' : ''} — cours indisponible
                  </Text>
                </View>
              )}

              {/* 3. DÉTAIL PAR POSITION */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DÉTAIL PAR POSITION ({computed.length})</Text>

                <View style={styles.card}>
                  {computed.map((r, i) => {
                    const cfg = METAL_CONFIG[r.pos.metal];
                    return (
                      <View key={r.pos.id}>
                        {i > 0 && <View style={styles.separator} />}

                        {/* Row 1 : badge + produit + durée */}
                        <View style={styles.posRow}>
                          <View style={[styles.badge, { backgroundColor: cfg.chipBg, borderColor: cfg.chipBorder }]}>
                            <Text style={[styles.badgeText, { color: cfg.chipText }]}>{cfg.symbol}</Text>
                          </View>
                          <Text style={styles.posProduct} numberOfLines={1}>{r.pos.product}</Text>
                          <Text style={styles.posDuration}>{r.years} an{r.years > 1 ? 's' : ''}</Text>
                        </View>

                        {/* Row 2 : forfaitaire vs plus-values */}
                        <View style={{ marginTop: 4 }}>
                          <Text style={[
                            styles.taxLabel,
                            { color: r.bestRegime === 'forfaitaire' ? gold : subtext,
                              fontWeight: r.bestRegime === 'forfaitaire' ? '700' : '400' },
                          ]}>Taxe forfaitaire : {fmtEur(r.tax.forfaitaire)} €</Text>
                          <Text style={[
                            styles.fiscalLabelPV,
                            { color: r.bestRegime === 'plusvalues' ? gold : subtext,
                              fontWeight: r.bestRegime === 'plusvalues' ? '700' : '400' },
                          ]}>Taxe plus-values : {fmtEur(r.tax.plusValuesTax)} €</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* 4. RÉCAPITULATIF GLOBAL */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>RÉCAPITULATIF GLOBAL</Text>

                {/* Valeur totale de cession */}
                <View style={[styles.card, styles.recapHero]}>
                  <Text style={styles.recapHeroLabel}>VALEUR TOTALE DE CESSION</Text>
                  <Text style={styles.recapHeroValue}>{fmtEur(totalSalePrice)} €</Text>

                  {/* Deux colonnes : forfaitaire vs plus-values */}
                  <View style={styles.recapColumns}>
                    <View style={[styles.recapCol, bestGlobalRegime === 'forfaitaire' && styles.recapColBest]}>
                      <Text style={styles.recapColTitle}>Forfaitaire</Text>
                      <Text style={styles.recapColTax}>{fmtEur(totalForfaitaire)} €</Text>
                      <Text style={styles.recapColNet}>Net : {fmtEur(netForfaitaire)} €</Text>
                      {bestGlobalRegime === 'forfaitaire' && (
                        <View style={styles.recommendBadge}>
                          <Text style={styles.recommendBadgeText}>Le moins taxé</Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.recapCol, bestGlobalRegime === 'plusvalues' && styles.recapColBest]}>
                      <Text style={styles.recapColTitle}>Plus-values</Text>
                      <Text style={styles.recapColTax}>{fmtEur(totalPlusValuesTax)} €</Text>
                      <Text style={styles.recapColNet}>Net : {fmtEur(netPlusValues)} €</Text>
                      {bestGlobalRegime === 'plusvalues' && (
                        <View style={styles.recommendBadge}>
                          <Text style={styles.recommendBadgeText}>Le moins taxé</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Recommandation + économie */}
                {economieGlobale > 0.01 && (
                  <View style={styles.savingCard}>
                    <Text style={styles.savingTitle}>
                      Régime {bestGlobalRegime === 'forfaitaire' ? 'forfaitaire' : 'plus-values'} conseillé
                    </Text>
                    <Text style={styles.savingAmount}>Économie estimée : {fmtEur(economieGlobale)} €</Text>
                  </View>
                )}
              </View>

              {/* Avertissement légal */}
              <View style={styles.legalCard}>
                <Text style={styles.legalText}>
                  Cette simulation est fournie à titre purement indicatif et ne constitue pas un conseil fiscal ou juridique. Les règles fiscales applicables aux métaux précieux (art. 150 VI du CGI) peuvent évoluer. Consultez un conseiller fiscal ou la Direction générale des finances publiques (DGFiP) pour votre situation personnelle.
                </Text>
              </View>
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const { background, gold, white, card: cardColor, border, subtext, tabIconDefault } = OrTrackColors;

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
    letterSpacing: 1,
    marginBottom: 12,
  },

  // Input
  input: {
    backgroundColor: cardColor,
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

  // Card générique
  card: {
    backgroundColor: cardColor,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: border,
    padding: 16,
  },

  // Séparateur dans la card détail
  separator: {
    height: 1,
    backgroundColor: border,
    marginVertical: 12,
  },

  // Position row
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  posProduct: {
    fontSize: 14,
    fontWeight: '600',
    color: white,
    flex: 1,
  },
  posDuration: {
    fontSize: 12,
    color: subtext,
  },

  // Tax labels
  taxLabel: {
    fontSize: 12,
  },
  fiscalLabelPV: {
    fontSize: 12,
    color: subtext,
    marginTop: 2,
  },

  // Récapitulatif global
  recapHero: {
    borderColor: '#3A2E0A',
    padding: 20,
    marginBottom: 16,
  },
  recapHeroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  recapHeroValue: {
    fontSize: 28,
    fontWeight: '800',
    color: white,
  },
  recapColumns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  recapCol: {
    flex: 1,
    backgroundColor: background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: border,
    alignItems: 'center',
  },
  recapColBest: {
    borderColor: gold,
  },
  recapColTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: subtext,
    marginBottom: 6,
  },
  recapColTax: {
    fontSize: 18,
    fontWeight: '800',
    color: white,
    marginBottom: 2,
  },
  recapColNet: {
    fontSize: 11,
    color: subtext,
    marginBottom: 8,
  },

  // Recommend badge
  recommendBadge: {
    backgroundColor: '#1F1B0A',
    borderWidth: 1,
    borderColor: gold,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recommendBadgeText: {
    fontSize: 10,
    color: gold,
    fontWeight: '700',
  },

  // Saving card
  savingCard: {
    backgroundColor: '#161C10',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2E4A1A',
    marginBottom: 16,
  },
  savingTitle: {
    fontSize: 14,
    color: white,
    fontWeight: '600',
    marginBottom: 4,
  },
  savingAmount: {
    fontSize: 13,
    color: '#7EC85A',
    fontWeight: '700',
  },

  // Empty state
  emptyCard: {
    backgroundColor: cardColor,
    borderRadius: 12,
    padding: 32,
    borderWidth: 1,
    borderColor: border,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: subtext,
    textAlign: 'center',
  },
  emptyLink: {
    fontSize: 13,
    color: gold,
    fontWeight: '600',
    marginTop: 12,
  },

  // Warning card
  warningCard: {
    backgroundColor: '#2A1800',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#8A4A00',
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: white,
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: subtext,
  },

  // Excluded banner
  excludedBanner: {
    backgroundColor: '#2A1800',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#8A4A00',
  },
  excludedText: {
    fontSize: 12,
    color: '#E0A060',
  },

  // Legal
  legalCard: {
    backgroundColor: cardColor,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: border,
    marginTop: 4,
  },
  legalText: {
    fontSize: 11,
    color: subtext,
    lineHeight: 18,
  },
});
