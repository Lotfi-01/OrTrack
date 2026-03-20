import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';

import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';

type FeatureRow = {
  feature: string;
  free: string;
  premium: string;
  icon: keyof typeof Ionicons.glyphMap;
  freeIsCheck?: boolean;
  premiumIsCheck?: boolean;
};

const FEATURES: FeatureRow[] = [
  { feature: 'Positions',         free: '3 max',       premium: 'Illimit\u00e9',   icon: 'layers-outline' },
  { feature: 'Historique',        free: '1 an',        premium: '20 ans',           icon: 'trending-up-outline' },
  { feature: 'Alertes',           free: '2 max',       premium: 'Illimit\u00e9es', icon: 'notifications-outline' },
  { feature: 'Actualit\u00e9s m\u00e9taux', free: '2 sources', premium: '6+',     icon: 'newspaper-outline' },
  { feature: 'Fiscalit\u00e9',   free: 'Forfaitaire', premium: '2 r\u00e9gimes',  icon: 'business-outline' },
  { feature: 'Export CSV',        free: '\u2014',       premium: 'check',           icon: 'download-outline', premiumIsCheck: true },
  { feature: 'Statistiques',      free: '\u2014',       premium: 'check',           icon: 'stats-chart-outline', premiumIsCheck: true },
];

