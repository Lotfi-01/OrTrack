import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { OrTrackColors } from '@/constants/theme';

const FEATURES_FREE = [
  { feature: 'Cours 5 métaux', free: '✓', premium: '✓', emoji: '📊' },
  { feature: 'Suivi portfolio',          free: '✓', premium: '✓', emoji: '💼' },
];

const FEATURES_PREMIUM = [
  { feature: 'Positions',          free: '3 max',     premium: 'Illimité',    emoji: '🪙' },
  { feature: 'Historique',         free: '1 an',      premium: '20 ans',      emoji: '📈' },
  { feature: 'Alertes',            free: '2 max',     premium: 'Illimitées',  emoji: '🔔' },
  { feature: 'Actualités métaux',  free: '2 sources', premium: '6+',          emoji: '📰' },
  { feature: 'Fiscalité',          free: 'Forfaitaire', premium: '2 régimes',  emoji: '🏛️' },
  { feature: 'Export CSV',         free: '—',         premium: '✓',           emoji: '📋' },
  { feature: 'Statistiques',       free: '—',         premium: '✓',           emoji: '📉' },
];

export default function PremiumPaywall({ onClose }: { onClose: () => void }) {
  return (
    <SafeAreaView style={{ backgroundColor: 'transparent' }} edges={['top']}>
      {/* Bouton fermer — HORS du ScrollView, toujours visible */}
      <TouchableOpacity
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: OrTrackColors.background,
          borderRadius: 18,
        }}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M18 6L6 18M6 6l12 12"
            stroke={OrTrackColors.subtext}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 52, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {/* Couronne */}
        <View style={styles.crownContainer}>
          <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
            <Path
              d="M2 8l4 12h12l4-12-5 4-5-8-5 8-5-4z"
              fill={OrTrackColors.gold}
              opacity={0.9}
            />
            <Path
              d="M6 20h12v2H6z"
              fill={OrTrackColors.gold}
              opacity={0.7}
            />
          </Svg>
        </View>

        {/* Titre + sous-titre */}
        <Text style={styles.title}>OrTrack Premium</Text>
        <Text style={styles.subtitle}>L'excellence pour vos métaux précieux</Text>

        {/* Entête tableau */}
        <View style={styles.tableHeader}>
          <View style={styles.featureCol}>
            <View style={{ width: 22 }} />
            <Text style={styles.headerLabel}>Fonctionnalité</Text>
          </View>
          <Text style={styles.headerLabelCenter}>Inclus</Text>
          <Text style={[styles.headerLabelCenter, { color: OrTrackColors.gold }]}>Premium</Text>
        </View>

        {/* Header de section Inclus */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>
            ✓  INCLUS DANS TOUS LES PLANS
          </Text>
        </View>

        {/* Lignes gratuites */}
        {FEATURES_FREE.map((item, index) => (
          <View key={`free-${index}`} style={styles.tableRow}>
            <View style={styles.featureCol}>
              <Text style={styles.emojiText}>{item.emoji}</Text>
              <Text style={styles.featureText}>{item.feature}</Text>
            </View>
            <Text style={styles.freeText}>{item.free}</Text>
            <Text style={styles.premiumText}>{item.premium}</Text>
          </View>
        ))}

        {/* Header de section Premium */}
        <View style={[styles.sectionHeader, { marginTop: 12 }]}>
          <Text style={styles.sectionHeaderText}>
            ★  AVANTAGES PREMIUM
          </Text>
        </View>

        {/* Lignes premium */}
        {FEATURES_PREMIUM.map((item, index) => (
          <View
            key={`prem-${index}`}
            style={styles.tableRow}
          >
            <View style={styles.featureCol}>
              <Text style={styles.emojiText}>{item.emoji}</Text>
              <Text style={styles.featureText}>{item.feature}</Text>
            </View>
            <Text style={styles.freeText}>{item.free}</Text>
            <Text style={styles.premiumText}>{item.premium}</Text>
          </View>
        ))}

        {/* Réassurance */}
        <Text style={styles.reassuranceText}>
          Sans engagement · Annulez à tout moment · Données privées
        </Text>

        {/* Cards tarification */}
        <View style={styles.pricingRow}>
          {/* Mensuel */}
          <View style={styles.pricingCard}>
            <Text style={styles.pricingLabel}>Mensuel</Text>
            <Text style={styles.pricingPrice}>{'2,99€'}</Text>
            <Text style={styles.pricingSub}>/mois</Text>
          </View>

          {/* Annuel */}
          <View style={[styles.pricingCard, styles.pricingCardAnnual]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{'−21€/an'}</Text>
            </View>
            <Text style={[styles.pricingLabel, { color: OrTrackColors.gold }]}>Annuel</Text>
            <Text style={styles.pricingPrice}>{'14,99€'}</Text>
            <Text style={styles.pricingSub}>/an</Text>
            <Text style={styles.pricingEquiv}>{'soit 1,25€/mois'}</Text>
          </View>
        </View>

        {/* Message passif */}
        <View style={styles.passiveContainer}>
          <View style={styles.passiveBox}>
            <Text style={styles.passiveTitle}>Bientôt disponible</Text>
            <Text style={styles.passiveBody}>
              Toutes les fonctionnalités sont gratuites pendant le lancement
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  crownContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: OrTrackColors.border,
    marginBottom: 4,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: OrTrackColors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  headerLabelCenter: {
    width: 72,
    fontSize: 10,
    fontWeight: '700',
    color: OrTrackColors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 6,
  },
  sectionHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(42,38,32,0.5)',
  },
  featureCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emojiText: {
    fontSize: 14,
    width: 22,
    textAlign: 'center',
  },
  featureText: {
    fontSize: 13,
    color: OrTrackColors.white,
    flex: 1,
  },
  freeText: {
    width: 72,
    fontSize: 12,
    color: OrTrackColors.subtext,
    textAlign: 'center',
  },
  premiumText: {
    width: 72,
    fontSize: 12,
    fontWeight: '600',
    color: OrTrackColors.gold,
    textAlign: 'center',
  },
  reassuranceText: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
    lineHeight: 16,
  },
  pricingRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pricingCard: {
    flex: 1,
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    padding: 16,
    alignItems: 'center',
  },
  pricingCardAnnual: {
    borderColor: OrTrackColors.gold,
    overflow: 'visible',
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: -8,
    backgroundColor: OrTrackColors.gold,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#12110F',
  },
  pricingLabel: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    fontWeight: '600',
    marginBottom: 8,
  },
  pricingPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: OrTrackColors.white,
  },
  pricingSub: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },
  pricingEquiv: {
    fontSize: 12,
    color: OrTrackColors.gold,
    marginTop: 4,
  },
  passiveContainer: {
    marginTop: 20,
    alignItems: 'center',
    width: '100%',
  },
  passiveBox: {
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.12)',
    alignItems: 'center',
    width: '100%',
  },
  passiveTitle: {
    fontSize: 13,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },
  passiveBody: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 16,
  },
});
