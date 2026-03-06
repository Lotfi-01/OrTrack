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
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('push_token', pushToken)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Erreur récupération alertes:', error)
    return []
  }
  return data ?? []
}

export async function createAlert(
  pushToken: string,
  metal: MetalType,
  condition: Condition,
  targetPrice: number
): Promise<boolean> {
  const { error } = await supabase.from('alerts').insert({
    push_token: pushToken,
    metal,
    condition,
    target_price: targetPrice,
    currency: 'EUR',
    is_active: true,
  })
  if (error) {
    console.error('Erreur création alerte:', error)
    return false
  }
  return true
}

export async function deleteAlert(alertId: string): Promise<boolean> {
  const { error } = await supabase
    .from('alerts')
    .update({ is_active: false })
    .eq('id', alertId)
  if (error) {
    console.error('Erreur suppression alerte:', error)
    return false
  }
  return true
}
