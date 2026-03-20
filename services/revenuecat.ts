import Purchases, { LOG_LEVEL, PurchasesPackage, CustomerInfo, PACKAGE_TYPE } from 'react-native-purchases';

const RC_API_KEY = process.env.EXPO_PUBLIC_RC_API_KEY;
const RC_ENTITLEMENT_ID = 'premium' as const;
export const RC_INIT_TIMEOUT_MS = 8000;

export async function initWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RC timeout')), ms)),
  ]);
}

export async function initRevenueCat(): Promise<void> {
  if (!RC_API_KEY || RC_API_KEY === 'undefined' || !RC_API_KEY.startsWith('goog_')) {
    if (__DEV__) {
      console.warn('RevenueCat: API key missing or invalid');
    } else {
      console.error('CRITICAL: RevenueCat API key missing in production');
    }
    return;
  }

  // NEVER set DEBUG in production builds
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey: RC_API_KEY });

  if (__DEV__) console.log('RevenueCat SDK initialized');
}

export async function checkPremiumStatus(): Promise<boolean> {
  try {
    const customerInfo: CustomerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[RC_ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

export async function getOfferings(): Promise<{ monthly: PurchasesPackage | null; annual: PurchasesPackage | null }> {
  try {
    const offerings = await Purchases.getOfferings();

    if (!offerings.current) {
      if (__DEV__) console.warn('RevenueCat: no current offering configured');
      return { monthly: null, annual: null };
    }

    const monthly = offerings.current.availablePackages.find(
      (p) => p.packageType === PACKAGE_TYPE.MONTHLY
    ) ?? null;

    const annual = offerings.current.availablePackages.find(
      (p) => p.packageType === PACKAGE_TYPE.ANNUAL
    ) ?? null;

    return { monthly, annual };
  } catch {
    return { monthly: null, annual: null };
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<{ success: boolean; isPremium: boolean }> {
  if (!pkg || !pkg.identifier || !pkg.product) {
    console.error('RevenueCat: invalid package');
    return { success: false, isPremium: false };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const hasPremium = customerInfo.entitlements.active[RC_ENTITLEMENT_ID] !== undefined;
    return { success: true, isPremium: hasPremium };
  } catch (e: any) {
    if (e?.userCancelled) {
      return { success: false, isPremium: false };
    }
    console.error('RevenueCat purchase error:', e);
    return { success: false, isPremium: false };
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo: CustomerInfo = await Purchases.restorePurchases();
    return customerInfo.entitlements.active[RC_ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

export function addPurchaseListener(callback: (isPremium: boolean) => void): () => void {
  const remove = Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
    callback(info.entitlements.active[RC_ENTITLEMENT_ID] !== undefined);
  });
  return typeof remove === 'function' ? remove : () => {};
}
