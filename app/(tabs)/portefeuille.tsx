import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Ionicons from '@expo/vector-icons/Ionicons';
import { type MetalType, METAL_CONFIG, getSpot } from '@/constants/metals';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { useSpotPrices } from '@/hooks/use-spot-prices';

type Position = {
  id: string;
  metal: MetalType;
  product: string;
  weightG: number;
  quantity: number;
  purchasePrice: number; // € par unité
  purchaseDate: string;  // JJ/MM/AAAA
  createdAt: string;
};

const STORAGE_KEY = '@ortrack:positions';
const HIDE_VALUE_KEY = '@ortrack:hide_portfolio_value';
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

function fmtQty(n: number): string {
  const qty = n % 1 === 0 ? String(n) : n.toFixed(2);
  return `${qty} pièce${n > 1 ? 's' : ''}`;
}


function parseDateDMY(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

function computeFiscalCountdown(purchaseDate: string) {
  const buyDate = parseDateDMY(purchaseDate);
  if (!buyDate) return null;

  const now = new Date();
  const diffMs = now.getTime() - buyDate.getTime();
  if (diffMs < 0) return null;

  let years = now.getFullYear() - buyDate.getFullYear();
  let months = now.getMonth() - buyDate.getMonth();
  if (now.getDate() < buyDate.getDate()) months--;
  if (months < 0) { years--; months += 12; }

  const abattement = years < 3 ? 0 : Math.min((years - 2) * 5, 100);
  const isExonere = abattement >= 100;

  const exemptionDate = new Date(buyDate);
  exemptionDate.setFullYear(exemptionDate.getFullYear() + 22);

  let remainingYears = 0;
  let remainingMonths = 0;
  if (!isExonere) {
    remainingYears = exemptionDate.getFullYear() - now.getFullYear();
    remainingMonths = exemptionDate.getMonth() - now.getMonth();
    if (exemptionDate.getDate() < now.getDate()) remainingMonths--;
    if (remainingMonths < 0) { remainingYears--; remainingMonths += 12; }
  }

  const moisNoms = ['janv.','févr.','mars','avr.','mai','juin',
    'juil.','août','sept.','oct.','nov.','déc.'];
  const exemptionLabel = moisNoms[exemptionDate.getMonth()]
    + ' ' + exemptionDate.getFullYear();

  const buildLabel = (y: number, m: number): string => {
    const parts: string[] = [];
    if (y > 0) parts.push(y + ' an' + (y > 1 ? 's' : ''));
    if (m > 0) parts.push(m + ' mois');
    return parts.length > 0 ? parts.join(' ') : "Moins d'un mois";
  };

  return {
    detentionLabel: buildLabel(years, months),
    abattement,
    isExonere,
    remainingLabel: buildLabel(remainingYears, remainingMonths),
    exemptionLabel,
    progress: abattement / 100,
  };
}

// ─── Sous-composant : carte position ─────────────────────────────────────────

type PositionCardProps = {
  pos: Position;
  spotEur: number | null;
  pricesLoading: boolean;
  onDelete: (id: string) => void;
  onFiscalite: () => void;
  currencySymbol: string;
  hideValue: boolean;
};

function PositionCard({ pos, spotEur, pricesLoading, onDelete, onFiscalite, currencySymbol, hideValue }: PositionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const totalWeightG = pos.quantity * pos.weightG;
  const totalCost = pos.quantity * pos.purchasePrice;

  const currentValue =
    spotEur !== null
      ? pos.quantity * (pos.weightG / OZ_TO_G) * spotEur
      : null;

  const gainLoss = currentValue !== null ? currentValue - totalCost : null;
  const gainLossPct =
    gainLoss !== null && totalCost > 0
      ? (gainLoss / totalCost) * 100
      : null;

  const cfg = METAL_CONFIG[pos.metal];
  const fiscal = computeFiscalCountdown(pos.purchaseDate);

  return (
    <View style={styles.posCard}>
      {/* ── Header tappable ── */}
      <TouchableOpacity
        style={styles.posHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={[styles.metalChip, { backgroundColor: cfg.chipBg, borderColor: cfg.chipBorder }]}>
          <Text style={[styles.metalChipText, { color: cfg.chipText }]}>
            {cfg.symbol}
          </Text>
        </View>
        <Text style={styles.posProduct} numberOfLines={1}>
          {pos.product}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={OrTrackColors.subtext}
        />
      </TouchableOpacity>

      {/* ── Plus-value compacte (replié uniquement) ── */}
      {!expanded && gainLoss !== null && !hideValue && (
        <View style={styles.posCompactGain}>
          <Text style={[styles.posCompactGainText, gainLoss >= 0 ? styles.positive : styles.negative]}>
            {gainLoss >= 0 ? '+' : ''}{fmtEur(gainLoss)} {currencySymbol}
            {gainLossPct !== null && (
              `  (${gainLoss >= 0 ? '+' : ''}${fmtPct(gainLossPct)} %)`
            )}
          </Text>
        </View>
      )}

      {/* ── Contenu déplié ── */}
      {expanded && (
        <>
          <Text style={styles.posDetail}>
            {fmtQty(pos.quantity)} · {fmtG(totalWeightG)} · Achat le {pos.purchaseDate}
          </Text>

          {!hideValue && <View style={styles.posDivider} />}

          {!hideValue && (
            <View style={styles.posValuesRow}>
              <View style={styles.posValueCol}>
                <Text style={styles.posValueLabel}>Coût total</Text>
                <Text style={styles.posValueAmount}>{fmtEur(totalCost)} {currencySymbol}</Text>
              </View>
              <View style={styles.posValueDivider} />
              <View style={[styles.posValueCol, styles.posValueColRight]}>
                <Text style={styles.posValueLabel}>Valeur actuelle</Text>
                <Text style={styles.posValueAmount}>
                  {pricesLoading
                    ? 'Calcul…'
                    : currentValue !== null
                    ? `${fmtEur(currentValue)} ${currencySymbol}`
                    : '—'}
                </Text>
              </View>
            </View>
          )}

          {gainLoss !== null && !hideValue && (
            <View style={styles.posGainRow}>
              <Text style={[styles.posGain, gainLoss >= 0 ? styles.positive : styles.negative]}>
                {gainLoss >= 0 ? '+' : ''}{fmtEur(gainLoss)} {currencySymbol}
              </Text>
              {gainLossPct !== null && (
                <Text style={[styles.posGainPct, gainLoss >= 0 ? styles.positive : styles.negative]}>
                  {'  '}({gainLoss >= 0 ? '+' : ''}{fmtPct(gainLossPct)} %)
                </Text>
              )}
            </View>
          )}

          {fiscal && (
            <View style={styles.fiscalCountdown}>
              <Text style={styles.fiscalTitle}>EXONÉRATION FISCALE</Text>

              <Text style={styles.fiscalDetail}>
                Détention : {fiscal.detentionLabel}
              </Text>

              <Text style={styles.fiscalDetail}>
                Abattement actuel : {fiscal.abattement} %
              </Text>

              <View style={styles.progressBarBg}>
                <View style={[
                  styles.progressBarFill,
                  { width: `${Math.round(Math.max(fiscal.progress * 100, 2))}%` },
                  fiscal.isExonere && styles.progressBarExonere,
                ]} />
              </View>

              {fiscal.isExonere ? (
                <Text style={styles.fiscalExonere}>{'Exonéré ✓'}</Text>
              ) : (
                <View>
                  <Text style={styles.fiscalRemaining}>
                    Exonération totale dans {fiscal.remainingLabel}
                  </Text>
                  <Text style={styles.fiscalDate}>
                    ({fiscal.exemptionLabel})
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.posExpandedFooter}>
            <TouchableOpacity
              onPress={onFiscalite}
              activeOpacity={0.7}>
              <Text style={styles.posSimulLink}>
                Détails fiscaux →
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDelete(pos.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.deleteLabel}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function PortefeuilleScreen() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [hideValue, setHideValue] = useState(false);
  const { prices, loading: pricesLoading, currencySymbol } = useSpotPrices();
  const { showPaywall, isPremium, limits, canAddPosition } = usePremium();

  const loadPositions = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setPositions(raw ? JSON.parse(raw) : []);
    } catch {
      setPositions([]);
    }
  }, []);

  // Recharge à chaque activation de l'onglet
  useFocusEffect(
    useCallback(() => {
      loadPositions();
    }, [loadPositions])
  );

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(HIDE_VALUE_KEY).then((val) => {
        setHideValue(val === 'true');
      });
    }, [])
  );

  const toggleHideValue = useCallback(() => {
    setHideValue((prev) => {
      const next = !prev;
      AsyncStorage.setItem(HIDE_VALUE_KEY, String(next));
      return next;
    });
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert(
      'Supprimer la position',
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const updated = positions.filter((p) => p.id !== id);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            setPositions(updated);
          },
        },
      ]
    );
  };

  // ── Calculs agrégés ───────────────────────────────────────────────────────

  const metalSummary = (['or', 'argent', 'platine', 'palladium', 'cuivre'] as const).map((m) => {
    const filtered = positions.filter((p) => p.metal === m);
    const totalG = filtered.reduce((s, p) => s + p.quantity * p.weightG, 0);
    const pieces = filtered.reduce((s, p) => s + p.quantity, 0);
    const spot = getSpot(m, prices);
    const valueEur = spot !== null && totalG > 0
      ? (totalG / OZ_TO_G) * spot
      : null;

    return {
      metal: m,
      cfg: METAL_CONFIG[m],
      totalG,
      pieces,
      valueEur,
    };
  });
  const visibleMetals = metalSummary.filter((m) => m.totalG > 0);

  let totalValue = 0;
  let totalCost = 0;
  let allPricesKnown = !pricesLoading;

  for (const p of positions) {
    const spot = getSpot(p.metal, prices);
    totalCost += p.quantity * p.purchasePrice;
    if (spot !== null) {
      totalValue += p.quantity * (p.weightG / OZ_TO_G) * spot;
    } else {
      allPricesKnown = false;
    }
  }

  const totalGainLoss = allPricesKnown && positions.length > 0 ? totalValue - totalCost : null;
  const totalGainLossPct =
    totalGainLoss !== null && totalCost > 0
      ? (totalGainLoss / totalCost) * 100
      : null;

  const hasPositions = positions.length > 0;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* En-tête */}
        <View style={styles.headerRow}>
          <Text style={styles.headerBrand}>ORTRACK</Text>
          <Text style={styles.headerRight}>Portefeuille</Text>
        </View>

        {/* ── Valeur totale (si positions) ── */}
        {hasPositions && (
          <View style={styles.totalCard}>
            <View style={styles.totalLabelRow}>
              <Text style={styles.totalLabel}>Valeur totale estimée</Text>
              <TouchableOpacity
                onPress={toggleHideValue}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={hideValue ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={OrTrackColors.subtext}
                />
              </TouchableOpacity>
            </View>
            {hideValue ? (
              <View style={styles.blurRow}>
                <View style={[styles.blurBlock, { width: 80 }]} />
                <View style={[styles.blurBlock, { width: 60 }]} />
                <View style={[styles.blurBlock, { width: 40 }]} />
              </View>
            ) : (
              <Text style={styles.totalValue}>
                {pricesLoading
                  ? 'Calcul en cours…'
                  : allPricesKnown
                  ? `${fmtEur(totalValue)} ${currencySymbol}`
                  : `— ${currencySymbol}`}
              </Text>
            )}
            {totalGainLoss !== null && !hideValue && (
              <View style={styles.totalGainRow}>
                <Text style={[styles.totalGain, totalGainLoss >= 0 ? styles.positive : styles.negative]}>
                  {totalGainLoss >= 0 ? '+' : ''}{fmtEur(totalGainLoss)} {currencySymbol}
                </Text>
                {totalGainLossPct !== null && (
                  <Text style={[styles.totalGainPct, totalGainLoss >= 0 ? styles.positive : styles.negative]}>
                    {'  '}{totalGainLoss >= 0 ? '+' : ''}{fmtPct(totalGainLossPct)} %
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Résumé métaux ── */}
        {hasPositions && visibleMetals.length > 0 && !hideValue && (
          <View style={styles.summaryCard}>
            {visibleMetals.map((m, i) => (
              <View key={m.metal}>
                {i > 0 && <View style={styles.summarySeparator} />}
                <View style={styles.summaryMetalRow}>
                  <View style={styles.summaryLeft}>
                    <View style={[styles.summaryBadge, { borderColor: m.cfg.chipBorder }]}>
                      <Text style={[styles.summaryBadgeText, { color: m.cfg.chipText }]}>{m.cfg.symbol}</Text>
                    </View>
                    <Text style={styles.summaryName}>{m.cfg.name}</Text>
                  </View>
                  <View style={styles.summaryRight}>
                    {m.valueEur !== null && (
                      <Text style={styles.summaryValue}>
                        {fmtEur(m.valueEur)} {currencySymbol}
                      </Text>
                    )}
                    <Text style={styles.summaryWeight}>{fmtG(m.totalG)}</Text>
                    <Text style={styles.summaryPieces}>{fmtQty(m.pieces)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Statistiques ── */}
        {hasPositions && (
          <TouchableOpacity
            style={styles.statsButton}
            onPress={() => router.push('/statistiques' as never)}>
            <Text style={styles.statsButtonText}>Statistiques →</Text>
          </TouchableOpacity>
        )}

        {/* ── Simulation fiscale globale ── */}
        {hasPositions && (
          <TouchableOpacity
            style={styles.globalFiscalButton}
            onPress={() => router.push('/fiscalite-globale' as never)}>
            <Text style={styles.globalFiscalText}>Simulation fiscale globale →</Text>
          </TouchableOpacity>
        )}

        {/* ── Liste des positions ── */}
        {hasPositions ? (
          <View>
            <View style={styles.positionsHeader}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                Positions ({positions.length})
              </Text>
              {!isPremium && (
                <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                  <Text style={styles.positionsLimit}>
                    {positions.length}/{limits.maxPositions} · Passer à illimité
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {positions.map((pos) => (
              <PositionCard
                key={pos.id}
                pos={pos}
                spotEur={getSpot(pos.metal, prices)}
                pricesLoading={pricesLoading}
                onDelete={handleDelete}
                onFiscalite={() => router.push({ pathname: '/fiscalite', params: { positionId: pos.id } })}
                currencySymbol={currencySymbol}
                hideValue={hideValue}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <TouchableOpacity
              onPress={() => router.navigate('/(tabs)/ajouter')}
              activeOpacity={0.75}
              style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.emptyTitle}>Aucun actif enregistré</Text>
            <Text style={styles.emptyText}>
              Commencez par ajouter vos lingots, pièces ou barres
              via l'onglet "Ajouter".
            </Text>
          </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerBrand: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
    letterSpacing: 2,
  },
  headerRight: {
    fontSize: 13,
    color: OrTrackColors.subtext,
  },

  // Total card
  totalCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  totalLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: '800',
    color: OrTrackColors.white,
  },
  totalGainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  totalGain: {
    fontSize: 15,
    fontWeight: '600',
  },
  totalGainPct: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Summary card
  summaryCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  summaryMetalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: OrTrackColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  summaryName: {
    fontSize: 14,
    color: OrTrackColors.white,
    fontWeight: '500',
    marginLeft: 10,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: OrTrackColors.gold,
    marginBottom: 2,
  },
  summaryWeight: {
    fontSize: 14,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  summaryPieces: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },
  summarySeparator: {
    height: 1,
    backgroundColor: OrTrackColors.border,
  },

  // Stats button
  statsButton: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
  },
  statsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },

  // Global fiscal button
  globalFiscalButton: {
    backgroundColor: '#1F1B0A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
    alignItems: 'center',
  },
  globalFiscalText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },

  // Section title
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // Position card
  posCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  posHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  metalChip: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  metalChipText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  posProduct: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  deleteLabel: {
    fontSize: 12,
    color: '#E07070',
    fontWeight: '600',
  },
  posDetail: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginBottom: 12,
  },
  posDivider: {
    height: 1,
    backgroundColor: OrTrackColors.border,
    marginBottom: 12,
  },
  posValuesRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  posValueCol: {
    flex: 1,
  },
  posValueColRight: {
    alignItems: 'flex-end',
  },
  posValueDivider: {
    width: 1,
    backgroundColor: OrTrackColors.border,
    marginHorizontal: 12,
  },
  posValueLabel: {
    fontSize: 10,
    color: OrTrackColors.tabIconDefault,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  posValueAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  posGainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
    paddingTop: 10,
  },
  posGain: {
    fontSize: 14,
    fontWeight: '700',
  },
  posGainPct: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Fiscal countdown
  fiscalCountdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  fiscalTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  fiscalDetail: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginBottom: 4,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: OrTrackColors.gold,
  },
  progressBarExonere: {
    backgroundColor: '#4CAF50',
  },
  fiscalExonere: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
    marginTop: 4,
  },
  fiscalRemaining: {
    fontSize: 12,
    color: OrTrackColors.white,
    fontWeight: '500',
  },
  fiscalDate: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },

  // Positions header
  positionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  positionsLimit: {
    fontSize: 11,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },

  // Compact gain (collapsed)
  posCompactGain: {
    paddingTop: 4,
  },
  posCompactGainText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Expanded footer
  posExpandedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  posSimulLink: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },

  // Blur blocks
  blurRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 40,
  },
  blurBlock: {
    height: 28,
    borderRadius: 8,
    backgroundColor: OrTrackColors.subtext,
    opacity: 0.25,
  },

  // Colors
  positive: { color: '#4CAF50' },
  negative: { color: '#E07070' },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: OrTrackColors.card,
    borderWidth: 2,
    borderColor: OrTrackColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyIconText: {
    fontSize: 32,
    color: OrTrackColors.gold,
    fontWeight: '300',
    lineHeight: 38,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: OrTrackColors.white,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: OrTrackColors.subtext,
    textAlign: 'center',
    lineHeight: 22,
  },
});
