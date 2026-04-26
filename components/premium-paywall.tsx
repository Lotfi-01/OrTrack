import React, { useCallback, useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { CrownIcon } from '@/components/crown-icon';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { trackEvent } from '@/services/analytics';

// ─── Constantes ──────────────────────────────────────────────────────────────

const BENEFITS = [
  {
    icon: '🏛️',
    text: 'Comparez les régimes fiscaux',
    sub: 'Comparez les estimations selon le régime applicable',
  },
  {
    icon: '🥇',
    text: 'Portefeuille illimité',
    sub: 'Ajoutez toutes vos pièces et lingots',
  },
  {
    icon: '📊',
    text: 'Statistiques avancées',
    sub: 'Analysez performance, gains et positions',
  },
];

const FEATURES = [
  { icon: '🥇', name: 'Positions', free: '5 max', premium: 'Illimité', hl: false },
  { icon: '🏛️', name: 'Fiscalité', free: 'Forfaitaire', premium: 'Comparatif', hl: true },
  { icon: '📈', name: 'Historique', free: '1 an', premium: '20 ans', hl: false },
  { icon: '🔔', name: 'Alertes', free: '2 max', premium: 'Illimitées', hl: false },
  { icon: '📰', name: 'Actualités', free: '2 sources', premium: 'Toutes', hl: false },
  { icon: '📊', name: 'Analyses', free: '—', premium: '✓', hl: false },
];

// ─── Animation helper ────────────────────────────────────────────────────────

const useStaggerAnim = (delay: number) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 550, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 550, delay, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { fade, slide };
};

// ─── Composant ───────────────────────────────────────────────────────────────