export default function PremiumPaywall({ onClose }: { onClose: () => void }) {
  const { offerings, isPurchasing, handlePurchase, handleRestore, retryLoadOfferings, isPremium } = usePremium();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Guard : d\u00e9j\u00e0 Premium
  if (isPremium) {
    return (
      <SafeAreaView style={{ backgroundColor: 'transparent', flex: 1 }} edges={['top']}>
        <View style={styles.premiumDoneContainer}>
          <Ionicons name="checkmark-circle" size={48} color={OrTrackColors.gold} />
          <Text style={styles.premiumDoneTitle}>Vous \u00eates Premium !</Text>
          <TouchableOpacity style={styles.premiumDoneButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.premiumDoneButtonText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasOfferings = offerings.monthly !== null || offerings.annual !== null;
  const selectedPkg = selectedPlan === 'annual' ? offerings.annual : offerings.monthly;

  const handleSubscribe = () => {
    if (!selectedPkg) return;
    handlePurchase(selectedPkg);
  };

  const handleRestorePress = async () => {
    setIsRestoring(true);
    const restored = await handleRestore();
    setIsRestoring(false);
    if (!restored) {
      Alert.alert('Aucun abonnement trouv\u00e9', "Aucun achat Premium n'a \u00e9t\u00e9 trouv\u00e9 sur ce compte.");
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await retryLoadOfferings();
    setIsRetrying(false);
  };

  const ctaDisabled = isPurchasing;

  return (
    <SafeAreaView style={{ backgroundColor: 'transparent' }} edges={['top']}>
      {/* Bouton fermer */}
      <TouchableOpacity
        onPress={isPurchasing ? undefined : onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={[styles.closeButton, isPurchasing && { opacity: 0.4 }]}
        disabled={isPurchasing}
      >
        <Ionicons name="close" size={22} color={OrTrackColors.subtext} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 52, paddingBottom: 80 }}
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
        <Text style={styles.subtitle}>Tout votre patrimoine m{'\u00e9'}taux. Sans limite.</Text>

        {/* Entete tableau */}
        <View style={styles.tableHeader}>
          <View style={styles.featureCol}>
            <View style={{ width: 22 }} />
            <Text style={styles.headerLabel}>Fonctionnalit{'\u00e9'}</Text>
          </View>
          <Text style={styles.headerLabelCenter}>Gratuit</Text>
          <Text style={[styles.headerLabelCenter, { color: OrTrackColors.gold }]}>Premium</Text>
        </View>

        {/* Section Avantages Premium */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>
            AVANTAGES PREMIUM
          </Text>
        </View>

        {/* Lignes du tableau */}
        {FEATURES.map((item, index) => (
          <View
            key={index}
            style={[
              styles.tableRow,
              index % 2 === 0 && styles.tableRowEven,
            ]}
          >
            <View style={styles.featureCol}>
              <View style={styles.iconCell}>
                <Ionicons name={item.icon} size={20} color={OrTrackColors.gold} />
              </View>
              <Text style={styles.featureText}>{item.feature}</Text>
            </View>
            {item.freeIsCheck ? (
              <View style={styles.checkCell}>
                <Ionicons name="checkmark" size={16} color={OrTrackColors.subtext} />
              </View>
            ) : (
              <Text style={styles.freeText}>{item.free}</Text>
            )}
            {item.premiumIsCheck ? (
              <View style={styles.checkCell}>
                <Ionicons name="checkmark" size={16} color={OrTrackColors.gold} />
              </View>
            ) : (
              <Text style={styles.premiumText}>{item.premium}</Text>
            )}
          </View>
        ))}

        {/* Reassurance */}
        <Text style={styles.reassuranceText}>
          Sans engagement {'\u00b7'} Annulez {'\u00e0'} tout moment {'\u00b7'} Donn{'\u00e9'}es priv{'\u00e9'}es
        </Text>

        {/* Cards tarification */}
        <View style={styles.pricingRow}>
          {/* Mensuel */}
          <TouchableOpacity
            style={[
              styles.pricingCard,
              selectedPlan === 'monthly' && styles.pricingCardSelected,
            ]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.7}
          >
            <Text style={styles.pricingLabel}>Mensuel</Text>
            <Text style={styles.pricingPrice}>
              {offerings.monthly?.product.priceString ?? '2,99\u20AC'}
            </Text>
            <Text style={styles.pricingSub}>/mois</Text>
          </TouchableOpacity>

          {/* Annuel */}
          <TouchableOpacity
            style={[
              styles.pricingCard,
              styles.pricingCardAnnual,
              selectedPlan === 'annual' && styles.pricingCardSelected,
            ]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.7}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{'\u221221\u20AC/an'}</Text>
            </View>
            <Text style={[styles.pricingLabel, { color: OrTrackColors.gold }]}>Annuel</Text>
            <Text style={styles.pricingPrice}>
              {offerings.annual?.product.priceString ?? '14,99\u20AC'}
            </Text>
            <Text style={styles.pricingSub}>/an</Text>
            <Text style={styles.pricingEquiv}>{'soit 1,25\u20AC/mois'}</Text>
          </TouchableOpacity>
        </View>

        {/* CTA S'abonner */}
        <View style={{ marginTop: 20 }}>
          {hasOfferings ? (
            <TouchableOpacity
              style={[styles.ctaButton, ctaDisabled && { opacity: 0.6 }]}
              onPress={ctaDisabled ? undefined : handleSubscribe}
              disabled={ctaDisabled}
              activeOpacity={0.8}
            >
              {isPurchasing && !isRestoring ? (
                <ActivityIndicator color="#12110F" />
              ) : (
                <Text style={styles.ctaText}>
                  S'abonner {'\u00b7'} {selectedPlan === 'annual'
                    ? (offerings.annual?.product.priceString ?? '14,99\u20AC') + ' / an'
                    : (offerings.monthly?.product.priceString ?? '2,99\u20AC') + ' / mois'}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.ctaRetryButton, isRetrying && { opacity: 0.6 }]}
              onPress={isRetrying ? undefined : handleRetry}
              disabled={isRetrying}
              activeOpacity={0.8}
            >
              {isRetrying ? (
                <ActivityIndicator color={OrTrackColors.gold} />
              ) : (
                <Text style={styles.ctaRetryText}>R{'\u00e9'}essayer</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Restaurer */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={ctaDisabled ? undefined : handleRestorePress}
          disabled={ctaDisabled}
          activeOpacity={0.7}
        >
          <Text style={[styles.restoreText, (isRestoring || ctaDisabled) && { opacity: 0.6 }]}>
            {isRestoring ? 'Restauration...' : 'Restaurer mes achats'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OrTrackColors.card,
    borderRadius: 18,
  },
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
  tableRowEven: {
    backgroundColor: 'rgba(201,168,76,0.04)',
  },
  featureCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCell: {
    width: 22,
    alignItems: 'center',
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
  checkCell: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
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
    overflow: 'visible',
  },
  pricingCardSelected: {
    borderColor: OrTrackColors.gold,
    backgroundColor: 'rgba(201,168,76,0.06)',
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
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: OrTrackColors.gold,
    borderRadius: 14,
    paddingVertical: 16,
  },
  ctaText: {
    color: '#12110F',
    fontWeight: 'bold',
    fontSize: 16,
  },
  ctaRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OrTrackColors.card,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: OrTrackColors.gold,
  },
  ctaRetryText: {
    color: OrTrackColors.gold,
    fontWeight: 'bold',
    fontSize: 16,
  },
  restoreButton: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 13,
    color: OrTrackColors.subtext,
  },
  premiumDoneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  premiumDoneTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: OrTrackColors.gold,
    marginTop: 16,
  },
  premiumDoneButton: {
    backgroundColor: OrTrackColors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginTop: 24,
  },
  premiumDoneButtonText: {
    color: '#12110F',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
