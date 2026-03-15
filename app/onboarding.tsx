import React, { useEffect, useRef, useState } from 'react'
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

const { width } = Dimensions.get('window')

type Slide = {
  id: number
  emoji?: string
  icon?: keyof typeof Ionicons.glyphMap
  iconColor?: string
  title: string
  subtitle: string
  isFirst: boolean
  proofCardLabel: string
  proofCardValue?: string
  proofCardText?: string
  isLivePrice?: boolean
}

const SLIDES: Slide[] = [
  {
    id: 1,
    emoji: '🏅',
    title: 'Votre or vaut combien\naujourd\'hui ?',
    subtitle: 'Suivez la valeur réelle de votre patrimoine\nen métaux précieux, en temps réel',
    isFirst: true,
    proofCardLabel: '🥇 Or — cours actuel',
    isLivePrice: true,
  },
  {
    id: 2,
    icon: 'stats-chart-outline',
    iconColor: '#C9A84C',
    title: 'Ne manquez plus jamais\nune opportunité',
    subtitle: 'Or, Argent, Platine, Palladium\nles cours en direct, actualisés en permanence',
    isFirst: false,
    proofCardLabel: '🔔 Alertes personnalisables',
    proofCardText: 'Soyez notifié dès que le prix cible est atteint',
  },
  {
    id: 3,
    emoji: '💰',
    title: 'Sachez exactement\nce que vous possédez',
    subtitle: 'Lingots, pièces ou grammes\nchaque métal valorisé à l\'euro près',
    isFirst: false,
    proofCardLabel: '📦 Exemple de suivi',
    proofCardText: '1 Napoléon · 6,45g · valorisé en temps réel',
  },
  {
    id: 4,
    icon: 'calculator-outline',
    iconColor: '#C9A84C',
    title: 'Simulation fiscale\nincluse',
    subtitle: 'Calculez vos plus-values et anticipez\nvotre imposition en quelques secondes',
    isFirst: false,
    proofCardLabel: '✅ Conforme au droit français',
    proofCardText: 'Régime forfaitaire et abattement inclus',
  },
]

async function completeOnboarding() {
  await AsyncStorage.setItem('@ortrack:onboarding_complete', 'true')
  router.replace('/(tabs)')
}

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [goldPrice, setGoldPrice] = useState<number | null>(null)
  const [goldLoading, setGoldLoading] = useState(true)

  useEffect(() => {
    async function fetchGoldPrice() {
      try {
        const res = await fetch(
          'https://api.metals.dev/v1/latest?api_key=C45MSCCNECVXIFIWN9W7609IWN9W7&currency=EUR&unit=toz'
        )
        const data = await res.json()
        if (data.status === 'success' && data.metals?.gold) {
          setGoldPrice(data.metals.gold)
        }
      } catch {
        // Fallback silencieux → prix null
      } finally {
        setGoldLoading(false)
      }
    }
    fetchGoldPrice()
  }, [])

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
            <View style={styles.emojiContainer}>
              {slide.emoji ? (
                <Text style={styles.emoji}>{slide.emoji}</Text>
              ) : (
                <Ionicons
                  name={slide.icon!}
                  size={64}
                  color={slide.iconColor}
                />
              )}
            </View>

            {slide.isFirst && (
              <Text style={styles.logo}>ORTRACK</Text>
            )}

            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>

            <View style={styles.proofCard}>
              <Text style={styles.proofCardLabel}>
                {slide.proofCardLabel}
              </Text>
              {slide.isLivePrice ? (
                goldLoading ? (
                  <Text style={styles.proofCardText}>
                    Chargement du cours...
                  </Text>
                ) : goldPrice ? (
                  <Text style={styles.proofCardValue}>
                    {goldPrice.toLocaleString('fr-FR', {
                      maximumFractionDigits: 2,
                    })} €/oz
                  </Text>
                ) : (
                  <Text style={styles.proofCardText}>
                    Cours disponible dans l'app
                  </Text>
                )
              ) : slide.proofCardText ? (
                <Text style={styles.proofCardText}>
                  {slide.proofCardText}
                </Text>
              ) : null}
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
            {isLastSlide ? 'Accéder à OrTrack' : 'Suivant'}
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
  skipText: { color: '#888888', fontSize: 14 },
  scrollView: { flex: 1 },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emojiContainer: {
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
  emoji: {
    fontSize: 64,
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
  proofCardLabel: {
    fontSize: 13,
    color: '#C9A84C',
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  proofCardValue: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: 'bold',
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
