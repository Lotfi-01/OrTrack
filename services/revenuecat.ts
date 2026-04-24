import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  CustomerInfoUpdateListener,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  PurchasesPackage,
} from 'react-native-purchases';

export const RC_INIT_TIMEOUT_MS = 8000;

export type RevenueCatOfferings = {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
};

export async function initWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RC timeout')), ms)),
  ]);
}

function isPremiumCustomer(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active['premium']);
}

let initPromise: Promise<void> | null = null;

export function initRevenueCat(): Promise<void> {
  if (initPromise) return initPromise;

  if (Platform.OS !== 'android') {
    initPromise = Promise.resolve();
    return initPromise;
  }

  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  if (!apiKey) {
    return Promise.reject(
      new Error('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY is not set'),
    );
  }

  initPromise = (async () => {
    try {
      if (__DEV__) {
        await Purchases.setLogLevel(LOG_LEVEL.WARN);
      } else {
        await Purchases.setLogLevel(LOG_LEVEL.ERROR);
      }
      Purchases.configure({ apiKey });
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

export async function checkPremiumStatus(): Promise<boolean> {
  try {
    await initRevenueCat();
    if (Platform.OS !== 'android') return false;
    const customerInfo = await Purchases.getCustomerInfo();
    return isPremiumCustomer(customerInfo);
  } catch {
    return false;
  }
}

export async function getOfferings(): Promise<RevenueCatOfferings> {
  try {
    await initRevenueCat();
    if (Platform.OS !== 'android') return { monthly: null, annual: null };

    const offerings = await Purchases.getOfferings();
    const offering = offerings.current ?? offerings.all?.['default'] ?? null;
    if (!offering) return { monthly: null, annual: null };

    const byId = (id: string) =>
      offering.availablePackages.find(p => p.identifier === id) ?? null;

    const monthly = byId('$rc_monthly') ?? byId('monthly');
    const annual = byId('$rc_annual') ?? byId('annual');

    return { monthly, annual };
  } catch {
    return { monthly: null, annual: null };
  }
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ success: boolean; isPremium: boolean }> {
  await initRevenueCat();
  if (Platform.OS !== 'android') return { success: false, isPremium: false };

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, isPremium: isPremiumCustomer(customerInfo) };
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      ((err as { userCancelled?: boolean }).userCancelled === true ||
        (err as { code?: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
    ) {
      return { success: false, isPremium: false };
    }
    throw err;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    await initRevenueCat();
    if (Platform.OS !== 'android') return false;
    const customerInfo = await Purchases.restorePurchases();
    return isPremiumCustomer(customerInfo);
  } catch {
    return false;
  }
}

export function addPurchaseListener(
  callback: (isPremium: boolean) => void,
): () => void {
  if (Platform.OS !== 'android') return () => {};

  const listener: CustomerInfoUpdateListener = (customerInfo) => {
    callback(isPremiumCustomer(customerInfo));
  };

  Purchases.addCustomerInfoUpdateListener(listener);

  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}
