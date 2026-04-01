import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Ionicons from '@expo/vector-icons/Ionicons';
import { type MetalType, METAL_CONFIG, getSpot, OZ_TO_G } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { formatEuro, formatG, formatPct, formatQty } from '@/utils/format';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { usePositions } from '@/hooks/use-positions';
import { Position } from '@/types/position';
import { STORAGE_KEYS } from '@/constants/storage-keys';


const getPositionMetal = (p: Position): MetalType => p.metal;

// TODO v1.2 : extraire dans services/fiscal-calculator.ts
// pour partager avec fiscalite.tsx
function computeNetGains(
  currentValue: number,
  totalCost: number,
  gainLoss: number,
  abattement: number
): {
  netForfaitaire: number;
  netPlusValues: number;
  bestRegime: 'forfaitaire' | 'plusvalues';
} {
  const taxeForfaitaire = currentValue * TAX.forfaitaireRate;
  const netForfaitaire = currentValue - taxeForfaitaire - totalCost;

  let netPlusValues: number;
  if (gainLoss > 0) {
    const gainTaxable = gainLoss * (1 - abattement / 100);
    const taxePV = gainTaxable * TAX.plusValueRate;
    netPlusValues = gainLoss - taxePV;
  } else {
    netPlusValues = gainLoss;
  }

  const bestRegime = netPlusValues >= netForfaitaire
    ? 'plusvalues' as const
    : 'forfaitaire' as const;

  return { netForfaitaire, netPlusValues, bestRegime };
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
  onEdit: () => void;
  onFiscalite: () => void;
  currencySymbol: string;
  hideValue: boolean;
  isPremium: boolean;
  showPaywall: () => void;
  positionIndex: number;
};

