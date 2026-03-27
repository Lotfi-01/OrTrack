import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import 'react-native-reanimated';

import BiometricLock from '@/components/BiometricLock';
import { OrTrackColors } from '@/constants/theme';
import { PremiumProvider } from '@/contexts/premium-context';
import { checkPriceAlerts } from '@/hooks/use-price-alerts';
import { trackInstall } from '@/lib/trackInstall';
import { registerForPushNotifications } from '../services/notifications';

// Afficher les notifications quand l'app est au premier plan
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  console.log('Notifications handler setup failed:', e);
}

const ONBOARDING_KEY = '@ortrack:onboarding_complete';

const OrTrackNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: OrTrackColors.gold,
    background: OrTrackColors.background,
    card: OrTrackColors.tabBar,
    text: OrTrackColors.white,
    border: OrTrackColors.border,
    notification: OrTrackColors.gold,
  },
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const needsOnboarding = useRef(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [biometricChecked, setBiometricChecked] = useState(false);

  async function handleBiometricAuth() {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Accéder à OrTrack',
        cancelLabel: 'Annuler',
        fallbackLabel: '',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setBiometricLocked(false);
      }
    } catch {
      // Echec silencieux → écran reste affiché
    }
  }

  // Vérifier si l'onboarding a déjà été fait
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
      needsOnboarding.current = done !== 'true';
      setReady(true);
    });
  }, []);

  // Une fois le Stack monté, rediriger vers l'onboarding si nécessaire
  useEffect(() => {
    if (ready && needsOnboarding.current) {
      router.replace('/onboarding');
    }
  }, [ready]);

  // Créer le canal Android + lancer la vérification des alertes toutes les 15 min
  useEffect(() => {
    if (!ready) return;

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('price-alerts', {
        name: 'Alertes de cours',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      }).catch((e) => {
        console.log('Channel setup failed:', e);
      });
    }

    const timeout = setTimeout(checkPriceAlerts, 10_000);
    const interval = setInterval(checkPriceAlerts, 15 * 60 * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [ready]);

  // Enregistrer le push token auprès de Supabase
  useEffect(() => {
    if (!ready) return;
    registerForPushNotifications().catch((e) => {
      console.log('Push registration failed:', e);
    });
  }, [ready]);

  // Tracker l'installation dans Supabase
  useEffect(() => {
    if (!ready) return;
    trackInstall();
  }, [ready]);

  // Vérifier si l'onboarding a été complété
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const complete = await AsyncStorage.getItem('@ortrack:onboarding_complete');
        if (!complete) {
          // setTimeout garantit que le navigator est prêt avant la redirection
          setTimeout(() => {
            router.replace('/onboarding');
          }, 0);
        }
      } catch (e) {
        console.log('Onboarding check error:', e);
      } finally {
        setOnboardingChecked(true);
      }
    }
    checkOnboarding();
  }, []);

  // Vérifier si la biométrie est activée et verrouiller si nécessaire
  useEffect(() => {
    async function checkBiometric() {
      try {
        // Ne pas bloquer si onboarding pas complété
        const onboardingDone = await AsyncStorage.getItem(
          '@ortrack:onboarding_complete'
        );
        if (!onboardingDone) {
          setBiometricChecked(true);
          return;
        }

        const stored = await AsyncStorage.getItem(
          '@ortrack:biometric_enabled'
        );

        // Premier lancement : détecte si disponible
        if (stored === null) {
          const compatible = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          const available = compatible && enrolled;
          await AsyncStorage.setItem(
            '@ortrack:biometric_enabled',
            available ? 'true' : 'false'
          );
          if (!available) {
            setBiometricChecked(true);
            return;
          }
        } else if (stored === 'false') {
          setBiometricChecked(true);
          return;
        }

        // Biométrie activée → verrouille et déclenche
        setBiometricLocked(true);
        setBiometricChecked(true);
      } catch {
        setBiometricChecked(true);
      }
    }
    checkBiometric();
  }, []);

  // Déclencher automatiquement la biométrie quand l'écran de verrouillage s'affiche
  useEffect(() => {
    if (biometricLocked) {
      handleBiometricAuth();
    }
  }, [biometricLocked]);

  if (!onboardingChecked) return null;
  if (!biometricChecked) return null;

  if (biometricLocked) {
    return <BiometricLock onRetry={handleBiometricAuth} />;
  }

  // Écran de chargement : fond uni pendant la vérification AsyncStorage
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: OrTrackColors.background }} />;
  }

  return (
    <ThemeProvider value={OrTrackNavTheme}>
      <PremiumProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="fiscalite" options={{ title: 'Simulation fiscale', headerBackTitle: 'Retour' }} />
          <Stack.Screen name="alertes" options={{ title: 'Alertes de cours', headerBackTitle: 'Retour' }} />
          <Stack.Screen name="statistiques" options={{ headerShown: false }} />
          <Stack.Screen name="graphique" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </PremiumProvider>
    </ThemeProvider>
  );
}
