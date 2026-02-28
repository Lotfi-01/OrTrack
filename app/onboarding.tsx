import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrTrackColors } from '@/constants/theme';

// ─── Constantes ───────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const ONBOARDING_KEY = '@ortrack:onboarding_done';

type Slide = { emoji: string; title: string; subtitle: string };

const SLIDES: Slide[] = [
  {
    emoji: '🥇',
    title: 'Bienvenue sur OrTrack',
    subtitle:
      'Le compagnon idéal pour suivre votre patrimoine en métaux précieux physiques',
  },
  {
    emoji: '📊',
    title: 'Cours en temps réel',
    subtitle:
      "Prix de l'or et de l'argent mis à jour automatiquement. Votre portefeuille valorisé à la seconde près.",
  },
  {
    emoji: '🏛️',
    title: 'Optimisation fiscale française',
    subtitle:
      'Simulez votre imposition avant chaque vente. Choisissez le meilleur régime fiscal automatiquement.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function finishOnboarding() {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  router.replace('/(tabs)');
}

// ─── Écran ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    []
  );

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ animated: true, index: activeIndex + 1 });
    }
  };

  const isLast = activeIndex === SLIDES.length - 1;

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Barre supérieure : bouton Passer */}
      <View style={styles.topBar}>
        {!isLast ? (
          <TouchableOpacity
            onPress={finishOnboarding}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            style={styles.skipBtn}>
            <Text style={styles.skipText}>Passer</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={styles.list}
        renderItem={({ item, index }) => (
          <View style={styles.slide}>
            {/* Cercle décoratif de fond */}
            <View style={styles.bgCircle} />

            {/* Icône */}
            <View style={styles.emojiCircle}>
              <Text style={styles.emojiText}>{item.emoji}</Text>
            </View>

            {/* Numéro de slide discret */}
            <Text style={styles.slideCounter}>{index + 1} / {SLIDES.length}</Text>

            {/* Textes */}
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      {/* Bas : points de pagination + bouton */}
      <View style={styles.bottom}>
        {/* Points */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        {/* Bouton Suivant / Commencer */}
        <TouchableOpacity
          style={[styles.btn, isLast ? styles.btnGold : styles.btnOutline]}
          onPress={isLast ? finishOnboarding : goNext}
          activeOpacity={0.82}>
          <Text style={[styles.btnLabel, isLast ? styles.btnLabelDark : styles.btnLabelLight]}>
            {isLast ? 'Commencer' : 'Suivant'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { background, gold, white, card, border, subtext } = OrTrackColors;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: background,
  },

  // Top bar
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
  },
  skipBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  skipText: {
    fontSize: 15,
    color: subtext,
    fontWeight: '500',
  },

  // FlatList
  list: { flex: 1 },

  // Slide
  slide: {
    width: SCREEN_W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 16,
  },

  // Cercle décoratif de fond
  bgCircle: {
    position: 'absolute',
    top: '10%',
    width: SCREEN_W * 0.85,
    height: SCREEN_W * 0.85,
    borderRadius: SCREEN_W * 0.425,
    backgroundColor: '#14142A',
    borderWidth: 1,
    borderColor: '#1E1E38',
    opacity: 0.7,
  },

  // Emoji
  emojiCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#1F1B0A',
    borderWidth: 2,
    borderColor: gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    // Halo doré
    shadowColor: gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  emojiText: {
    fontSize: 58,
  },

  // Compteur de slide
  slideCounter: {
    fontSize: 11,
    color: subtext,
    letterSpacing: 1.5,
    marginBottom: 28,
    fontWeight: '500',
    opacity: 0.6,
  },

  // Textes
  slideTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: white,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  slideSubtitle: {
    fontSize: 16,
    color: subtext,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 320,
  },

  // Bas
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 24,
    gap: 20,
  },

  // Points
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 28,
    backgroundColor: gold,
  },
  dotInactive: {
    width: 8,
    backgroundColor: border,
    opacity: 0.55,
  },

  // Bouton
  btn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnGold: {
    backgroundColor: gold,
    shadowColor: gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  btnOutline: {
    backgroundColor: card,
    borderWidth: 1,
    borderColor: border,
  },
  btnLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnLabelDark: {
    color: '#1A1A2E',
  },
  btnLabelLight: {
    color: white,
  },
});