function PositionCard({ pos, spotEur, pricesLoading, onDelete, onEdit, onFiscalite, currencySymbol, hideValue, isPremium, showPaywall, positionIndex }: PositionCardProps) {
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

  // ── Fiscal + calcul gain net ──
  const fiscal = computeFiscalCountdown(pos.purchaseDate);
  const abattement = fiscal?.abattement ?? 0;

  const netGains = (currentValue !== null && gainLoss !== null)
    ? computeNetGains(currentValue, totalCost, gainLoss, abattement)
    : null;

  const displayNet = netGains
    ? (isPremium
        ? (netGains.bestRegime === 'plusvalues' ? netGains.netPlusValues : netGains.netForfaitaire)
        : netGains.netForfaitaire)
    : null;

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
      {!expanded && !hideValue && (
        <View>
          {/* Gain brut — taille réduite mais COLORÉ vert/rouge */}
          {gainLoss !== null && (
            <Text style={[
              styles.posCompactGainSmall,
              gainLoss >= 0 ? styles.positive : styles.negative,
            ]}>
              {gainLoss >= 0 ? '+' : ''}{formatEuro(gainLoss)} {currencySymbol}
              {gainLossPct !== null && (
                `  (${gainLoss >= 0 ? '+' : ''}${formatPct(gainLossPct, 2)})`
              )}
            </Text>
          )}

          {/* NET = l'info principale, plus visible que le brut */}
          {netGains && gainLoss !== null && gainLoss > 0 ? (
            <View style={styles.posCompactNetMain}>
              <Text style={styles.posCompactNetMainLabel}>Gain net : </Text>
              <Text style={[
                styles.posCompactNetMainValue,
                (displayNet ?? 0) >= 0 ? styles.positive : styles.negative,
              ]}>
                {(displayNet ?? 0) >= 0 ? '+' : ''}{formatEuro(displayNet ?? 0)} {currencySymbol}
              </Text>
              {isPremium && netGains && (
                <Text style={styles.posCompactRegime}>
                  {' · '}{netGains.bestRegime === 'forfaitaire' ? 'Forfaitaire' : 'Plus-values'}
                </Text>
              )}
            </View>
          ) : gainLoss !== null && gainLoss <= 0 ? (
            <Text style={styles.posCompactNoTax}>Aucune plus-value · Pas d'impôt</Text>
          ) : null}

          {/* CTA — visible sans déplier */}
          <TouchableOpacity
            onPress={onFiscalite}
            activeOpacity={0.7}
            style={styles.posCompactCta}
          >
            <Text style={styles.posCompactCtaText}>Simuler ma vente →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Contenu déplié ── */}
      {expanded && (
        <>
          {/* 1. Gain brut */}
          {gainLoss !== null && !hideValue && (
            <View style={styles.posGainRow}>
              <Text style={[styles.posGain, gainLoss >= 0 ? styles.positive : styles.negative]}>
                {gainLoss >= 0 ? '+' : ''}{formatEuro(gainLoss)} {currencySymbol}
              </Text>
              {gainLossPct !== null && (
                <Text style={[styles.posGainPct, gainLoss >= 0 ? styles.positive : styles.negative]}>
                  {'  '}({gainLoss >= 0 ? '+' : ''}{formatPct(gainLossPct, 2)})
                </Text>
              )}
            </View>
          )}

          {/* 2. Gain net estimé — en gain */}
          {netGains && !hideValue && gainLoss !== null && gainLoss > 0 && (
            <View style={styles.netGainSection}>
              <Text style={styles.netGainTitle}>NET ESTIMÉ</Text>

              {/* Forfaitaire — toujours visible */}
              <View style={styles.netGainRow}>
                <Text style={styles.netGainLabel}>Forfaitaire ({TAX.labels.forfaitaire})</Text>
                <Text style={[
                  styles.netGainValue,
                  netGains.netForfaitaire >= 0 ? styles.positive : styles.negative,
                ]}>
                  {netGains.netForfaitaire >= 0 ? '+' : ''}
                  {formatEuro(netGains.netForfaitaire)} {currencySymbol}
                </Text>
              </View>

              {/* Plus-values — premium uniquement */}
              {isPremium ? (
                <View style={styles.netGainRow}>
                  <Text style={styles.netGainLabel}>
                    {`Plus-values (${abattement > 0 ? `${abattement}% abatt.` : TAX.labels.plusValue})`}
                  </Text>
                  <Text style={[
                    styles.netGainValue,
                    netGains.netPlusValues >= 0 ? styles.positive : styles.negative,
                  ]}>
                    {netGains.netPlusValues >= 0 ? '+' : ''}
                    {formatEuro(netGains.netPlusValues)} {currencySymbol}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={showPaywall}
                  activeOpacity={0.7}
                  accessibilityLabel="Comparer les 2 régimes fiscaux"
                >
                  <View style={styles.premiumCompareRow}>
                    <Ionicons name="lock-closed" size={14} color={OrTrackColors.gold} />
                    <Text style={styles.premiumCompareText}>
                      Comparer les 2 régimes
                    </Text>
                    <Text style={styles.premiumCompareChevron}>›</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Régime optimal — premium */}
              {isPremium && netGains && (
                <View style={styles.bestRegimeBanner}>
                  <Text style={styles.bestRegimeText}>
                    Régime optimal : {netGains.bestRegime === 'forfaitaire' ? 'Forfaitaire' : 'Plus-values'}
                    {' · Économie : '}
                    {formatEuro(Math.abs(netGains.netPlusValues - netGains.netForfaitaire))} {currencySymbol}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* 2b. Gain net estimé — en perte */}
          {netGains && !hideValue && gainLoss !== null && gainLoss <= 0 && (
            <View style={styles.netGainSection}>
              <Text style={styles.noTaxMessage}>
                Aucune plus-value · Pas d'impôt
              </Text>
            </View>
          )}

          {/* 3. CTA Simuler — remonté */}
          <TouchableOpacity
            onPress={onFiscalite}
            activeOpacity={0.7}
            style={styles.simulerInline}
          >
            <Text style={styles.simulerInlineText}>Simuler ma vente →</Text>
          </TouchableOpacity>

          {/* 4. Exonération fiscale */}
          {fiscal && (
            <View style={styles.fiscalCountdown}>
              <Text style={styles.fiscalTitle}>Exonération fiscale</Text>

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
                <Text style={styles.fiscalRemaining}>
                  Totalement exonéré en {fiscal.exemptionLabel}
                </Text>
              )}
            </View>
          )}

          {/* 5. Détails d'achat */}
          <Text style={styles.posDetail}>
            {formatQty(pos.quantity)} pièce{pos.quantity > 1 ? 's' : ''} · {formatG(totalWeightG)} · Acheté le {pos.purchaseDate}
          </Text>
          {pos.quantity > 1 && (
            <Text style={styles.posDetail}>
              Prix d'achat : {formatEuro(pos.purchasePrice)} €/pièce
            </Text>
          )}
          {pos.note != null && pos.note.trim().length > 0 && pos.note.trim() !== 'Note' && (
            <Text style={styles.posNote}>{pos.note}</Text>
          )}

          {/* 6. Investi / Vaut aujourd'hui */}
          {!hideValue && <View style={styles.posDivider} />}

          {!hideValue && (
            <View style={styles.posValuesRow}>
              <View style={styles.posValueCol}>
                <Text style={styles.posValueLabel}>Investi</Text>
                <Text style={styles.posValueAmount}>{formatEuro(totalCost)} {currencySymbol}</Text>
              </View>
              <View style={styles.posValueDivider} />
              <View style={[styles.posValueCol, styles.posValueColRight]}>
                <Text style={styles.posValueLabel}>Vaut aujourd'hui</Text>
                <Text style={styles.posValueAmount}>
                  {pricesLoading
                    ? 'Calcul…'
                    : currentValue !== null
                    ? `${formatEuro(currentValue)} ${currencySymbol}`
                    : '—'}
                </Text>
              </View>
            </View>
          )}

          {/* 7. Footer — Modifier + Supprimer */}
          <View style={styles.posExpandedFooter}>
            <TouchableOpacity
              onPress={onEdit}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.editLabel}>Modifier</Text>
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
  const { positions, reloadPositions, deletePosition } = usePositions();
  const [hideValue, setHideValue] = useState(false);
  const [metalFilter, setMetalFilter] = useState<'all' | MetalType>('all');
  const { prices, loading: pricesLoading, currencySymbol } = useSpotPrices();
  const { showPaywall, isPremium, limits, canAddPosition } = usePremium();

  // Recharge à chaque activation de l'onglet
  useFocusEffect(
    useCallback(() => {
      reloadPositions();
    }, [reloadPositions])
  );

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEYS.hidePortfolioValue).then((val) => {
        setHideValue(val === 'true');
      });
    }, [])
  );

  const toggleHideValue = useCallback(() => {
    setHideValue((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEYS.hidePortfolioValue, String(next));
      return next;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(
      'Supprimer la position',
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deletePosition(id),
        },
      ]
    );
  }, [deletePosition]);

  // ── Filtre métal ────────────────────────────────────────────────────────

  const handleFilterChange = useCallback((key: 'all' | MetalType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMetalFilter(key);
  }, []);

  // Reset auto si le métal filtré n'a plus de positions
  useEffect(() => {
    if (metalFilter !== 'all') {
      const stillExists = positions.some(p => getPositionMetal(p) === metalFilter);
      if (!stillExists) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMetalFilter('all');
      }
    }
  }, [positions, metalFilter]);

  const metalChips = useMemo(() => {
    const metals: Record<string, { count: number; label: string }> = {};
    positions.forEach(p => {
      const key = getPositionMetal(p);
      if (!metals[key]) {
        metals[key] = { count: 0, label: METAL_CONFIG[key].name };
      }
      metals[key].count += 1;
    });
    return [
      { key: 'all' as const, label: 'Tout', count: positions.length },
      ...Object.entries(metals).map(([key, { count, label }]) => ({
        key: key as MetalType,
        label,
        count,
      })),
    ];
  }, [positions]);

  const filteredPositions = useMemo(() => {
    if (metalFilter === 'all') return positions;
    return positions.filter(p => getPositionMetal(p) === metalFilter);
  }, [positions, metalFilter]);

  // ── Calculs agrégés ───────────────────────────────────────────────────────

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

  // Net global estimé (approximation forfaitaire pour le header)
  const totalNetEstime = (totalGainLoss !== null && totalGainLoss > 0 && allPricesKnown)
    ? totalValue - (totalValue * TAX.forfaitaireRate) - totalCost
    : totalGainLoss;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 1. Header ── */}
        <Text style={styles.headerTitle}>Portefeuille</Text>

        {/* ── 2. Valeur totale compacte ── */}
        {hasPositions && (
          <View style={styles.compactValue}>
            <View style={styles.compactValueRow}>
              {hideValue ? (
                <View style={styles.blurRow}>
                  <View style={[styles.blurBlock, { width: 80 }]} />
                  <View style={[styles.blurBlock, { width: 60 }]} />
                  <View style={[styles.blurBlock, { width: 40 }]} />
                </View>
              ) : (
                <Text style={styles.compactAmount}>
                  {pricesLoading
                    ? 'Calcul en cours…'
                    : allPricesKnown
                    ? `${formatEuro(totalValue)} ${currencySymbol}`
                    : `— ${currencySymbol}`}
                </Text>
              )}
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
            {totalGainLoss !== null && !hideValue && (
              <Text style={[styles.compactGain, totalGainLoss >= 0 ? styles.positive : styles.negative]}>
                {totalGainLoss >= 0 ? '+' : ''}{formatEuro(totalGainLoss)} {currencySymbol}
                {totalGainLossPct !== null && (
                  `  (${totalGainLoss >= 0 ? '+' : ''}${formatPct(totalGainLossPct, 2)})`
                )}
              </Text>
            )}
            {totalNetEstime !== null && !hideValue && totalGainLoss !== null && totalGainLoss > 0 && (
              <Text style={styles.compactNetGlobal}>
                Gain net : ~{formatEuro(totalNetEstime)} {currencySymbol}
              </Text>
            )}
            {totalNetEstime !== null && !hideValue && totalGainLoss !== null && totalGainLoss > 0 && (
              <Text style={styles.compactNetTimestamp}>
                Estimation après impôts
              </Text>
            )}
            {totalGainLoss !== null && totalGainLoss <= 0 && !hideValue && (
              <Text style={styles.compactNetGlobal}>
                Aucun impôt si vente en régime plus-values
              </Text>
            )}
          </View>
        )}

        {/* ── CTA principal ── */}
        {hasPositions && !hideValue && (
          <TouchableOpacity
            style={styles.primaryCta}
            onPress={() => router.push('/fiscalite-globale' as never)}
            activeOpacity={0.7}
            accessibilityLabel="Voir combien je récupère"
          >
            <Text style={styles.primaryCtaText}>Voir combien je récupère →</Text>
          </TouchableOpacity>
        )}

        {/* ── 3. Chips filtre métal ── */}
        {hasPositions && (
          <View style={styles.filterChipsRow}>
            {metalChips.map(chip => {
              const active = metalFilter === chip.key;
              return (
                <TouchableOpacity
                  key={chip.key}
                  onPress={() => handleFilterChange(chip.key)}
                  activeOpacity={0.7}
                  accessibilityLabel={`Filtrer ${chip.label}`}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                >
                  <Text style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}>
                    {chip.key === 'all'
                      ? `${chip.label} (${chip.count})`
                      : `${chip.label} · ${chip.count}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── 4. Positions ── */}
        {hasPositions ? (
          <View>
            <View style={styles.positionsHeader}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                Positions ({filteredPositions.length})
              </Text>
              {!isPremium && (
                <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                  <Text style={positions.length >= limits.maxPositions ? styles.positionsLimitFull : styles.positionsLimit}>
                    {positions.length >= limits.maxPositions
                      ? `${limits.maxPositions}/${limits.maxPositions} · Passer en Premium`
                      : `${positions.length}/${limits.maxPositions} · Illimité en Premium`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {filteredPositions.length > 0 ? (
              filteredPositions.map((pos, posIdx) => (
                <PositionCard
                  key={pos.id}
                  pos={pos}
                  positionIndex={posIdx}
                  spotEur={getSpot(pos.metal, prices)}
                  pricesLoading={pricesLoading}
                  onDelete={handleDelete}
                  onEdit={() => router.push({ pathname: '/(tabs)/ajouter', params: { editId: pos.id } } as never)}
                  onFiscalite={() => router.push({ pathname: '/fiscalite', params: { positionId: pos.id } })}
                  currencySymbol={currencySymbol}
                  hideValue={hideValue}
                  isPremium={isPremium}
                  showPaywall={showPaywall}
                />
              ))
            ) : metalFilter !== 'all' ? (
              <Text style={styles.emptyFilterText}>Aucune position pour ce métal</Text>
            ) : null}
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

        {/* ── 5. Statistiques ── */}
        {hasPositions && (
          <TouchableOpacity
            style={styles.statsButton}
            onPress={() => router.push('/statistiques' as never)}>
            <Text style={styles.statsButtonText}>Statistiques →</Text>
          </TouchableOpacity>
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
    paddingBottom: 90,
  },

  // 1. Header
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: OrTrackColors.white,
    marginBottom: 16,
  },

  // 2. Valeur totale compacte
  compactValue: {
    marginBottom: 12,
  },
  compactValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: OrTrackColors.white,
  },
  compactGain: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  compactNetGlobal: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.white,
    marginTop: 4,
  },
  compactNetTimestamp: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 2,
    fontStyle: 'italic',
  },

  // 3. Chips filtre
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  filterChipActive: {
    backgroundColor: `${OrTrackColors.gold}20`,
    borderWidth: 1.5,
    borderColor: OrTrackColors.gold,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  filterChipTextActive: {
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

  // Positions header
  positionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  positionsLimit: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  positionsLimitFull: {
    fontSize: 11,
    color: OrTrackColors.gold,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  emptyFilterText: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
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
  editLabel: {
    fontSize: 13,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },
  deleteLabel: {
    fontSize: 12,
    color: '#E57373',
    fontWeight: '500',
    opacity: 0.7,
  },
  posDetail: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginBottom: 12,
  },
  posNote: {
    fontSize: 12,
    color: '#7A7060',
    fontStyle: 'italic',
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
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  fiscalTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: OrTrackColors.gold,
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

  // Expanded footer
  posExpandedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },

  // Net gain compact (collapsed)
  posCompactRegime: {
    fontSize: 11,
    color: OrTrackColors.gold,
    fontWeight: '500',
  },

  // Net gain expanded
  noTaxMessage: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    paddingVertical: 4,
  },
  netGainSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
    marginBottom: 4,
  },
  netGainTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: OrTrackColors.gold,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  netGainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  netGainLabel: {
    fontSize: 13,
    color: OrTrackColors.subtext,
  },
  netGainValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  premiumCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(201,168,76,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    gap: 8,
  },
  premiumCompareText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },
  premiumCompareChevron: {
    fontSize: 18,
    color: OrTrackColors.gold,
    fontWeight: '300',
  },
  bestRegimeBanner: {
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  bestRegimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: OrTrackColors.gold,
    textAlign: 'center',
  },

  // Compact (collapsed)
  posCompactGainSmall: {
    fontSize: 11,
    fontWeight: '500',
    paddingTop: 4,
  },
  posCompactNetMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingTop: 4,
  },
  posCompactNetMainLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  posCompactNetMainValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  posCompactNoTax: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    paddingTop: 4,
  },
  posCompactCta: {
    marginTop: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  posCompactCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
  },

  // Blur blocks
  blurRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 34,
  },
  blurBlock: {
    height: 24,
    borderRadius: 8,
    backgroundColor: OrTrackColors.subtext,
    opacity: 0.25,
  },

  // Stats + Simulation buttons
  statsButton: {
    flexDirection: 'row',
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsButtonText: {
    fontSize: 11,
    fontWeight: '400',
    color: OrTrackColors.subtext,
    opacity: 0.6,
  },
  primaryCta: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: OrTrackColors.gold,
  },
  simulerInline: {
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 6,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  simulerInlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
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
