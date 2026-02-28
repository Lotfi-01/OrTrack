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

import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── Types (miroir de ajouter.tsx) ────────────────────────────────────────────

type MetalType = 'or' | 'argent';

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
const OZ_TO_G = 31.10435;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtG(g: number): string {
  if (g >= 1000) return `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} kg`;
  return `${g % 1 === 0 ? g : g.toFixed(2)} g`;
}

function fmtQty(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

// ─── Sous-composant : carte position ─────────────────────────────────────────

type PositionCardProps = {
  pos: Position;
  spotEur: number | null;
  pricesLoading: boolean;
  onDelete: (id: string) => void;
  onFiscalite: () => void;
};

function PositionCard({ pos, spotEur, pricesLoading, onDelete, onFiscalite }: PositionCardProps) {
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

  const isGold = pos.metal === 'or';

  return (
    <View style={styles.posCard}>
      {/* ── Ligne 1 : badge + produit + suppression ── */}
      <View style={styles.posHeader}>
        <View style={[styles.metalChip, isGold ? styles.metalChipGold : styles.metalChipSilver]}>
          <Text style={[styles.metalChipText, isGold ? styles.metalChipTextGold : styles.metalChipTextSilver]}>
            {isGold ? 'XAU' : 'XAG'}
          </Text>
        </View>
        <Text style={styles.posProduct} numberOfLines={1}>
          {pos.product}
        </Text>
        <TouchableOpacity
          onPress={() => onDelete(pos.id)}
          style={styles.deleteButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.deleteText}>×</Text>
        </TouchableOpacity>
      </View>

      {/* ── Ligne 2 : détails de la position ── */}
      <Text style={styles.posDetail}>
        {fmtQty(pos.quantity)} pcs · {fmtG(totalWeightG)} · Achat le {pos.purchaseDate}
      </Text>

      <View style={styles.posDivider} />

      {/* ── Ligne 3 : coût vs valeur ── */}
      <View style={styles.posValuesRow}>
        <View style={styles.posValueCol}>
          <Text style={styles.posValueLabel}>Coût total</Text>
          <Text style={styles.posValueAmount}>{fmtEur(totalCost)} €</Text>
        </View>
        <View style={styles.posValueDivider} />
        <View style={[styles.posValueCol, styles.posValueColRight]}>
          <Text style={styles.posValueLabel}>Valeur actuelle</Text>
          <Text style={styles.posValueAmount}>
            {pricesLoading
              ? 'Calcul…'
              : currentValue !== null
              ? `${fmtEur(currentValue)} €`
              : '—'}
          </Text>
        </View>
      </View>

      {/* ── Ligne 4 : plus/moins-value ── */}
      {gainLoss !== null && (
        <View style={styles.posGainRow}>
          <Text style={[styles.posGain, gainLoss >= 0 ? styles.positive : styles.negative]}>
            {gainLoss >= 0 ? '+' : ''}{fmtEur(gainLoss)} €
          </Text>
          {gainLossPct !== null && (
            <Text style={[styles.posGainPct, gainLoss >= 0 ? styles.positive : styles.negative]}>
              {'  '}({gainLoss >= 0 ? '+' : ''}{gainLossPct.toFixed(2)} %)
            </Text>
          )}
        </View>
      )}

      {/* ── Bouton fiscalité ── */}
      <TouchableOpacity style={styles.fiscalButton} onPress={onFiscalite}>
        <Text style={styles.fiscalButtonText}>Simuler la fiscalité</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function PortefeuilleScreen() {
  const [positions, setPositions] = useState<Position[]>([]);
  const { prices, loading: pricesLoading } = useSpotPrices();

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

  const goldPositions = positions.filter((p) => p.metal === 'or');
  const silverPositions = positions.filter((p) => p.metal === 'argent');

  const goldTotalG = goldPositions.reduce((s, p) => s + p.quantity * p.weightG, 0);
  const silverTotalG = silverPositions.reduce((s, p) => s + p.quantity * p.weightG, 0);
  const goldPieces = goldPositions.reduce((s, p) => s + p.quantity, 0);
  const silverPieces = silverPositions.reduce((s, p) => s + p.quantity, 0);

  let totalValue = 0;
  let totalCost = 0;
  let allPricesKnown = !pricesLoading;

  for (const p of positions) {
    const spot = p.metal === 'or' ? prices.gold : prices.silver;
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
        <View style={styles.header}>
          <Text style={styles.title}>Portefeuille</Text>
          <Text style={styles.subtitle}>Vos métaux précieux physiques</Text>
        </View>

        {/* ── Valeur totale (si positions) ── */}
        {hasPositions && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Valeur totale estimée</Text>
            <Text style={styles.totalValue}>
              {pricesLoading
                ? 'Calcul en cours…'
                : allPricesKnown
                ? `${fmtEur(totalValue)} €`
                : '— €'}
            </Text>
            {totalGainLoss !== null && (
              <View style={styles.totalGainRow}>
                <Text style={[styles.totalGain, totalGainLoss >= 0 ? styles.positive : styles.negative]}>
                  {totalGainLoss >= 0 ? '+' : ''}{fmtEur(totalGainLoss)} €
                </Text>
                {totalGainLossPct !== null && (
                  <Text style={[styles.totalGainPct, totalGainLoss >= 0 ? styles.positive : styles.negative]}>
                    {'  '}{totalGainLoss >= 0 ? '+' : ''}{totalGainLossPct.toFixed(2)} %
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Résumé Or / Argent ── */}
        <View style={styles.summaryRow}>
          <View style={[styles.card, styles.summaryCard]}>
            <Text style={styles.cardLabel}>Or</Text>
            <Text style={styles.cardValue}>
              {hasPositions ? fmtG(goldTotalG) : '0 g'}
            </Text>
            <Text style={styles.cardSub}>
              {hasPositions ? `${fmtQty(goldPieces)} pièce(s)` : '0 pièce(s)'}
            </Text>
          </View>
          <View style={[styles.card, styles.summaryCard]}>
            <Text style={styles.cardLabel}>Argent</Text>
            <Text style={styles.cardValue}>
              {hasPositions ? fmtG(silverTotalG) : '0 g'}
            </Text>
            <Text style={styles.cardSub}>
              {hasPositions ? `${fmtQty(silverPieces)} pièce(s)` : '0 pièce(s)'}
            </Text>
          </View>
        </View>

        {/* ── Liste des positions ── */}
        {hasPositions ? (
          <View>
            <Text style={styles.sectionTitle}>
              Positions ({positions.length})
            </Text>
            {positions.map((pos) => (
              <PositionCard
                key={pos.id}
                pos={pos}
                spotEur={pos.metal === 'or' ? prices.gold : prices.silver}
                pricesLoading={pricesLoading}
                onDelete={handleDelete}
                onFiscalite={() => router.push({ pathname: '/fiscalite', params: { positionId: pos.id } })}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>+</Text>
            </View>
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
  header: { marginBottom: 24 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: OrTrackColors.white,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: OrTrackColors.subtext,
  },

  // Total card
  totalCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3A2E0A',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
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

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  summaryCard: { flex: 1 },
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  cardLabel: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  cardSub: {
    fontSize: 12,
    color: OrTrackColors.tabIconDefault,
    marginTop: 4,
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
  metalChipGold: {
    backgroundColor: '#1F1B0A',
    borderColor: OrTrackColors.gold,
  },
  metalChipSilver: {
    backgroundColor: '#18181F',
    borderColor: '#A8A8B8',
  },
  metalChipText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  metalChipTextGold: {
    color: OrTrackColors.gold,
  },
  metalChipTextSilver: {
    color: '#A8A8B8',
  },
  posProduct: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2A1A1A',
    borderWidth: 1,
    borderColor: '#5A2020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 16,
    color: '#E07070',
    lineHeight: 20,
    fontWeight: '300',
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

  // Bouton fiscalité
  fiscalButton: {
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
    backgroundColor: '#1A1600',
  },
  fiscalButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
    letterSpacing: 0.3,
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