export default function PremiumPaywall({ onClose }: { onClose: () => void }) {
  const {
    isPremium,
    isLoading,
    isPurchasing,
    offerings,
    handlePurchase,
    handleRestore,
    retryLoadOfferings,
  } = usePremium();

  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const actionInProgressRef = useRef(false);
  const paywallViewedFiredRef = useRef(false);
  // Cas A : modal monté/démonté à chaque ouverture (paywall_viewed est tiré
  // au mount avec deps []). On capture le timestamp d'ouverture pour calculer
  // timeOnPaywallMs au dismiss.
  const mountedAtRef = useRef(Date.now());
  const dismissedFiredRef = useRef(false);

  // Stagger groups
  const animA = useStaggerAnim(0);
  const animB = useStaggerAnim(60);
  const animC = useStaggerAnim(100);
  const animD = useStaggerAnim(160);
  const animE = useStaggerAnim(320);

  // Glow (couronne)
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Pulse (CTA)
  const pulseAnim = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    const glowAnimation = Animated.timing(glowAnim, {
      toValue: 0.3, duration: 1000, useNativeDriver: true,
    });
    glowAnimation.start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1250, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.15, duration: 1250, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();

    return () => {
      glowAnimation.stop();
      pulseLoop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAnnual = Boolean(offerings.annual);
  const hasMonthly = Boolean(offerings.monthly);
  const selectedPackage =
    selectedPlan === 'annual' ? offerings.annual : offerings.monthly;
  const canPurchase = !isLoading && !isPurchasing && Boolean(selectedPackage);
  const offersUnavailable = !isLoading && !hasAnnual && !hasMonthly;

  useEffect(() => {
    if (!hasAnnual && hasMonthly && selectedPlan !== 'monthly') {
      setRestoreMessage(null);
      setSelectedPlan('monthly');
    }

    if (!hasMonthly && hasAnnual && selectedPlan !== 'annual') {
      setRestoreMessage(null);
      setSelectedPlan('annual');
    }
  }, [hasAnnual, hasMonthly, selectedPlan]);

  // Funnel analytics: paywall_viewed fires once per mount when the paywall is
  // visibly the non-success state. If the user is already premium we render
  // the success view above and never fire.
  useEffect(() => {
    if (paywallViewedFiredRef.current) return;
    paywallViewedFiredRef.current = true;
    void trackEvent('paywall_viewed', {
      has_monthly: hasMonthly,
      has_annual: hasAnnual,
    });
    // Intentionally fire on first mount only. Subsequent changes to
    // hasMonthly/hasAnnual after offerings load are treated as the same
    // paywall view session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrapper du onClose pour tirer paywall_dismissed avec timeOnPaywallMs.
  // Limitation : source / teaserLocation non disponibles ici (showPaywall()
  // n'accepte pas de paramètres dans le contexte Premium ; modifier le
  // contexte est hors périmètre Patch 2). Ne fire qu'une seule fois par
  // dismiss (guard dismissedFiredRef) — protection contre re-render.
  const handleDismiss = useCallback(() => {
    if (!dismissedFiredRef.current) {
      dismissedFiredRef.current = true;
      void trackEvent('paywall_dismissed', {
        timeOnPaywallMs: Date.now() - mountedAtRef.current,
      });
    }
    onClose();
  }, [onClose]);

  if (isPremium) {
    return (
      <View style={s.premiumDoneContainer}>
        <Text style={{ fontSize: 48 }}>{'✅'}</Text>
        <Text style={s.premiumDoneTitle}>Vous êtes Premium !</Text>
        <TouchableOpacity style={s.premiumDoneButton} onPress={onClose} activeOpacity={0.8}>
          <Text style={s.premiumDoneButtonText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSelectPlan = (plan: 'annual' | 'monthly') => {
    setRestoreMessage(null);
    setSelectedPlan(plan);
    void trackEvent('paywall_plan_selected', {
      plan,
      has_monthly: hasMonthly,
      has_annual: hasAnnual,
    });
  };

  const handlePurchasePress = async () => {
    if (actionInProgressRef.current || isLoading || isPurchasing || !selectedPackage) return;
    actionInProgressRef.current = true;
    try {
      setRestoreMessage(null);
      await handlePurchase(selectedPackage);
    } finally {
      actionInProgressRef.current = false;
    }
  };

  const handleRestorePress = async () => {
    if (actionInProgressRef.current || isPurchasing) return;
    actionInProgressRef.current = true;
    try {
      setRestoreMessage(null);
      const restored = await handleRestore();
      if (!restored) {
        setRestoreMessage('Aucun achat Premium trouvé.');
      }
    } finally {
      actionInProgressRef.current = false;
    }
  };

  const handleRetryPress = async () => {
    if (actionInProgressRef.current || isPurchasing || isLoading) return;
    actionInProgressRef.current = true;
    try {
      setRestoreMessage(null);
      await retryLoadOfferings();
    } finally {
      actionInProgressRef.current = false;
    }
  };

  const priceText = (pkg: typeof offerings.monthly) => {
    if (isLoading) return 'Chargement…';
    return pkg?.product.priceString ?? 'Indisponible';
  };

  const ctaLabel = isPurchasing
    ? 'Traitement en cours…'
    : isLoading
      ? 'Chargement…'
      : !selectedPackage
        ? 'Indisponible'
        : selectedPlan === 'annual'
          ? 'Continuer avec l’annuel'
          : 'Continuer avec le mensuel';

  return (
    <ScrollView
      style={{ backgroundColor: OrTrackColors.background }}
      contentContainerStyle={{ paddingBottom: 50 }}
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
      keyboardShouldPersistTaps="handled"
    >
      {/* 1. Bouton fermer */}
      <TouchableOpacity
        style={[s.closeButton, isPurchasing && s.closeButtonDisabled]}
        onPress={isPurchasing ? undefined : handleDismiss}
        disabled={isPurchasing}
        accessibilityLabel="Fermer"
        accessibilityRole="button"
        accessibilityState={{ disabled: isPurchasing }}
      >
        <View style={s.closeCircle}>
          <Text style={s.closeText}>{'✕'}</Text>
        </View>
      </TouchableOpacity>

      {/* 2. Glow effect */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', opacity: glowAnim }}
      >
        <View style={s.glowOrb} />
      </Animated.View>

      {/* 3. Hero */}
      <Animated.View style={[s.heroContainer, { opacity: animA.fade, transform: [{ translateY: animA.slide }] }]}>
        <CrownIcon />
        <Text style={s.heroTitle}>Passez à OrTrack Premium</Text>
        <Text style={s.heroSubtitle}>Suivi avancé de votre portefeuille de métaux</Text>
      </Animated.View>

      {/* 4. Preuve sociale */}
      <Animated.View style={{ opacity: animB.fade, transform: [{ translateY: animB.slide }] }}>
        <Text style={s.socialProof}>
          Pour investisseurs en métaux physiques · France
        </Text>
      </Animated.View>

      {/* 5. Bloc 3 bénéfices */}
      <Animated.View style={[s.benefitsOuter, { opacity: animC.fade, transform: [{ translateY: animC.slide }] }]}>
        <LinearGradient
          colors={['#1C1A17', 'rgba(201,168,76,0.06)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.benefitsGradient}
        >
          {BENEFITS.map((b, i) => (
            <View key={i} style={[s.benefitRow, i < BENEFITS.length - 1 && s.benefitRowBorder]}>
              <View style={s.benefitIconBox}>
                <Text style={s.benefitEmoji}>{b.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.benefitText}>{b.text}</Text>
                <Text style={s.benefitSub}>{b.sub}</Text>
              </View>
            </View>
          ))}
        </LinearGradient>
      </Animated.View>

      {/* 6. Bloc fiscal */}
      <Animated.View style={[s.fiscalOuter, { opacity: animD.fade, transform: [{ translateY: animD.slide }] }]}>
        <LinearGradient
          colors={['rgba(201,168,76,0.10)', 'rgba(201,168,76,0.03)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.fiscalGradient}
        >
          <Text style={{ fontSize: 24, flexShrink: 0 }}>💰</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.fiscalTitle}>Comparez forfaitaire et plus-value</Text>
            <Text style={s.fiscalSub}>
              Estimez votre net selon votre durée de détention. Simulation indicative.
            </Text>
          </View>
          <View style={s.fiscalBadge}>
            <Text style={s.fiscalBadgeText}>Premium</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* 7-12. Table + pricing + CTA */}
      <Animated.View style={{ opacity: animE.fade, transform: [{ translateY: animE.slide }] }}>

        {/* 7. Titre table */}
        <Text style={s.tableTitle}>Débloquez tout :</Text>

        {/* 8. Table comparative */}
        <View style={s.tableHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.tableHeaderLabel}>Fonctionnalité</Text>
          </View>
          <Text style={s.tableHeaderFree}>Gratuit</Text>
          <Text style={s.tableHeaderPremium}>Premium</Text>
        </View>

        {FEATURES.map((f, i) => {
          const isLast = i === FEATURES.length - 1;
          return (
            <View key={i} style={[s.featureRow, !isLast && s.featureRowBorder, f.hl && s.featureRowHl]}>
              <View style={s.featureNameCol}>
                <Text style={s.featureEmoji}>{f.icon}</Text>
                <Text style={[s.featureName, f.hl && s.featureNameHl]}>{f.name}</Text>
              </View>
              <Text style={[s.featureFree, f.free === '—' && s.featureFreeDash]}>{f.free}</Text>
              <View style={s.featurePremiumCol}>
                {f.premium === '✓' ? (
                  <Svg width={15} height={15} viewBox="0 0 18 18" fill="none">
                    <Path d="M4 9.5L7.5 13L14 5.5" stroke="#C9A84C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                ) : (
                  <Text style={s.featurePremiumText}>{f.premium}</Text>
                )}
              </View>
            </View>
          );
        })}

        {/* 9. Réassurance */}
        <Text style={s.reassurance}>
          Simulation indicative · Ne constitue pas un conseil fiscal
        </Text>

        {/* 10. Pricing cards */}
        <View style={s.pricingRow}>
          {/* Mensuel */}
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={hasMonthly && !isPurchasing ? 0.8 : 1}
            disabled={!hasMonthly || isPurchasing}
            onPress={() => handleSelectPlan('monthly')}
            accessibilityRole="button"
            accessibilityLabel="sélectionner mensuel"
            accessibilityState={{
              selected: selectedPlan === 'monthly' && hasMonthly,
              disabled: !hasMonthly || isPurchasing,
            }}
          >
            <View
              style={[
                s.pricingCard,
                selectedPlan === 'monthly' && hasMonthly && s.pricingCardSelected,
                (!hasMonthly || isPurchasing) && s.pricingCardDisabled,
              ]}
            >
              <Text style={s.pricingLabel}>Mensuel</Text>
              <Text style={s.pricingPrice} numberOfLines={1}>{priceText(offerings.monthly)}</Text>
              <Text style={s.pricingUnit}>/mois</Text>
              <Text style={s.pricingSub}>Facturé chaque mois</Text>
            </View>
          </TouchableOpacity>

          {/* Annuel */}
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={hasAnnual && !isPurchasing ? 0.8 : 1}
            disabled={!hasAnnual || isPurchasing}
            onPress={() => handleSelectPlan('annual')}
            accessibilityRole="button"
            accessibilityLabel="sélectionner annuel"
            accessibilityState={{
              selected: selectedPlan === 'annual' && hasAnnual,
              disabled: !hasAnnual || isPurchasing,
            }}
          >
            <View
              style={[
                s.pricingCard,
                selectedPlan === 'annual' && hasAnnual && s.pricingCardSelected,
                (!hasAnnual || isPurchasing) && s.pricingCardDisabled,
              ]}
            >
              <Text style={s.pricingLabel}>Annuel</Text>
              <Text style={s.pricingPrice} numberOfLines={1}>{priceText(offerings.annual)}</Text>
              <Text style={s.pricingUnit}>/an</Text>
              <Text style={s.pricingSub}>Facturé chaque année</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 10b. Indisponibilité offres */}
        {offersUnavailable && (
          <View style={s.offersUnavailableBlock}>
            <Text style={s.offersUnavailableText}>
              Abonnements indisponibles pour le moment.
            </Text>
            <TouchableOpacity
              style={[s.retryButton, isPurchasing && s.retryButtonDisabled]}
              onPress={handleRetryPress}
              disabled={isPurchasing}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="réessayer le chargement des abonnements"
              accessibilityState={{ disabled: isPurchasing }}
            >
              <Text style={s.retryButtonText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 11. CTA principal */}
        <View style={s.ctaContainer}>
          <Animated.View
            pointerEvents="none"
            style={[s.ctaGlow, { opacity: canPurchase ? pulseAnim : 0 }]}
          />
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handlePurchasePress}
            disabled={!canPurchase}
            style={!canPurchase && s.ctaDisabled}
            accessibilityLabel="continuer avec l'abonnement"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPurchase }}
          >
            <LinearGradient
              colors={['#C9A84C', '#A8872E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.ctaGradient}
            >
              <Text style={s.ctaText}>{ctaLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* 12. Sous-texte CTA */}
        <Text style={s.ctaSubtext}>
          Abonnement renouvelable via Google Play. Annulable à tout moment.
        </Text>

        {/* 13. Restauration */}
        <TouchableOpacity
          style={s.restoreButton}
          onPress={handleRestorePress}
          disabled={isPurchasing}
          activeOpacity={0.7}
          accessibilityLabel="restaurer un achat"
          accessibilityRole="button"
          accessibilityState={{ disabled: isPurchasing }}
        >
          <Text style={[s.restoreButtonText, isPurchasing && s.restoreButtonTextDisabled]}>
            Restaurer un achat
          </Text>
        </TouchableOpacity>

        {restoreMessage && (
          <Text style={s.restoreMessage}>{restoreMessage}</Text>
        )}

      </Animated.View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Close
  closeButton: {
    position: 'absolute', top: 14, right: 14, zIndex: 10,
  },
  closeButtonDisabled: {
    opacity: 0.5,
  },
  closeCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: 18, color: OrTrackColors.subtext },

  // Glow
  glowOrb: {
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(201,168,76,0.06)',
  },

  // Hero
  heroContainer: { alignItems: 'center', paddingTop: 38 },
  heroTitle: {
    fontSize: 23, fontWeight: '700', color: OrTrackColors.white,
    letterSpacing: -0.3, lineHeight: 29, textAlign: 'center',
    marginTop: 12,
  },
  heroSubtitle: {
    fontSize: 12, fontWeight: '600', color: OrTrackColors.gold,
    letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 5,
    textAlign: 'center', paddingHorizontal: 20,
  },

  // Social proof
  socialProof: {
    textAlign: 'center', paddingTop: 12, paddingHorizontal: 20,
    fontSize: 12, color: OrTrackColors.subtext,
  },

  // Benefits
  benefitsOuter: { marginHorizontal: 20, marginTop: 14 },
  benefitsGradient: {
    borderWidth: 1, borderColor: OrTrackColors.border, borderRadius: 14,
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 14,
  },
  benefitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8,
  },
  benefitRowBorder: {
    borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.5)',
  },
  benefitIconBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: 'rgba(201,168,76,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  benefitEmoji: { fontSize: 21 },
  benefitText: {
    fontSize: 13.5, fontWeight: '600', color: OrTrackColors.white, lineHeight: 18,
  },
  benefitSub: { fontSize: 11.5, color: OrTrackColors.subtext, marginTop: 1 },

  // Fiscal
  fiscalOuter: { marginHorizontal: 20, marginTop: 10 },
  fiscalGradient: {
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)', borderRadius: 12,
    paddingTop: 13, paddingBottom: 13, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 11,
  },
  fiscalTitle: {
    fontSize: 13, fontWeight: '700', color: OrTrackColors.gold, lineHeight: 17,
  },
  fiscalSub: {
    fontSize: 11.5, color: OrTrackColors.subtext, marginTop: 3, lineHeight: 16,
  },
  fiscalBadge: {
    backgroundColor: OrTrackColors.gold, paddingTop: 3, paddingBottom: 3,
    paddingHorizontal: 8, borderRadius: 14, flexShrink: 0,
  },
  fiscalBadgeText: {
    fontSize: 10, fontWeight: '700', color: OrTrackColors.background,
    letterSpacing: 0.3, textTransform: 'uppercase',
  },

  // Table
  tableTitle: {
    marginHorizontal: 20, marginTop: 14, marginBottom: 10,
    fontSize: 12, fontWeight: '600', color: OrTrackColors.white,
  },
  tableHeaderRow: {
    flexDirection: 'row', paddingBottom: 7, marginHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: OrTrackColors.border, marginBottom: 2,
  },
  tableHeaderLabel: {
    fontSize: 10, fontWeight: '600', color: OrTrackColors.subtext,
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
  tableHeaderFree: {
    width: 62, textAlign: 'center',
    fontSize: 10, fontWeight: '500', color: OrTrackColors.subtext,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  tableHeaderPremium: {
    width: 78, textAlign: 'center',
    fontSize: 10, fontWeight: '700', color: OrTrackColors.gold,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginHorizontal: 20,
  },
  featureRowBorder: {
    borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.3)',
  },
  featureNameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  featureEmoji: { fontSize: 15 },
  featureName: { fontSize: 12.5, fontWeight: '400', color: OrTrackColors.white },
  featureNameHl: { fontWeight: '600', color: OrTrackColors.gold },
  featureFree: { width: 62, textAlign: 'center', fontSize: 11.5, color: OrTrackColors.subtext },
  featureFreeDash: { color: '#5A5040' },
  featurePremiumCol: { width: 78, alignItems: 'center', justifyContent: 'center' },
  featurePremiumText: { fontSize: 11.5, fontWeight: '600', color: OrTrackColors.gold, textAlign: 'center' },
  featureRowHl: {
    backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 6,
  },

  // Reassurance
  reassurance: {
    textAlign: 'center', paddingTop: 10, paddingBottom: 10, paddingHorizontal: 20,
    fontSize: 11, color: OrTrackColors.subtext,
  },

  // Pricing
  pricingRow: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  pricingCard: {
    borderRadius: 12, borderWidth: 1, borderColor: OrTrackColors.border,
    backgroundColor: OrTrackColors.card,
    paddingTop: 14, paddingBottom: 14, paddingHorizontal: 8, alignItems: 'center',
    minHeight: 118,
  },
  pricingCardSelected: {
    borderColor: OrTrackColors.gold, borderWidth: 1.5,
    backgroundColor: 'rgba(201,168,76,0.06)',
  },
  pricingCardDisabled: {
    opacity: 0.45,
  },
  pricingLabel: { fontSize: 11, fontWeight: '500', color: OrTrackColors.subtext, marginBottom: 6 },
  pricingPrice: { fontSize: 22, fontWeight: '700', color: OrTrackColors.white, textAlign: 'center' },
  pricingUnit: { fontSize: 12, fontWeight: '500', color: OrTrackColors.subtext, marginTop: 2 },
  pricingSub: { fontSize: 11, color: OrTrackColors.subtext, marginTop: 6, textAlign: 'center' },

  // Offres indisponibles
  offersUnavailableBlock: {
    marginHorizontal: 20, marginTop: 12, alignItems: 'center',
  },
  offersUnavailableText: {
    fontSize: 12, color: OrTrackColors.subtext, textAlign: 'center',
  },
  retryButton: {
    marginTop: 8, borderWidth: 1, borderColor: OrTrackColors.gold,
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 18,
  },
  retryButtonDisabled: { opacity: 0.5 },
  retryButtonText: {
    fontSize: 12, fontWeight: '600', color: OrTrackColors.gold,
  },

  // CTA
  ctaContainer: { marginHorizontal: 20, marginTop: 14 },
  ctaGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(201,168,76,0.3)', borderRadius: 12,
  },
  ctaGradient: { borderRadius: 12, paddingTop: 14, paddingBottom: 14, alignItems: 'center' },
  ctaText: { fontSize: 15, fontWeight: '700', color: OrTrackColors.background },
  ctaDisabled: { opacity: 0.5 },

  // CTA subtext
  ctaSubtext: {
    textAlign: 'center', marginTop: 8, paddingHorizontal: 20, paddingBottom: 6,
    fontSize: 11.5, color: OrTrackColors.subtext, lineHeight: 16,
  },

  // Restore
  restoreButton: {
    alignSelf: 'center', marginTop: 4, paddingVertical: 10, paddingHorizontal: 16,
  },
  restoreButtonText: {
    fontSize: 12.5, fontWeight: '600', color: OrTrackColors.subtext,
    textDecorationLine: 'underline',
  },
  restoreButtonTextDisabled: { opacity: 0.5 },
  restoreMessage: {
    textAlign: 'center', marginTop: 2, paddingHorizontal: 20,
    fontSize: 11.5, color: OrTrackColors.subtext,
  },

  // Premium done
  premiumDoneContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
    backgroundColor: OrTrackColors.background,
  },
  premiumDoneTitle: { fontSize: 22, fontWeight: 'bold', color: OrTrackColors.gold, marginTop: 16 },
  premiumDoneButton: {
    backgroundColor: OrTrackColors.gold, borderRadius: 14,
    paddingTop: 16, paddingBottom: 16, paddingHorizontal: 48, marginTop: 24,
  },
  premiumDoneButtonText: { color: OrTrackColors.background, fontWeight: 'bold', fontSize: 16 },
});
