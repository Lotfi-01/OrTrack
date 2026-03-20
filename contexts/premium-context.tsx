import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PurchasesPackage } from 'react-native-purchases';

import PremiumPaywall from '@/components/premium-paywall';
import { OrTrackColors } from '@/constants/theme';
import {
  initRevenueCat,
  checkPremiumStatus,
  getOfferings,
  purchasePackage,
  restorePurchases,
  addPurchaseListener,
  initWithTimeout,
  RC_INIT_TIMEOUT_MS,
} from '@/services/revenuecat';

// ─── Limites freemium ────────────────────────────────────────────────────────

const PREMIUM_LIMITS = {
  maxPositions: 3,
  maxAlerts: 2,
  maxNewsSources: 2,
  freePeriods: ['1S', '1M', '3M', '1A'] as const,
};

// ─── Types ───────────────────────────────────────────────────────────────────

type PremiumContextType = {
  isPremium: boolean;
  isLoading: boolean;
  showPaywall: () => void;
  canAddPosition: (currentCount: number) => boolean;
  canAddAlert: (currentCount: number) => boolean;
  isPeriodLocked: (period: string) => boolean;
  isSourceLocked: (sourceIndex: number) => boolean;
  limits: typeof PREMIUM_LIMITS;
  offerings: { monthly: PurchasesPackage | null; annual: PurchasesPackage | null };
  isPurchasing: boolean;
  handlePurchase: (pkg: PurchasesPackage) => Promise<void>;
  handleRestore: () => Promise<boolean>;
  retryLoadOfferings: () => Promise<void>;
};

// ─── Context ─────────────────────────────────────────────────────────────────

const PremiumContext = createContext<PremiumContextType | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [offerings, setOfferings] = useState<{ monthly: PurchasesPackage | null; annual: PurchasesPackage | null }>({ monthly: null, annual: null });
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const purchaseInProgress = useRef(false);

  // ── Initialisation RevenueCat ────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await initRevenueCat();

        if (mounted) {
          setSdkReady(true);
        }

        const [premiumStatus, offeringsResult] = await initWithTimeout(
          Promise.all([checkPremiumStatus(), getOfferings()]),
          RC_INIT_TIMEOUT_MS
        );

        if (mounted) {
          setIsPremium(premiumStatus);
          setOfferings(offeringsResult);
          setIsLoading(false);

          // Migration du flag "Me pr\u00e9venir au lancement"
          // TODO: supprimer ce bloc apr\u00e8s 2-3 mois en production
          if (premiumStatus) {
            AsyncStorage.removeItem('@ortrack:premium_notify').catch(() => {});
          } else {
            const notifyFlag = await AsyncStorage.getItem('@ortrack:premium_notify');
            if (notifyFlag === 'true') {
              setShowPaywallModal(true);
              AsyncStorage.removeItem('@ortrack:premium_notify').catch(() => {});
            }
          }
        }
      } catch {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  // ── Listener pour les mises \u00e0 jour de statut ──────────────────────────

  useEffect(() => {
    if (!sdkReady) return;
    const unsubscribe = addPurchaseListener((premium) => {
      setIsPremium(premium);
    });
    return unsubscribe;
  }, [sdkReady]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const showPaywall = useCallback(() => {
    setShowPaywallModal(prev => {
      if (prev) return prev;
      return true;
    });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePurchase = useCallback(async (pkg: PurchasesPackage) => {
    if (purchaseInProgress.current) return;
    purchaseInProgress.current = true;
    setIsPurchasing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result.isPremium) {
        setIsPremium(true);
        setShowPaywallModal(false);
      }
    } finally {
      purchaseInProgress.current = false;
      setIsPurchasing(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleRestore = useCallback(async (): Promise<boolean> => {
    if (purchaseInProgress.current) return false;
    purchaseInProgress.current = true;
    setIsPurchasing(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setIsPremium(true);
        setShowPaywallModal(false);
      }
      return restored;
    } finally {
      purchaseInProgress.current = false;
      setIsPurchasing(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const retryLoadOfferings = useCallback(async () => {
    try {
      const result = await getOfferings();
      setOfferings(result);
    } catch {}
  }, []);

  // ── Guards ───────────────────────────────────────────────────────────────

  const canAddPosition = useCallback(
    (count: number) => isPremium || count < PREMIUM_LIMITS.maxPositions,
    [isPremium],
  );

  const canAddAlert = useCallback(
    (count: number) => isPremium || count < PREMIUM_LIMITS.maxAlerts,
    [isPremium],
  );

  const isPeriodLocked = useCallback(
    (period: string) => !isPremium && !(PREMIUM_LIMITS.freePeriods as readonly string[]).includes(period),
    [isPremium],
  );

  const isSourceLocked = useCallback(
    (sourceIndex: number) => !isPremium && sourceIndex >= PREMIUM_LIMITS.maxNewsSources,
    [isPremium],
  );

  // ── Value ────────────────────────────────────────────────────────────────

  const value = useMemo<PremiumContextType>(() => ({
    isPremium,
    isLoading,
    showPaywall,
    canAddPosition,
    canAddAlert,
    isPeriodLocked,
    isSourceLocked,
    limits: PREMIUM_LIMITS,
    offerings,
    isPurchasing,
    handlePurchase,
    handleRestore,
    retryLoadOfferings,
  }), [isPremium, isLoading, showPaywall, canAddPosition,
       canAddAlert, isPeriodLocked, isSourceLocked,
       offerings, isPurchasing, handlePurchase, handleRestore, retryLoadOfferings]);

  return (
    <PremiumContext.Provider value={value}>
      <Modal
        visible={showPaywallModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPaywallModal(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <PremiumPaywall onClose={() => setShowPaywallModal(false)} />
          </View>
        </View>
      </Modal>
      {children}
    </PremiumContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

function usePremium(): PremiumContextType {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error(
    'usePremium must be used within PremiumProvider',
  );
  return ctx;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: OrTrackColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    overflow: 'hidden',
  },
});

// ─── Exports ─────────────────────────────────────────────────────────────────

export { PremiumProvider, usePremium, PREMIUM_LIMITS };
