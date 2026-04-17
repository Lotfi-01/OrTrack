jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signOut: jest.fn(),
    },
    rpc: jest.fn(),
  },
}))

import { supabase } from '../../lib/supabase'
import { deleteAuthenticatedUserServerData } from '../../services/auth-session'

type SupabaseTestShape = {
  auth: { getSession: jest.Mock; signOut: jest.Mock }
  rpc: jest.Mock
}

const mocked = supabase as unknown as SupabaseTestShape

function sessionFixture(userId: string | null) {
  if (userId === null) {
    return { data: { session: null }, error: null }
  }
  return { data: { session: { user: { id: userId } } }, error: null }
}

describe('deleteAuthenticatedUserServerData orchestration', () => {
  beforeEach(() => {
    mocked.auth.getSession.mockReset()
    mocked.auth.signOut.mockReset()
    mocked.rpc.mockReset()
  })

  it('returns skipped when no session is available and performs no network call', async () => {
    mocked.auth.getSession.mockResolvedValue(sessionFixture(null))

    await expect(deleteAuthenticatedUserServerData()).resolves.toBe('skipped')

    expect(mocked.rpc).not.toHaveBeenCalled()
    expect(mocked.auth.signOut).not.toHaveBeenCalled()
  })

  it('returns skipped when session exists but user id is blank', async () => {
    mocked.auth.getSession.mockResolvedValue(sessionFixture('   '))

    await expect(deleteAuthenticatedUserServerData()).resolves.toBe('skipped')

    expect(mocked.rpc).not.toHaveBeenCalled()
    expect(mocked.auth.signOut).not.toHaveBeenCalled()
  })

  it('returns success and signs out when RPC succeeds', async () => {
    mocked.auth.getSession.mockResolvedValue(sessionFixture('user-42'))
    mocked.rpc.mockResolvedValue({ data: { alerts: 1 }, error: null })
    mocked.auth.signOut.mockResolvedValue({ error: null })

    await expect(deleteAuthenticatedUserServerData()).resolves.toBe('success')

    expect(mocked.rpc).toHaveBeenCalledTimes(1)
    expect(mocked.rpc).toHaveBeenCalledWith('delete_current_user_data')
    expect(mocked.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('returns failed and does NOT sign out when RPC returns an error', async () => {
    mocked.auth.getSession.mockResolvedValue(sessionFixture('user-42'))
    mocked.rpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })

    await expect(deleteAuthenticatedUserServerData()).resolves.toBe('failed')

    expect(mocked.rpc).toHaveBeenCalledTimes(1)
    expect(mocked.auth.signOut).not.toHaveBeenCalled()
  })

  it('returns failed and does NOT sign out when RPC throws', async () => {
    mocked.auth.getSession.mockResolvedValue(sessionFixture('user-42'))
    mocked.rpc.mockRejectedValue(new Error('network down'))

    await expect(deleteAuthenticatedUserServerData()).resolves.toBe('failed')

    expect(mocked.auth.signOut).not.toHaveBeenCalled()
  })

  it('still returns success when signOut fails AFTER a successful RPC', async () => {
    mocked.auth.getSession.mockResolvedValue(sessionFixture('user-42'))
    mocked.rpc.mockResolvedValue({ data: { alerts: 0 }, error: null })
    mocked.auth.signOut.mockResolvedValue({ error: { message: 'signout boom' } })

    // Server-side purge already happened. A failed signOut must not downgrade
    // the outcome because the data on the server is already gone.
    await expect(deleteAuthenticatedUserServerData()).resolves.toBe('success')

    expect(mocked.rpc).toHaveBeenCalledTimes(1)
    expect(mocked.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('still returns success when signOut throws AFTER a successful RPC', async () => {
    mocked.auth.getSession.mockResolvedValue(sessionFixture('user-42'))
    mocked.rpc.mockResolvedValue({ data: { alerts: 0 }, error: null })
    mocked.auth.signOut.mockRejectedValue(new Error('signout throws'))

    await expect(deleteAuthenticatedUserServerData()).resolves.toBe('success')
  })
})
