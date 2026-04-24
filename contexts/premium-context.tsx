import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import PremiumPaywall from '@/components/premium-paywall';
import { OrTrackColors } from '@/constants/theme';
import {
  initRevenueCat,
  checkPremiumStatus,
  getOfferings,
  purchasePackage,
  restorePurchases,
  initWithTimeout,
  RC_INIT_TIMEOUT_MS,
} from '@/services/revenuecat';
import { reportError } from '@/utils/error-reporting';

import type { PurchasesPackage } from 'react-native-purchases';

// ─── Limites freemium ────────────────────────────────────────────────────────

const PREMIUM_LIMITS = {
  // Quotas gratuits appliqués quand l'entitlement Premium RevenueCat est inactif.
  maxPositions: 5,
  maxAlerts: 2,
  maxNewsSources: 2,
  freePeriods: ['1S', '1M', '3M', '1A'] as const,
};

// Hard dev-only guard. Any production build evaluates this to false regardless
// of environment variables: __DEV__ is statically replaced by the bundler.
const DEV_PREMIUM_BYPASS = __DEV__
  ? process.env.EXPO_PUBLIC_DEV_PREMIUM_BYPASS === 'true'
  : false;

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
  const [isPremium, setIsPremium] = useState(DEV_PREMIUM_BYPASS);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [offerings, setOfferings] = useState<{ monthly: PurchasesPackage | null; annual: PurchasesPackage | null }>({ monthly: null, annual: null });
  const [isPurchasing, setIsPurchasing] = useState(false);
  // v1.1: uncomment when RevenueCat is enabled
  // const purchaseInProgress = useRef(false);

  // ── Initialisation RevenueCat ────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await initRevenueCat();

        const [premiumStatus, offeringsResult] = await initWithTimeout(
          Promise.all([checkPremiumStatus(), getOfferings()]),
          RC_INIT_TIMEOUT_MS
        );

        // En dev, DEV_PREMIUM_BYPASS force Premium ; en prod, premiumStatus vient de RevenueCat.
        const effectivePremiumStatus = DEV_PREMIUM_BYPASS ? true : premiumStatus;

        if (mounted) {
          setIsPremium(effectivePremiumStatus);
          setOfferings(offeringsResult);
          setIsLoading(false);
        }
      } catch (error) {
        reportError(error, { scope: 'premium', action: 'init_premium_context' });
        if (mounted) {
          setIsPremium(DEV_PREMIUM_BYPASS);
          setIsLoading(false);
        }
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  // v1.1: uncomment when RevenueCat is enabled
  // useEffect(() => {
  //   if (!sdkReady) return;
  //   const unsubscribe = addPurchaseListener((premium) => {
  //     setIsPremium(premium);
  //   });
  //   return unsubscribe;
  // }, [sdkReady]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const showPaywall = useCallback(() => {
    setShowPaywallModal(prev => {
      if (prev) return prev;
      return true;
    });
  }, []);

  const handlePurchase = useCallback(async (_pkg: PurchasesPackage) => {
    setIsPurchasing(true);
    try {
      const result = await purchasePackage(_pkg);
      if (result.isPremium) {
        setIsPremium(true);
        setShowPaywallModal(false);
      }
    } catch (error) {
      reportError(error, { scope: 'premium', action: 'purchase_package' });
    } finally {
      setIsPurchasing(false);
    }
  }, []);

  const handleRestore = useCallback(async (): Promise<boolean> => {
    setIsPurchasing(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setIsPremium(true);
        setShowPaywallModal(false);
      }
      return restored;
    } catch (error) {
      reportError(error, { scope: 'premium', action: 'restore_purchases' });
      return false;
    } finally {
      setIsPurchasing(false);
    }
  }, []);

  const retryLoadOfferings = useCallback(async () => {
    try {
      const result = await getOfferings();
      setOfferings(result);
    } catch (error) {
      reportError(error, { scope: 'premium', action: 'retry_load_offerings' });
    }
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
