export const STORAGE_KEYS = {
  positions: '@ortrack:positions',
  hidePortfolioValue: '@ortrack:hide_portfolio_value',
  onboardingComplete: '@ortrack:onboarding_complete',
  biometricEnabled: '@ortrack:biometric_enabled',
  settings: '@ortrack:settings',
  spotCache: '@ortrack:spot_cache',
  priceHistory: '@ortrack:price_history',
  historyCachePrefix: '@ortrack:history_cache_',
  notificationToken: '@ortrack:push_token',
  installTracked: '@ortrack:install_tracked',
  premiumNotify: '@ortrack:premium_notify',
  privacyMode: '@ortrack_privacy_mode',
} as const;

// Keys wiped on the local "Supprimer mes données locales" action.
// `historyCachePrefix` is a prefix, not a key: dynamic matches are resolved
// in reglages.tsx::wipeAllUserData via getAllKeys().filter(startsWith(prefix)),
// so it is intentionally NOT listed here.
export const WIPE_STORAGE_KEYS = [
  STORAGE_KEYS.positions,
  STORAGE_KEYS.hidePortfolioValue,
  STORAGE_KEYS.privacyMode,
  STORAGE_KEYS.onboardingComplete,
  STORAGE_KEYS.biometricEnabled,
  STORAGE_KEYS.settings,
  STORAGE_KEYS.spotCache,
  STORAGE_KEYS.priceHistory,
  STORAGE_KEYS.notificationToken,
  STORAGE_KEYS.installTracked,
  STORAGE_KEYS.premiumNotify,
] as const;
