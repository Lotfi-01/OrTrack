import { supabase } from '../lib/supabase'
import { MetalType } from '../constants/metals'

export type Condition = 'above' | 'below'

export interface Alert {
  id: string
  push_token: string
  metal: MetalType
  condition: Condition
  target_price: number
  currency: string
  is_active: boolean
  created_at: string
}

export type AlertMutationResult = { success: boolean; error?: string }

function mutationResult(data: Pick<Alert, 'id'>[] | null, error: { message?: string } | null): AlertMutationResult {
  if (error) return { success: false, error: error.message ?? 'supabase_error' }
  const affectedRows = data?.length ?? 0
  if (affectedRows === 0) return { success: false, error: 'not_found_or_not_owner' }
  if (affectedRows > 1) return { success: false, error: 'integrity_anomaly_multiple_rows' }
  return { success: true }
}

export async function getAlerts(pushToken: string): Promise<Alert[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('push_token', pushToken)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) return []
  return data ?? []
}

export async function createAlert(
  pushToken: string,
  metal: MetalType,
  condition: Condition,
  targetPrice: number
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('alerts').insert({
    push_token: pushToken,
    metal,
    condition,
    target_price: targetPrice,
    currency: 'EUR',
    is_active: true,
  })
  return !error
}

export async function deleteAlert(pushToken: string, alertId: string): Promise<AlertMutationResult> {
  if (!supabase) return { success: false, error: 'supabase_unavailable' }
  const { data, error } = await supabase
    .from('alerts')
    .update({ is_active: false })
    .eq('id', alertId)
    .eq('push_token', pushToken)
    .select('id')
  return mutationResult(data, error)
}

export async function updateAlert(
  pushToken: string,
  alertId: string,
  updates: {
    metal: MetalType;
    condition: Condition;
    target_price: number;
  },
): Promise<AlertMutationResult> {
  if (!supabase) return { success: false, error: 'supabase_unavailable' }
  const { data, error } = await supabase
    .from('alerts')
    .update({
      metal: updates.metal,
      condition: updates.condition,
      target_price: updates.target_price,
    })
    .eq('id', alertId)
    .eq('push_token', pushToken)
    .select('id')
  return mutationResult(data, error)
}
