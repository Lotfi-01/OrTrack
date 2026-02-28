import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
// Imports directs sur les sous-modules pour éviter que Metro charge index.js
// (qui re-exporte getExpoPushTokenAsync — incompatible Expo Go SDK 54)
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import 'react-native-reanimated';

import { OrTrackColors } from '@/constants/theme';
import { checkPriceAlerts } from '@/hooks/use-price-alerts';

// Afficher les notifications quand l'app est au premier plan
setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ONBOARDING_KEY = '@ortrack:onboarding_done';

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
      setNotificationChannelAsync('price-alerts', {
        name: 'Alertes de cours',
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    // Première vérification après 10 s (laisse le temps à l'app de démarrer)
    const timeout = setTimeout(checkPriceAlerts, 10_000);
    const interval = setInterval(checkPriceAlerts, 15 * 60 * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [ready]);

  // Écran de chargement : fond uni pendant la vérification AsyncStorage
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: OrTrackColors.background }} />;
  }

  return (
    <ThemeProvider value={OrTrackNavTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="fiscalite" options={{ title: 'Simulation fiscale', headerBackTitle: 'Retour' }} />
        <Stack.Screen name="alertes" options={{ title: 'Alertes de cours', headerBackTitle: 'Retour' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
