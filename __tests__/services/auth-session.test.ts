jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}))

import { supabase } from '../../lib/supabase'
import { getCurrentSessionUserId } from '../../services/auth-session'

const mockGetSession = (supabase as unknown as { auth: { getSession: jest.Mock } })
  .auth.getSession

describe('getCurrentSessionUserId', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
  })

  it('returns null when supabase returns no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(getCurrentSessionUserId()).resolves.toBeNull()
  })

  it('returns null when supabase returns an error', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: { message: 'boom' } })
    await expect(getCurrentSessionUserId()).resolves.toBeNull()
  })

  it('returns null when session exists but user.id is blank', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: '   ' } } },
      error: null,
    })
    await expect(getCurrentSessionUserId()).resolves.toBeNull()
  })

  it('returns null when session exists but user is missing', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: null } },
      error: null,
    })
    await expect(getCurrentSessionUserId()).resolves.toBeNull()
  })

  it('returns user id when session is usable', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    })
    await expect(getCurrentSessionUserId()).resolves.toBe('user-123')
  })

  it('returns null when getSession throws', async () => {
    mockGetSession.mockRejectedValue(new Error('network'))
    await expect(getCurrentSessionUserId()).resolves.toBeNull()
  })
})
