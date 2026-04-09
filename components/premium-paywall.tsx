import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { CrownIcon } from '@/components/crown-icon';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';

// ─── Constantes ──────────────────────────────────────────────────────────────

const BENEFITS = [
  { icon: '\uD83C\uDFDB\uFE0F', text: "Payez moins d'impôts sur vos ventes", sub: 'Identifiez le régime le moins taxé' },
  { icon: '\uD83E\uDD47', text: 'Portefeuille illimité', sub: 'Napoléons, Krugerrands, lingots…' },
  { icon: '\uD83D\uDCC8', text: 'Suivez vos gains en temps réel', sub: 'Historique 20 ans + stats détaillées' },
];

const FEATURES = [
  { icon: '\uD83E\uDD47', name: 'Positions', free: '3 max', premium: 'Illimité', hl: false },
  { icon: '\uD83C\uDFDB\uFE0F', name: 'Fiscalité', free: 'Forfaitaire', premium: 'Comparatif', hl: true },
  { icon: '\uD83D\uDCC8', name: 'Historique', free: '1 an', premium: '20 ans', hl: false },
  { icon: '\uD83D\uDD14', name: 'Alertes', free: '2 max', premium: 'Illimitées', hl: false },
  { icon: '\uD83D\uDCF0', name: 'Actualités', free: '2 sources', premium: 'Toutes', hl: false },
  { icon: '\uD83D\uDCCA', name: 'Statistiques', free: '—', premium: '✓', hl: false },
  { icon: '\uD83D\uDCCB', name: 'Export CSV', free: '—', premium: '✓', hl: false },
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

// ─── Source de vérité produit ────────────────────────────────────────────────

type PremiumReleaseMode = 'launch_free' | 'waitlist';
const PREMIUM_RELEASE_MODE: PremiumReleaseMode = 'launch_free';

// ─── Composant ──────────────────────────────────────────────────────────────

export default function PremiumPaywall({ onClose }: { onClose: () => void }) {
  const { isPremium, activateLaunchFree } = usePremium();

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

  // v1.1: this guard will work when RevenueCat is enabled
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
        style={s.closeButton}
        onPress={onClose}
        accessibilityLabel="Fermer"
        accessibilityRole="button"
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
        <Text style={s.heroTitle}>Suivez votre or. Vendez au bon moment.</Text>
        <Text style={s.heroSubtitle}>OrTrack Premium</Text>
      </Animated.View>

      {/* 4. Preuve sociale */}
      <Animated.View style={{ opacity: animB.fade, transform: [{ translateY: animB.slide }] }}>
        <Text style={s.socialProof}>
          Pour investisseurs en métaux physiques · France, Belgique, Suisse
        </Text>
      </Animated.View>

      {/* 4b. Statut produit */}
      <Animated.View style={[s.launchBanner, { opacity: animB.fade, transform: [{ translateY: animB.slide }] }]}>
        <Text style={s.launchBannerTitle}>Gratuit pendant le lancement</Text>
        <Text style={s.launchBannerSub}>
          Activez toutes les fonctionnalités Premium sans frais pendant la phase de lancement.
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

      {/* 6. Bloc fiscal killer */}
      <Animated.View style={[s.fiscalOuter, { opacity: animD.fade, transform: [{ translateY: animD.slide }] }]}>
        <LinearGradient
          colors={['rgba(201,168,76,0.10)', 'rgba(201,168,76,0.03)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.fiscalGradient}
        >
          <Text style={{ fontSize: 24, flexShrink: 0 }}>💰</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.fiscalTitle}>Évitez de payer trop d’impôts</Text>
            <Text style={s.fiscalSub}>
              Jusqu’à plusieurs centaines d’euros d’écart entre les régimes. Trouvez le moins taxé en 1 clic.
            </Text>
          </View>
          <View style={s.fiscalBadge}>
            <Text style={s.fiscalBadgeText}>Exclu</Text>
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
        <Text style={s.reassurance}>Fiscalité française officielle 2026</Text>

        {/* 10. Pricing cards — informational */}
        <Text style={s.pricingFutureLabel}>Tarifs après lancement</Text>
        <View style={s.pricingRow}>
          {/* Mensuel */}
          <View style={{ flex: 1 }}>
            <View style={s.pricingCard}>
              <Text style={s.pricingLabel}>Mensuel</Text>
              <Text style={s.pricingPrice}>2,99€</Text>
              <Text style={s.pricingSub}>/mois</Text>
            </View>
          </View>

          {/* Annuel */}
          <View style={{ flex: 1 }}>
            <View style={s.pricingCardAnnual}>
              <View style={s.badgeDiscount}><Text style={s.badgeDiscountText}>{'−21€/an'}</Text></View>
              <Text style={s.pricingLabel}>Annuel</Text>
              <Text style={s.pricingPrice}>14,99€</Text>
              <Text style={s.pricingSub}>/an {'·'} soit 1,25€/mois</Text>
              <Text style={s.pricingMostChosen}>Le plus choisi</Text>
            </View>
          </View>
        </View>

        {/* 11. CTA */}
        <View style={s.ctaContainer}>
          <Animated.View
            pointerEvents="none"
            style={[s.ctaGlow, { opacity: pulseAnim }]}
          />
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={activateLaunchFree}
            accessibilityLabel="Activer l'accès complet"
            accessibilityRole="button"
          >
            <LinearGradient
              colors={['#C9A84C', '#A8872E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.ctaGradient}
            >
              <Text style={s.ctaText}>Activer l{'\u2019'}accès complet</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* 12. Sous-texte CTA */}
        <Text style={s.ctaSubtext}>
          Aucun paiement pendant le lancement
        </Text>

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

  // Launch banner
  launchBanner: {
    marginHorizontal: 20, marginTop: 12,
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    alignItems: 'center',
  },
  launchBannerTitle: {
    fontSize: 13, fontWeight: '700', color: OrTrackColors.gold,
  },
  launchBannerSub: {
    fontSize: 11.5, color: OrTrackColors.subtext, textAlign: 'center', marginTop: 3, lineHeight: 16,
  },

  // Pricing
  pricingFutureLabel: {
    textAlign: 'center', marginTop: 14, marginBottom: 2,
    fontSize: 11, fontWeight: '600', color: OrTrackColors.subtext,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pricingRow: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  pricingCard: {
    borderRadius: 12, borderWidth: 1, borderColor: OrTrackColors.border,
    backgroundColor: OrTrackColors.card,
    paddingTop: 14, paddingBottom: 14, paddingHorizontal: 8, alignItems: 'center',
    opacity: 0.6,
  },
  pricingCardAnnual: {
    borderRadius: 12, borderWidth: 1, borderColor: OrTrackColors.border,
    backgroundColor: OrTrackColors.card,
    paddingTop: 20, paddingBottom: 14, paddingHorizontal: 8, alignItems: 'center',
    opacity: 0.6,
  },
  pricingLabel: { fontSize: 11, fontWeight: '500', color: OrTrackColors.subtext, marginBottom: 3 },
  pricingPrice: { fontSize: 24, fontWeight: '700', color: OrTrackColors.white },
  pricingSub: { fontSize: 11, color: OrTrackColors.subtext, marginTop: 2 },
  pricingMostChosen: { fontSize: 10, color: OrTrackColors.gold, opacity: 0.7, marginTop: 4 },
  badgeDiscount: {
    position: 'absolute', top: -9, right: -4,
    backgroundColor: OrTrackColors.gold,
    paddingTop: 2, paddingBottom: 2, paddingHorizontal: 8, borderRadius: 14,
  },
  badgeDiscountText: { fontSize: 10, fontWeight: '700', color: OrTrackColors.background },

  // CTA
  ctaContainer: { marginHorizontal: 20, marginTop: 6 },
  ctaGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(201,168,76,0.3)', borderRadius: 12,
  },
  ctaGradient: { borderRadius: 12, paddingTop: 14, paddingBottom: 14, alignItems: 'center' },
  ctaText: { fontSize: 15, fontWeight: '700', color: OrTrackColors.background },

  // CTA subtext
  ctaSubtext: {
    textAlign: 'center', marginTop: 8, paddingHorizontal: 20, paddingBottom: 10,
    fontSize: 11.5, color: OrTrackColors.subtext, lineHeight: 16,
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
