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
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { PremiumProvider } from '@/contexts/premium-context';
import { trackInstall } from '@/lib/trackInstall';
import { reportError } from '@/utils/error-reporting';

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
} catch (error) {
  reportError(error, { scope: 'bootstrap', action: 'set_notification_handler' });
}

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
    } catch (error) {
      reportError(error, { scope: 'bootstrap', action: 'biometric_authenticate' });
    }
  }

  // Vérifier si l'onboarding a déjà été fait
  useEffect(() => {
    let mounted = true;

    async function loadOnboardingState() {
      try {
        const done = await AsyncStorage.getItem(STORAGE_KEYS.onboardingComplete);
        if (!mounted) return;
        needsOnboarding.current = done !== 'true';
      } catch (error) {
        reportError(error, { scope: 'bootstrap', action: 'load_onboarding_state' });
        if (!mounted) return;
        needsOnboarding.current = false;
      } finally {
        if (mounted) setReady(true);
      }
    }

    loadOnboardingState();
    return () => { mounted = false; };
  }, []);

  // Une fois le Stack monté, rediriger vers l'onboarding si nécessaire
  useEffect(() => {
    if (ready && needsOnboarding.current) {
      router.replace('/onboarding');
    }
  }, [ready]);

  // Créer le canal Android pour les notifications (après onboarding)
  useEffect(() => {
    if (!ready || needsOnboarding.current) return;
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('alerts', {
        name: 'Alertes de cours',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      }).catch(error => {
        reportError(error, { scope: 'bootstrap', action: 'set_android_notification_channel' });
      });
    }
  }, [ready]);

  // Tracker l'installation (après onboarding)
  useEffect(() => {
    if (!ready || needsOnboarding.current) return;
    trackInstall().catch(error => {
      reportError(error, { scope: 'bootstrap', action: 'track_install' });
    });
  }, [ready]);

  // Vérifier si la biométrie est activée et verrouiller si nécessaire
  useEffect(() => {
    async function checkBiometric() {
      try {
        const onboardingDone = await AsyncStorage.getItem(STORAGE_KEYS.onboardingComplete);
        if (!onboardingDone) {
          setBiometricChecked(true);
          return;
        }

        const stored = await AsyncStorage.getItem(STORAGE_KEYS.biometricEnabled);

        // Opt-in : la biométrie n'est active que si l'utilisateur l'a explicitement
        // activée dans Réglages (stored === 'true'). Clé absente = désactivé.
        if (stored !== 'true') {
          setBiometricChecked(true);
          return;
        }

        setBiometricLocked(true);
        setBiometricChecked(true);
      } catch (error) {
        reportError(error, { scope: 'bootstrap', action: 'check_biometric_setting' });
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

  if (!biometricChecked) return null;

  if (biometricLocked) {
    return <BiometricLock onRetry={handleBiometricAuth} />;
  }

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: OrTrackColors.background }} />;
  }

  return (
    <ThemeProvider value={OrTrackNavTheme}>
      <PremiumProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="fiscalite" options={{ title: 'Simulation fiscale', headerBackTitle: 'Retour' }} />
          <Stack.Screen name="statistiques" options={{ headerShown: false }} />
          <Stack.Screen name="graphique" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </PremiumProvider>
    </ThemeProvider>
  );
}
