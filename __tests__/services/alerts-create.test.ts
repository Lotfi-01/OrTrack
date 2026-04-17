jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}))

import { supabase } from '../../lib/supabase'
import {
  createAlert,
  createLegacyNotificationTokenAlertScope,
} from '../../services/alerts'

const mockFrom = supabase?.from as jest.Mock

function mockInsertResult(result: { error: { message: string } | null }) {
  const insert = jest.fn().mockResolvedValue(result)
  mockFrom.mockReturnValue({ insert })
  return { insert }
}

describe('createAlert payload shape', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('writes only legacy push_token when no ownerId is provided', async () => {
    const chain = mockInsertResult({ error: null })
    const scope = createLegacyNotificationTokenAlertScope('token-abc')!

    await expect(createAlert(scope, 'or', 'above', 1000)).resolves.toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('alerts')
    const payload = chain.insert.mock.calls[0][0]
    expect(payload.push_token).toBe('token-abc')
    expect(payload).not.toHaveProperty('owner_id')
  })

  it('writes owner_id alongside push_token when a usable ownerId is provided', async () => {
    const chain = mockInsertResult({ error: null })
    const scope = createLegacyNotificationTokenAlertScope('token-abc')!

    await expect(
      createAlert(scope, 'argent', 'below', 42, 'user-123'),
    ).resolves.toBe(true)
    const payload = chain.insert.mock.calls[0][0]
    expect(payload.push_token).toBe('token-abc')
    expect(payload.owner_id).toBe('user-123')
  })

  it('ignores ownerId when it is blank', async () => {
    const chain = mockInsertResult({ error: null })
    const scope = createLegacyNotificationTokenAlertScope('token-abc')!

    await expect(
      createAlert(scope, 'platine', 'above', 10, '   '),
    ).resolves.toBe(true)
    const payload = chain.insert.mock.calls[0][0]
    expect(payload).not.toHaveProperty('owner_id')
  })

  it('ignores ownerId when null is explicitly passed', async () => {
    const chain = mockInsertResult({ error: null })
    const scope = createLegacyNotificationTokenAlertScope('token-abc')!

    await expect(
      createAlert(scope, 'palladium', 'below', 50, null),
    ).resolves.toBe(true)
    const payload = chain.insert.mock.calls[0][0]
    expect(payload).not.toHaveProperty('owner_id')
  })
})
