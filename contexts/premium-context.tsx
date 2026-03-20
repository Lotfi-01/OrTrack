import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import PremiumPaywall from '@/components/premium-paywall';
import { OrTrackColors } from '@/constants/theme';

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
};

// ─── Context ─────────────────────────────────────────────────────────────────

const PremiumContext = createContext<PremiumContextType | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium] = useState(false); /* v1.1: RevenueCat ici */
  const [isLoading] = useState(false); /* v1.1: true pendant vérif RevenueCat */
  const [showPaywallModal, setShowPaywallModal] = useState(false);

  const showPaywall = useCallback(() => {
    setShowPaywallModal(prev => {
      if (prev) return prev;
      return true;
    });
  }, []);

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

  const value = useMemo<PremiumContextType>(() => ({
    isPremium,
    isLoading,
    showPaywall,
    canAddPosition,
    canAddAlert,
    isPeriodLocked,
    isSourceLocked,
    limits: PREMIUM_LIMITS,
  }), [isPremium, isLoading, showPaywall, canAddPosition,
       canAddAlert, isPeriodLocked, isSourceLocked]);

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
