jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}))

import { supabase } from '../../lib/supabase'
import { deleteAlert, updateAlert } from '../../services/alerts'

const mockFrom = supabase?.from as jest.Mock

function mockMutationResult(result: { data: { id: string }[] | null; error: { message: string } | null }) {
  const select = jest.fn().mockResolvedValue(result)
  const eqPushToken = jest.fn().mockReturnValue({ select })
  const eqId = jest.fn().mockReturnValue({ eq: eqPushToken })
  const update = jest.fn().mockReturnValue({ eq: eqId })

  mockFrom.mockReturnValue({ update })

  return { update, eqId, eqPushToken, select }
}

describe('alerts service ownership mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deleteAlert returns success with the correct token', async () => {
    const chain = mockMutationResult({ data: [{ id: 'alert-1' }], error: null })

    await expect(deleteAlert('token-1', 'alert-1')).resolves.toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('alerts')
    expect(chain.update).toHaveBeenCalledWith({ is_active: false })
    expect(chain.eqId).toHaveBeenCalledWith('id', 'alert-1')
    expect(chain.eqPushToken).toHaveBeenCalledWith('push_token', 'token-1')
    expect(chain.select).toHaveBeenCalledWith('id')
  })

  it('deleteAlert returns not_found_or_not_owner with an incorrect token', async () => {
    mockMutationResult({ data: [], error: null })

    await expect(deleteAlert('wrong-token', 'alert-1')).resolves.toEqual({
      success: false,
      error: 'not_found_or_not_owner',
    })
  })

  it('deleteAlert returns the Supabase error message', async () => {
    mockMutationResult({ data: null, error: { message: 'delete failed' } })

    await expect(deleteAlert('token-1', 'alert-1')).resolves.toEqual({
      success: false,
      error: 'delete failed',
    })
  })

  it('updateAlert returns success with the correct token', async () => {
    const chain = mockMutationResult({ data: [{ id: 'alert-1' }], error: null })

    await expect(
      updateAlert('token-1', 'alert-1', {
        metal: 'or',
        condition: 'above',
        target_price: 1234,
      }),
    ).resolves.toEqual({ success: true })
    expect(chain.update).toHaveBeenCalledWith({
      metal: 'or',
      condition: 'above',
      target_price: 1234,
    })
    expect(chain.eqId).toHaveBeenCalledWith('id', 'alert-1')
    expect(chain.eqPushToken).toHaveBeenCalledWith('push_token', 'token-1')
    expect(chain.select).toHaveBeenCalledWith('id')
  })

  it('updateAlert returns not_found_or_not_owner with an incorrect token', async () => {
    mockMutationResult({ data: [], error: null })

    await expect(
      updateAlert('wrong-token', 'alert-1', {
        metal: 'argent',
        condition: 'below',
        target_price: 42,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'not_found_or_not_owner',
    })
  })

  it('updateAlert returns the Supabase error message', async () => {
    mockMutationResult({ data: null, error: { message: 'update failed' } })

    await expect(
      updateAlert('token-1', 'alert-1', {
        metal: 'platine',
        condition: 'above',
        target_price: 999,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'update failed',
    })
  })
})
