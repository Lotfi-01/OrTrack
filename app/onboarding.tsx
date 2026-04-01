import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { OrTrackColors } from '@/constants/theme'
import { STORAGE_KEYS } from '@/constants/storage-keys'

const { width } = Dimensions.get('window')

type Slide = {
  id: number
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle: string
  isFirst: boolean
  encartIcon: keyof typeof Ionicons.glyphMap
  proofCardLabel: string
  proofCardText: string
}

const SLIDES: Slide[] = [
  {
    id: 1,
    icon: 'trending-up',
    title: 'Votre or vaut combien\naujourd\'hui ?',
    subtitle: 'Cours en direct pour l\'Or, l\'Argent,\nle Platine et le Palladium',
    isFirst: true,
    encartIcon: 'notifications-outline',
    proofCardLabel: 'Alertes personnalisables',
    proofCardText: 'Soyez notifié dès que le prix cible est atteint',
  },
  {
    id: 2,
    icon: 'wallet-outline',
    title: 'Sachez exactement\nce que vous possédez',
    subtitle: 'Lingots, pièces ou grammes\nchaque métal valorisé à l\'euro près',
    isFirst: false,
    encartIcon: 'cube-outline',
    proofCardLabel: 'Exemple de suivi',
    proofCardText: '1 Napoléon · 6,45g · valorisé en temps réel',
  },
  {
    id: 3,
    icon: 'calculator-outline',
    title: 'Simulation fiscale\nincluse',
    subtitle: 'Calculez vos plus-values et anticipez\nvotre imposition en quelques secondes',
    isFirst: false,
    encartIcon: 'checkmark-circle',
    proofCardLabel: 'Conforme au droit français',
    proofCardText: 'Régime forfaitaire et abattement inclus',
  },
]

async function completeOnboarding() {
  await AsyncStorage.setItem(STORAGE_KEYS.onboardingComplete, 'true')
  router.replace('/(tabs)')
}

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  function handleScroll(
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) {
    const index = Math.round(
      event.nativeEvent.contentOffset.x / width
    )
    if (index !== currentIndex) {
      setCurrentIndex(index)
    }
  }

  function goToNext() {
    if (currentIndex < SLIDES.length - 1) {
      const nextIndex = currentIndex + 1
      scrollRef.current?.scrollTo({
        x: nextIndex * width,
        animated: true,
      })
      setCurrentIndex(nextIndex)
    } else {
      completeOnboarding()
    }
  }

  const isLastSlide = currentIndex === SLIDES.length - 1

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={OrTrackColors.background} />

      <View style={styles.skipContainer}>
        {!isLastSlide && (
          <TouchableOpacity onPress={completeOnboarding}>
            <Text style={styles.skipText}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {SLIDES.map((slide) => (
          <View key={slide.id} style={styles.slide}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={slide.icon}
                size={64}
                color={OrTrackColors.gold}
              />
            </View>

            {slide.isFirst && (
              <Text style={styles.logo}>ORTRACK</Text>
            )}

            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>

            <View style={styles.proofCard}>
              <View style={styles.proofCardLabelRow}>
                <Ionicons
                  name={slide.encartIcon}
                  size={16}
                  color={OrTrackColors.gold}
                />
                <Text style={styles.proofCardLabel}>
                  {slide.proofCardLabel}
                </Text>
              </View>
              <Text style={styles.proofCardText}>
                {slide.proofCardText}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.pagination}>
        {SLIDES.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor:
                  index === currentIndex ? '#C9A84C' : '#2A2A2A',
                width: index === currentIndex ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.ctaContainer}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={goToNext}
        >
          <Text style={styles.ctaText}>
            {isLastSlide ? "C'est parti" : 'Suivant'}
          </Text>
          {!isLastSlide && (
            <Ionicons
              name="arrow-forward"
              size={20}
              color="#000000"
            />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OrTrackColors.background },
  skipContainer: {
    height: 44,
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  skipText: { color: '#888888', fontSize: 15 },
  scrollView: { flex: 1 },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(201, 168, 76, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  logo: {
    fontSize: 13,
    color: '#C9A84C',
    fontWeight: 'bold',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 24,
  },
  proofCard: {
    marginTop: 24,
    backgroundColor: 'rgba(201, 168, 76, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: width - 64,
  },
  proofCardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  proofCardLabel: {
    fontSize: 13,
    color: '#C9A84C',
    fontWeight: '600',
    textAlign: 'center',
  },
  proofCardText: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    columnGap: 8,
  },
  dot: { height: 8, borderRadius: 4 },
  ctaContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  ctaButton: {
    backgroundColor: '#C9A84C',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
  },
  ctaText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
})
