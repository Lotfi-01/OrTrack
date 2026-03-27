// RevenueCat — disabled for v1.0, will be enabled in v1.1

export const RC_INIT_TIMEOUT_MS = 8000;

export async function initWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RC timeout')), ms)),
  ]);
}

export async function initRevenueCat() {}
export async function checkPremiumStatus(): Promise<boolean> { return false; }
export async function getOfferings(): Promise<{ monthly: null; annual: null }> { return { monthly: null, annual: null }; }
export async function purchasePackage(_pkg: any): Promise<{ success: boolean; isPremium: boolean }> { return { success: false, isPremium: false }; }
export async function restorePurchases(): Promise<boolean> { return false; }
export function addPurchaseListener(_callback: (isPremium: boolean) => void): () => void { return () => {}; }
