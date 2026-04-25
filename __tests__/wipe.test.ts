jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>()

  return {
    __store: store,
    getAllKeys: jest.fn(async () => Array.from(store.keys())),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => {
      store.delete(key)
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach(key => store.delete(key))
    }),
  }
})

jest.mock('expo-secure-store', () => {
  const secureStore = new Map<string, string>()

  return {
    __secureStore: secureStore,
    getItemAsync: jest.fn(async (key: string) => secureStore.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      secureStore.set(key, value)
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      secureStore.delete(key)
    }),
  }
})

jest.mock('@/services/analytics', () => ({
  resetAnalyticsIdentityCache: jest.fn(),
  resetAnalyticsQueue: jest.fn(),
}))

jest.mock('@/hooks/use-positions', () => ({
  awaitPendingPositionWrites: jest.fn(async () => {}),
  resetPositionsCache: jest.fn(),
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

import {
  ANALYTICS_DEVICE_SECURE_STORE_KEY,
  STORAGE_KEYS,
  WIPE_SECURE_STORAGE_KEYS,
  WIPE_STORAGE_KEYS,
} from '../constants/storage-keys'
import {
  resetAnalyticsIdentityCache,
  resetAnalyticsQueue,
} from '@/services/analytics'
import {
  awaitPendingPositionWrites,
  resetPositionsCache,
} from '@/hooks/use-positions'
import { runLocalDataWipe } from '../lib/local-wipe'

const storageMock = AsyncStorage as typeof AsyncStorage & {
  __store: Map<string, string>
}
const secureStoreMock = SecureStore as typeof SecureStore & {
  __secureStore: Map<string, string>
}

describe('local data wipe', () => {
  beforeEach(() => {
    storageMock.__store.clear()
    secureStoreMock.__secureStore.clear()
    jest.clearAllMocks()
  })

  it('removes every AsyncStorage-backed STORAGE_KEYS value', async () => {
    // Seed AsyncStorage only with the keys actually persisted there in
    // production. SecureStore-only keys (analyticsDeviceId) are not seeded
    // because they never live in AsyncStorage.
    const asyncStorageBackedKeys = (Object.keys(STORAGE_KEYS) as Array<keyof typeof STORAGE_KEYS>)
      .filter(name => name !== 'analyticsDeviceId' && name !== 'historyCachePrefix')

    await Promise.all(
      asyncStorageBackedKeys.map(name =>
        AsyncStorage.setItem(STORAGE_KEYS[name], 'value'),
      ),
    )
    await AsyncStorage.setItem(`${STORAGE_KEYS.historyCachePrefix}1M_EUR_gold`, 'cached')

    await runLocalDataWipe()

    await Promise.all(
      asyncStorageBackedKeys.map(async name => {
        await expect(AsyncStorage.getItem(STORAGE_KEYS[name])).resolves.toBeNull()
      }),
    )
    await expect(
      AsyncStorage.getItem(`${STORAGE_KEYS.historyCachePrefix}1M_EUR_gold`),
    ).resolves.toBeNull()
  })

  it('removes privacyMode', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.privacyMode, 'true')

    await runLocalDataWipe()

    await expect(AsyncStorage.getItem(STORAGE_KEYS.privacyMode)).resolves.toBeNull()
  })

  it('deletes the analytics device id from SecureStore using the physical key', async () => {
    await SecureStore.setItemAsync(
      ANALYTICS_DEVICE_SECURE_STORE_KEY,
      'persistent-device-id-1234567890',
    )

    await runLocalDataWipe()

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      ANALYTICS_DEVICE_SECURE_STORE_KEY,
    )
    await expect(
      SecureStore.getItemAsync(ANALYTICS_DEVICE_SECURE_STORE_KEY),
    ).resolves.toBeNull()
  })

  it('does not target the legacy AsyncStorage-style key for SecureStore', async () => {
    // Regression: the wipe must NOT call SecureStore.deleteItemAsync with the
    // logical AsyncStorage-style name `@ortrack:analytics_device_id` — that
    // would silently miss the actual SecureStore entry.
    await runLocalDataWipe()

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith(
      STORAGE_KEYS.analyticsDeviceId,
    )
  })

  it('uses ortrack_analytics_device_id as the physical SecureStore key', () => {
    expect(ANALYTICS_DEVICE_SECURE_STORE_KEY).toBe('ortrack_analytics_device_id')
    expect(WIPE_SECURE_STORAGE_KEYS).toContain(ANALYTICS_DEVICE_SECURE_STORE_KEY)
  })

  it('does not put SecureStore-only keys in WIPE_STORAGE_KEYS', () => {
    const asyncStorageWipeSet = new Set<string>(WIPE_STORAGE_KEYS as readonly string[])
    for (const key of WIPE_SECURE_STORAGE_KEYS) {
      expect(asyncStorageWipeSet.has(key)).toBe(false)
    }
    // Belt-and-braces: also reject the logical name that previously stood in
    // for the SecureStore key in WIPE_STORAGE_KEYS.
    expect(asyncStorageWipeSet.has(STORAGE_KEYS.analyticsDeviceId)).toBe(false)
  })

  it('resets the analytics identity cache during wipe', async () => {
    await runLocalDataWipe()
    expect(resetAnalyticsIdentityCache).toHaveBeenCalledTimes(1)
  })

  it('resets the analytics in-memory queue during wipe', async () => {
    await runLocalDataWipe()
    expect(resetAnalyticsQueue).toHaveBeenCalledTimes(1)
  })

  it('drains pending position writes before clearing storage', async () => {
    await runLocalDataWipe()
    expect(awaitPendingPositionWrites).toHaveBeenCalledTimes(1)
    expect(resetPositionsCache).toHaveBeenCalledTimes(1)
  })
})
