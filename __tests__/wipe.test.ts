jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>()

  return {
    __store: store,
    getAllKeys: jest.fn(async () => Array.from(store.keys())),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach(key => store.delete(key))
    }),
  }
})

import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE_KEYS, WIPE_STORAGE_KEYS } from '../constants/storage-keys'

const storageMock = AsyncStorage as typeof AsyncStorage & {
  __store: Map<string, string>
}

async function runLocalWipe() {
  const allKeys = await AsyncStorage.getAllKeys()
  const dynamicKeys = allKeys.filter(key => key.startsWith(STORAGE_KEYS.historyCachePrefix))

  await AsyncStorage.multiRemove([...WIPE_STORAGE_KEYS, ...dynamicKeys])
}

describe('local wipe storage keys', () => {
  beforeEach(() => {
    storageMock.__store.clear()
    jest.clearAllMocks()
  })

  it('removes every STORAGE_KEYS value from AsyncStorage', async () => {
    await Promise.all(
      Object.values(STORAGE_KEYS).map(key => AsyncStorage.setItem(key, 'value')),
    )
    await AsyncStorage.setItem(`${STORAGE_KEYS.historyCachePrefix}1M_EUR_gold`, 'cached')

    await runLocalWipe()

    await Promise.all(
      Object.values(STORAGE_KEYS).map(async key => {
        await expect(AsyncStorage.getItem(key)).resolves.toBeNull()
      }),
    )
    await expect(
      AsyncStorage.getItem(`${STORAGE_KEYS.historyCachePrefix}1M_EUR_gold`),
    ).resolves.toBeNull()
  })

  it('removes privacyMode', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.privacyMode, 'true')

    await runLocalWipe()

    await expect(AsyncStorage.getItem(STORAGE_KEYS.privacyMode)).resolves.toBeNull()
  })
})
