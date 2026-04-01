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

export async function deleteAlert(alertId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('alerts')
    .update({ is_active: false })
    .eq('id', alertId)
  return !error
}

export async function updateAlert(
  alertId: string,
  updates: {
    metal: MetalType;
    condition: Condition;
    target_price: number;
  },
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('alerts')
    .update({
      metal: updates.metal,
      condition: updates.condition,
      target_price: updates.target_price,
    })
    .eq('id', alertId)
  return !error
}
