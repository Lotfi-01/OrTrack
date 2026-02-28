import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
// Imports directs sur les sous-modules pour éviter que Metro charge index.js
// (qui re-exporte getExpoPushTokenAsync — incompatible Expo Go SDK 54)
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import scheduleNotificationAsync from 'expo-notifications/build/scheduleNotificationAsync';
import { useCallback, useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertMetal = 'or' | 'argent';
export type AlertCondition = 'above' | 'below';

export type PriceAlert = {
  id: string;
  metal: AlertMetal;
  condition: AlertCondition;
  threshold: number;          // €/oz
  active: boolean;
  createdAt: string;          // ISO
  lastTriggeredAt?: string;   // ISO — pour le cooldown
};

export const PRICE_ALERTS_KEY = '@ortrack:price_alerts';

// ─── Config interne ───────────────────────────────────────────────────────────

const API_KEY = process.env.EXPO_PUBLIC_METAL_API_KEY ?? '';
const API_URL = `https://api.metalpriceapi.com/v1/latest?api_key=${API_KEY}&base=USD&currencies=XAU,XAG,EUR`;
const COOLDOWN_MS = 60 * 60 * 1000; // 1 h entre deux déclenchements pour la même alerte

// ─── Helpers internes ─────────────────────────────────────────────────────────

async function fetchCurrentPrices(): Promise<{ gold: number; silver: number } | null> {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;
    const { XAU, XAG, EUR } = data.rates;
    return { gold: (1 / XAU) * EUR, silver: (1 / XAG) * EUR };
  } catch {
    return null;
  }
}

async function sendPriceNotification(alert: PriceAlert, currentPrice: number): Promise<void> {
  const metalLabel = alert.metal === 'or' ? 'Or' : 'Argent';
  const icon = alert.metal === 'or' ? '📈' : '📊';
  const direction = alert.condition === 'above' ? 'dépassé' : 'passé sous';
  const thresholdStr = alert.threshold.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  const priceStr = Math.round(currentPrice).toLocaleString('fr-FR');

  await scheduleNotificationAsync({
    content: {
      title: `${icon} OrTrack — Alerte ${metalLabel}`,
      body: `L'${alert.metal} vient de ${direction} ${thresholdStr} €/oz (cours actuel : ${priceStr} €/oz)`,
      sound: true,
    },
    trigger: null, // envoi immédiat
  });
}

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestNotifPermission(): Promise<boolean> {
  if (!Device.isDevice) return false; // Les simulateurs ne supportent pas les notifs
  const { status: existing } = await getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await requestPermissionsAsync();
  return status === 'granted';
}

// ─── Vérification standalone — appelée depuis _layout.tsx ─────────────────────
// Lit toujours depuis AsyncStorage pour refléter les alertes les plus récentes.

export async function checkPriceAlerts(): Promise<void> {
  const { status } = await getPermissionsAsync();
  if (status !== 'granted') return;

  const raw = await AsyncStorage.getItem(PRICE_ALERTS_KEY);
  const alerts: PriceAlert[] = raw ? JSON.parse(raw) : [];
  const active = alerts.filter((a) => a.active);
  if (active.length === 0) return;

  const prices = await fetchCurrentPrices();
  if (!prices) return;

  const now = Date.now();
  let updated = [...alerts];
  let changed = false;

  for (const alert of active) {
    // Cooldown : ignorer si déjà déclenchée récemment
    if (alert.lastTriggeredAt) {
      const last = new Date(alert.lastTriggeredAt).getTime();
      if (now - last < COOLDOWN_MS) continue;
    }

    const currentPrice = alert.metal === 'or' ? prices.gold : prices.silver;
    const triggered =
      (alert.condition === 'above' && currentPrice >= alert.threshold) ||
      (alert.condition === 'below' && currentPrice <= alert.threshold);

    if (triggered) {
      await sendPriceNotification(alert, currentPrice);
      updated = updated.map((a) =>
        a.id === alert.id ? { ...a, lastTriggeredAt: new Date().toISOString() } : a
      );
      changed = true;
    }
  }

  if (changed) {
    await AsyncStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify(updated));
  }
}

// ─── Hook React ───────────────────────────────────────────────────────────────

export function usePriceAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const [raw, perm] = await Promise.all([
        AsyncStorage.getItem(PRICE_ALERTS_KEY),
        requestNotifPermission(),
      ]);
      setAlerts(raw ? JSON.parse(raw) : []);
      setHasPermission(perm);
      setLoading(false);
    }
    init();
  }, []);

  const persist = useCallback(async (updated: PriceAlert[]) => {
    setAlerts(updated);
    await AsyncStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify(updated));
  }, []);

  const addAlert = useCallback(
    async (data: Omit<PriceAlert, 'id' | 'createdAt'>) => {
      const newAlert: PriceAlert = {
        ...data,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      };
      await persist([...alerts, newAlert]);
    },
    [alerts, persist]
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      await persist(alerts.filter((a) => a.id !== id));
    },
    [alerts, persist]
  );

  const toggleAlert = useCallback(
    async (id: string) => {
      await persist(alerts.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));
    },
    [alerts, persist]
  );

  return { alerts, hasPermission, loading, addAlert, deleteAlert, toggleAlert };
}
