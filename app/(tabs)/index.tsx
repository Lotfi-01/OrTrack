import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PriceChart } from '@/components/price-chart';
import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── Types (miroir de ajouter.tsx / portefeuille.tsx) ─────────────────────────

type MetalType = 'or' | 'argent' | 'platine' | 'palladium' | 'cuivre';

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

const STORAGE_KEY = '@ortrack:positions';
const OZ_TO_G = 31.10435;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(value: number): string {
  const [int, dec] = value.toFixed(2).split('.');
  const thousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return `${thousands},${dec}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtG(g: number): string {
  if (g >= 1000) {
    return `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} kg`;
  }
  return `${g % 1 === 0 ? g : g.toFixed(2)} g`;
}

function fmtQty(n: number): string {
  return `${n % 1 === 0 ? String(n) : n.toFixed(2)} pcs`;
}

// ─── Sous-composants cours ────────────────────────────────────────────────────

function PriceValue({ value, loading }: { value: number | null; loading: boolean }) {
  if (loading) {
    return <ActivityIndicator size="small" color={OrTrackColors.gold} style={styles.spinner} />;
  }
  if (value === null) {
    return <Text style={styles.cardValueUnavailable}>— €/oz</Text>;
  }
  return <Text style={styles.cardValue}>{formatEur(value)} €/oz</Text>;
}


// ─── Composant principal ──────────────────────────────────────────────────────

export default function TableauDeBordScreen() {
  const { prices, loading, error, lastUpdated, historyReady, refresh } = useSpotPrices();
  const [positions, setPositions] = useState<Position[]>([]);

  // Recharge à chaque activation de l'onglet
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => setPositions(raw ? JSON.parse(raw) : []))
        .catch(() => setPositions([]));
    }, [])
  );

  // ── Condition stable : les deux sources de données sont prêtes ────────────
  // Les mises à jour setLoading(false) et setPrices({...}) peuvent arriver
  // dans des passes de rendu distinctes ; on exige explicitement que les deux
  // soient disponibles avant d'afficher quoi que ce soit.
  const pricesReady = !loading && prices.gold !== null;
  const hasPositions = positions.length > 0;

  // ── Tous les calculs dans un useMemo — se recalcule dès que positions
  //    OU prices changent, indépendamment du flag loading.
  const portfolio = useMemo(() => {
    const goldPos = positions.filter((p) => p.metal === 'or');
    const silverPos = positions.filter((p) => p.metal === 'argent');

    const goldTotalG = goldPos.reduce((s, p) => s + p.quantity * p.weightG, 0);
    const silverTotalG = silverPos.reduce((s, p) => s + p.quantity * p.weightG, 0);
    const goldPieces = goldPos.reduce((s, p) => s + p.quantity, 0);
    const silverPieces = silverPos.reduce((s, p) => s + p.quantity, 0);

    let totalValue = 0;
    let totalCost = 0;

    for (const p of positions) {
      const spot =
        p.metal === 'or' ? prices.gold :
        p.metal === 'argent' ? prices.silver :
        p.metal === 'platine' ? prices.platinum :
        p.metal === 'palladium' ? prices.palladium :
        prices.copper;
      totalCost += p.quantity * p.purchasePrice;
      if (spot !== null) {
        totalValue += p.quantity * (p.weightG / OZ_TO_G) * spot;
      }
    }

    const totalGainLoss = totalCost > 0 ? totalValue - totalCost : null;
    const totalGainLossPct =
      totalGainLoss !== null && totalCost > 0
        ? (totalGainLoss / totalCost) * 100
        : null;

    return {
      goldTotalG, silverTotalG, goldPieces, silverPieces,
      totalValue, totalCost, totalGainLoss, totalGainLossPct,
    };
  }, [positions, prices]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.appName}>OrTrack</Text>
          <Text style={styles.title}>Tableau de bord</Text>
          <Text style={styles.subtitle}>Vue d'ensemble de votre portefeuille</Text>
        </View>

        {/* ── Valeur totale ── */}
        <View style={[styles.card, hasPositions && styles.cardHighlighted]}>
          <Text style={styles.cardLabel}>Valeur totale estimée</Text>

          {!hasPositions ? (
            // Aucune position
            <>
              <Text style={styles.cardValueLarge}>— €</Text>
              <Text style={styles.cardHint}>Ajoutez des actifs pour commencer</Text>
            </>
          ) : loading || !pricesReady ? (
            // Positions présentes mais cours en cours de chargement
            <ActivityIndicator
              size="large"
              color={OrTrackColors.gold}
              style={styles.spinnerLarge}
            />
          ) : (
            // Positions + cours disponibles
            <>
              <Text style={styles.cardValueLarge}>
                {formatEur(portfolio.totalValue)} €
              </Text>
              {portfolio.totalGainLoss !== null && (
                <View style={styles.gainRow}>
                  <Text style={[
                    styles.gainValue,
                    portfolio.totalGainLoss >= 0 ? styles.changePositive : styles.changeNegative,
                  ]}>
                    {portfolio.totalGainLoss >= 0 ? '+' : ''}
                    {formatEur(portfolio.totalGainLoss)} €
                  </Text>
                  {portfolio.totalGainLossPct !== null && (
                    <Text style={[
                      styles.gainPct,
                      portfolio.totalGainLoss >= 0 ? styles.changePositive : styles.changeNegative,
                    ]}>
                      {'  '}{portfolio.totalGainLoss >= 0 ? '+' : ''}
                      {portfolio.totalGainLossPct.toFixed(2)} %
                    </Text>
                  )}
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Or / Argent ── */}
        <View style={styles.row}>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>Or</Text>
            <Text style={styles.cardValue}>
              {hasPositions ? fmtG(portfolio.goldTotalG) : '— g'}
            </Text>
            {hasPositions && portfolio.goldPieces > 0 && (
              <Text style={styles.cardSub}>{fmtQty(portfolio.goldPieces)}</Text>
            )}
          </View>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>Argent</Text>
            <Text style={styles.cardValue}>
              {hasPositions ? fmtG(portfolio.silverTotalG) : '— g'}
            </Text>
            {hasPositions && portfolio.silverPieces > 0 && (
              <Text style={styles.cardSub}>{fmtQty(portfolio.silverPieces)}</Text>
            )}
          </View>
        </View>

        {/* ── Accès rapide alertes ── */}
        <TouchableOpacity style={styles.alertsShortcut} onPress={() => router.push('/alertes')}>
          <Text style={styles.alertsShortcutText}>🔔 Alertes de cours</Text>
          <Text style={styles.alertsShortcutArrow}>›</Text>
        </TouchableOpacity>

        {/* ── En-tête section cours ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Cours en direct</Text>
          <TouchableOpacity
            onPress={refresh}
            disabled={loading}
            style={[styles.refreshButton, loading && styles.refreshButtonDisabled]}>
            <Text style={[styles.refreshText, loading && styles.refreshTextDisabled]}>
              Actualiser
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Bandeau erreur ── */}
        {error && !loading && (
          <View style={styles.errorBanner}>
            <View style={styles.errorRow}>
              <Text style={styles.errorIcon}>!</Text>
              <Text style={styles.errorText}>{error} — Vérifiez votre connexion.</Text>
            </View>
            <TouchableOpacity onPress={refresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Cours de l'or ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Cours de l'or (XAU)</Text>
              <PriceValue value={prices.gold} loading={loading} />
            </View>
            <View style={styles.metalBadge}>
              <Text style={styles.metalBadgeText}>Au</Text>
            </View>
          </View>
        </View>

        {/* ── Cours de l'argent ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Cours de l'argent (XAG)</Text>
              <PriceValue value={prices.silver} loading={loading} />
            </View>
            <View style={[styles.metalBadge, styles.metalBadgeSilver]}>
              <Text style={[styles.metalBadgeText, styles.metalBadgeTextSilver]}>Ag</Text>
            </View>
          </View>
        </View>

        {/* ── Cours du platine ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Cours du platine (XPT)</Text>
              <PriceValue value={prices.platinum} loading={loading} />
            </View>
            <View style={[styles.metalBadge, { borderColor: '#E0E0E0' }]}>
              <Text style={[styles.metalBadgeText, { color: '#E0E0E0' }]}>Pt</Text>
            </View>
          </View>
        </View>

        {/* ── Cours du palladium ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Cours du palladium (XPD)</Text>
              <PriceValue value={prices.palladium} loading={loading} />
            </View>
            <View style={[styles.metalBadge, { borderColor: '#CBA135' }]}>
              <Text style={[styles.metalBadgeText, { color: '#CBA135' }]}>Pd</Text>
            </View>
          </View>
        </View>

        {/* ── Cours du cuivre ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Cours du cuivre (XCU)</Text>
              <PriceValue value={prices.copper} loading={loading} />
            </View>
            <View style={[styles.metalBadge, { borderColor: '#B87333' }]}>
              <Text style={[styles.metalBadgeText, { color: '#B87333' }]}>Cu</Text>
            </View>
          </View>
        </View>

        {/* ── Graphiques historique ── */}
        <PriceChart metal="gold" historyReady={historyReady} />
        <PriceChart metal="silver" historyReady={historyReady} />

        {/* ── Pied de page ── */}
        <View style={styles.footer}>
          {loading && <Text style={styles.footerText}>Récupération des cours…</Text>}
          {!loading && lastUpdated && (
            <Text style={styles.footerText}>
              {'Mis à jour à ' + formatTime(lastUpdated)}
              {'\nRafraîchissement auto toutes les 15 min'}
            </Text>
          )}
        </View>

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
    paddingBottom: 40,
  },

  // Header
  header: { marginBottom: 24 },
  appName: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
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

  // Cards
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  cardHighlighted: {
    borderColor: '#3A2E0A',
  },
  cardHalf: {
    flex: 1,
    marginBottom: 0,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardContent: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardValueLarge: {
    fontSize: 32,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  cardValueUnavailable: {
    fontSize: 22,
    fontWeight: '700',
    color: OrTrackColors.tabIconDefault,
  },
  cardHint: {
    fontSize: 12,
    color: OrTrackColors.tabIconDefault,
    marginTop: 6,
  },
  cardSub: {
    fontSize: 12,
    color: OrTrackColors.tabIconDefault,
    marginTop: 4,
  },
  spinner: {
    alignSelf: 'flex-start',
    marginVertical: 4,
  },
  spinnerLarge: {
    alignSelf: 'flex-start',
    marginVertical: 8,
  },

  // Gain/loss
  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  gainValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  gainPct: {
    fontSize: 14,
    fontWeight: '500',
  },

  changePositive: { color: '#4CAF50' },
  changeNegative: { color: '#E07070' },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  refreshButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
  },
  refreshButtonDisabled: {
    borderColor: OrTrackColors.border,
  },
  refreshText: {
    fontSize: 12,
    color: OrTrackColors.gold,
    fontWeight: '500',
  },
  refreshTextDisabled: {
    color: OrTrackColors.tabIconDefault,
  },

  // Error banner
  errorBanner: {
    backgroundColor: '#2A1A1A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#5A2020',
    padding: 14,
    marginBottom: 16,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  errorIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E07070',
    lineHeight: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#E07070',
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E07070',
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E07070',
  },

  // Metal badge
  metalBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: OrTrackColors.background,
    borderWidth: 2,
    borderColor: OrTrackColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metalBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: OrTrackColors.gold,
  },
  metalBadgeSilver: { borderColor: '#A8A8B8' },
  metalBadgeTextSilver: { color: '#A8A8B8' },

  // Alertes shortcut
  alertsShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  alertsShortcutText: {
    fontSize: 14,
    color: OrTrackColors.white,
    fontWeight: '500',
  },
  alertsShortcutArrow: {
    fontSize: 20,
    color: OrTrackColors.gold,
    fontWeight: '300',
    lineHeight: 22,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 4,
  },
  footerText: {
    fontSize: 11,
    color: OrTrackColors.tabIconDefault,
    textAlign: 'center',
    lineHeight: 18,
  },
});
