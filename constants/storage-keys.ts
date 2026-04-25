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
  privacyMode: '@ortrack_privacy_mode',
  // Logical name for the analytics device identifier. SecureStore on iOS
  // rejects ':' and '@' in keys, so the *physical* key actually persisted in
  // SecureStore is `ANALYTICS_DEVICE_SECURE_STORE_KEY` below — not this
  // string. This logical entry is kept so app-wide tooling (settings menus,
  // documentation, log scopes) can refer to the analytics device identifier
  // by a consistent name.
  analyticsDeviceId: '@ortrack:analytics_device_id',
  analyticsInstallId: '@ortrack:analytics_install_id',
} as const;

// Physical SecureStore key actually used by `services/analytics/identity.ts`.
// Exported here as the single source of truth so the local-wipe routine can
// target the exact key SecureStore was written to. Do not change without a
// migration: existing installs will have their device id under this key.
export const ANALYTICS_DEVICE_SECURE_STORE_KEY = 'ortrack_analytics_device_id';

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
  STORAGE_KEYS.analyticsInstallId,
  // Legacy pre-RevenueCat flag. Not an active STORAGE_KEYS entry.
  // Kept only for local data wipe.
  '@ortrack:premium_notify',
] as const;

// Keys wiped from SecureStore on the local "Supprimer mes données locales"
// action. SecureStore is a separate backend from AsyncStorage and must be
// cleared explicitly, otherwise persistent identifiers like the analytics
// device ID survive a local wipe. These are the *physical* SecureStore keys,
// not the logical app-storage names from STORAGE_KEYS.
export const WIPE_SECURE_STORAGE_KEYS = [
  ANALYTICS_DEVICE_SECURE_STORE_KEY,
] as const;
