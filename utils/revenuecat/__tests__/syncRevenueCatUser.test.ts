// RP1.2 — tests syncRevenueCatWithSupabaseUser.

const mockEnsureUser = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockLogIn = jest.fn();
const mockInitRevenueCat = jest.fn();

let mockPlatformOS: string = 'android';

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args),
    logIn: (...args: unknown[]) => mockLogIn(...args),
  },
}));

jest.mock('@/utils/auth/ensureSupabaseAuthUser', () => ({
  ensureSupabaseAuthUser: (...args: unknown[]) => mockEnsureUser(...args),
}));

jest.mock('@/services/revenuecat', () => ({
  initRevenueCat: (...args: unknown[]) => mockInitRevenueCat(...args),
}));

import {
  __resetRevenueCatSyncStateForTests,
  RevenueCatSyncError,
  syncRevenueCatWithSupabaseUser,
} from '../syncRevenueCatUser';

describe('syncRevenueCatWithSupabaseUser', () => {
  beforeEach(() => {
    __resetRevenueCatSyncStateForTests();
    mockEnsureUser.mockReset();
    mockGetCustomerInfo.mockReset();
    mockLogIn.mockReset();
    mockInitRevenueCat.mockReset();
    mockPlatformOS = 'android';
  });

  test('Android, IDs alignés → pas de logIn', async () => {
    mockEnsureUser.mockResolvedValue({ id: 'user-1' });
    mockInitRevenueCat.mockResolvedValue(undefined);
    mockGetCustomerInfo.mockResolvedValue({ originalAppUserId: 'user-1' });
    await syncRevenueCatWithSupabaseUser();
    expect(mockLogIn).not.toHaveBeenCalled();
  });

  test('Android, IDs différents → logIn(auth.uid()) appelé une fois', async () => {
    mockEnsureUser.mockResolvedValue({ id: 'user-1' });
    mockInitRevenueCat.mockResolvedValue(undefined);
    mockGetCustomerInfo.mockResolvedValue({ originalAppUserId: '$RCAnonymousID:abc' });
    mockLogIn.mockResolvedValue(undefined);
    await syncRevenueCatWithSupabaseUser();
    expect(mockLogIn).toHaveBeenCalledTimes(1);
    expect(mockLogIn).toHaveBeenCalledWith('user-1');
  });

  test('appel multiple au boot → logIn une seule fois (idempotence module)', async () => {
    mockEnsureUser.mockResolvedValue({ id: 'user-1' });
    mockInitRevenueCat.mockResolvedValue(undefined);
    mockGetCustomerInfo.mockResolvedValue({ originalAppUserId: '$RCAnonymousID:abc' });
    mockLogIn.mockResolvedValue(undefined);
    await syncRevenueCatWithSupabaseUser();
    await syncRevenueCatWithSupabaseUser();
    await syncRevenueCatWithSupabaseUser();
    expect(mockLogIn).toHaveBeenCalledTimes(1);
    expect(mockGetCustomerInfo).toHaveBeenCalledTimes(1);
  });

  test('appels concurrents → une seule promesse en vol', async () => {
    mockEnsureUser.mockResolvedValue({ id: 'user-1' });
    mockInitRevenueCat.mockResolvedValue(undefined);
    let resolveCustomer: (v: unknown) => void = () => {};
    const customerPromise = new Promise<unknown>((res) => {
      resolveCustomer = res;
    });
    mockGetCustomerInfo.mockReturnValue(customerPromise);
    mockLogIn.mockResolvedValue(undefined);
    const p1 = syncRevenueCatWithSupabaseUser();
    const p2 = syncRevenueCatWithSupabaseUser();
    // Flush microtasks pour que la 1re IIFE atteigne `getCustomerInfo`.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    resolveCustomer({ originalAppUserId: 'user-1' });
    await Promise.all([p1, p2]);
    expect(mockGetCustomerInfo).toHaveBeenCalledTimes(1);
  });

  test('iOS / web : pas d appel RevenueCat (Android-only)', async () => {
    mockPlatformOS = 'ios';
    mockEnsureUser.mockResolvedValue({ id: 'user-1' });
    await syncRevenueCatWithSupabaseUser();
    expect(mockGetCustomerInfo).not.toHaveBeenCalled();
    expect(mockLogIn).not.toHaveBeenCalled();
    expect(mockInitRevenueCat).not.toHaveBeenCalled();
  });

  test('échec auth Supabase → RevenueCatSyncError, pas de logIn', async () => {
    mockEnsureUser.mockRejectedValue(new Error('anon_disabled'));
    await expect(syncRevenueCatWithSupabaseUser()).rejects.toBeInstanceOf(
      RevenueCatSyncError,
    );
    expect(mockLogIn).not.toHaveBeenCalled();
  });

  test('échec getCustomerInfo → RevenueCatSyncError, pas de hardcoding Premium', async () => {
    mockEnsureUser.mockResolvedValue({ id: 'user-1' });
    mockInitRevenueCat.mockResolvedValue(undefined);
    mockGetCustomerInfo.mockRejectedValue(new Error('rc_offline'));
    await expect(syncRevenueCatWithSupabaseUser()).rejects.toMatchObject({
      name: 'RevenueCatSyncError',
    });
    expect(mockLogIn).not.toHaveBeenCalled();
  });

  test('échec logIn → RevenueCatSyncError', async () => {
    mockEnsureUser.mockResolvedValue({ id: 'user-1' });
    mockInitRevenueCat.mockResolvedValue(undefined);
    mockGetCustomerInfo.mockResolvedValue({ originalAppUserId: '$RCAnonymousID:abc' });
    mockLogIn.mockRejectedValue(new Error('login_failed'));
    await expect(syncRevenueCatWithSupabaseUser()).rejects.toMatchObject({
      name: 'RevenueCatSyncError',
    });
  });

  test('après échec, un nouvel appel re-tente (boundOnce non figé sur erreur)', async () => {
    mockEnsureUser
      .mockRejectedValueOnce(new Error('first_fail'))
      .mockResolvedValueOnce({ id: 'user-1' });
    mockInitRevenueCat.mockResolvedValue(undefined);
    mockGetCustomerInfo.mockResolvedValue({ originalAppUserId: 'user-1' });
    await expect(syncRevenueCatWithSupabaseUser()).rejects.toBeInstanceOf(
      RevenueCatSyncError,
    );
    // Re-essai
    await expect(syncRevenueCatWithSupabaseUser()).resolves.toBeUndefined();
    expect(mockEnsureUser).toHaveBeenCalledTimes(2);
  });

  test('aucune chaîne premium=true / hardcode dans le flux', async () => {
    // Sanity check : la fonction ne doit jamais retourner ou écrire `true`/Premium.
    // Le test assert le comportement no-return uniquement.
    mockEnsureUser.mockResolvedValue({ id: 'user-1' });
    mockInitRevenueCat.mockResolvedValue(undefined);
    mockGetCustomerInfo.mockResolvedValue({ originalAppUserId: 'user-1' });
    const ret = await syncRevenueCatWithSupabaseUser();
    expect(ret).toBeUndefined();
  });
});
