import { supabase } from '../lib/supabase'
import { MetalType } from '../constants/metals'
import { reportError } from '@/utils/error-reporting'

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

export type NotificationToken = string

function hasValidNotificationToken(notificationToken: NotificationToken): boolean {
  return notificationToken.trim().length > 0
}

function hasValidTargetPrice(targetPrice: number): boolean {
  return Number.isFinite(targetPrice) && targetPrice > 0
}

function reportAlertError(action: string, error: unknown, metadata?: Record<string, unknown>) {
  reportError(error, { scope: 'alerts', action, metadata })
}

function mutationResult(data: Pick<Alert, 'id'>[] | null, error: { message?: string } | null): AlertMutationResult {
  if (error) return { success: false, error: error.message ?? 'supabase_error' }
  const affectedRows = data?.length ?? 0
  if (affectedRows === 0) return { success: false, error: 'not_found_or_not_owner' }
  if (affectedRows > 1) return { success: false, error: 'integrity_anomaly_multiple_rows' }
  return { success: true }
}

// Current v1 backend schema scopes alerts by push_token. This token is a
// notification routing token, not a durable business owner. Keep this filter
// until the server has account/device ownership, RLS, and RPCs.
export async function getAlerts(notificationToken: NotificationToken): Promise<Alert[]> {
  if (!hasValidNotificationToken(notificationToken)) return []
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('push_token', notificationToken)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (error) {
      reportAlertError('get_alerts', error)
      return []
    }
    return data ?? []
  } catch (error) {
    reportAlertError('get_alerts', error)
    return []
  }
}

export async function createAlert(
  notificationToken: NotificationToken,
  metal: MetalType,
  condition: Condition,
  targetPrice: number
): Promise<boolean> {
  if (!hasValidNotificationToken(notificationToken) || !hasValidTargetPrice(targetPrice)) {
    reportAlertError('create_alert_invalid_payload', new Error('invalid_alert_payload'), {
      hasNotificationToken: hasValidNotificationToken(notificationToken),
      metal,
      condition,
      targetPrice,
    })
    return false
  }
  if (!supabase) return false
  try {
    const { error } = await supabase.from('alerts').insert({
      push_token: notificationToken,
      metal,
      condition,
      target_price: targetPrice,
      currency: 'EUR',
      is_active: true,
    })
    if (error) {
      reportAlertError('create_alert', error, { metal, condition, targetPrice })
      return false
    }
    return true
  } catch (error) {
    reportAlertError('create_alert', error, { metal, condition, targetPrice })
    return false
  }
}

export async function deleteAlert(notificationToken: NotificationToken, alertId: string): Promise<AlertMutationResult> {
  if (!hasValidNotificationToken(notificationToken) || alertId.trim().length === 0) {
    return { success: false, error: 'invalid_alert_delete_payload' }
  }
  if (!supabase) return { success: false, error: 'supabase_unavailable' }
  try {
    const { data, error } = await supabase
      .from('alerts')
      .update({ is_active: false })
      .eq('id', alertId)
      .eq('push_token', notificationToken)
      .select('id')
    const result = mutationResult(data, error)
    if (!result.success) reportAlertError('delete_alert', new Error(result.error), { alertId })
    return result
  } catch (error) {
    reportAlertError('delete_alert', error, { alertId })
    return { success: false, error: 'delete_alert_failed' }
  }
}

export async function updateAlert(
  notificationToken: NotificationToken,
  alertId: string,
  updates: {
    metal: MetalType;
    condition: Condition;
    target_price: number;
  },
): Promise<AlertMutationResult> {
  if (
    !hasValidNotificationToken(notificationToken)
    || alertId.trim().length === 0
    || !hasValidTargetPrice(updates.target_price)
  ) {
    return { success: false, error: 'invalid_alert_update_payload' }
  }
  if (!supabase) return { success: false, error: 'supabase_unavailable' }
  try {
    const { data, error } = await supabase
      .from('alerts')
      .update({
        metal: updates.metal,
        condition: updates.condition,
        target_price: updates.target_price,
      })
      .eq('id', alertId)
      .eq('push_token', notificationToken)
      .select('id')
    const result = mutationResult(data, error)
    if (!result.success) {
      reportAlertError('update_alert', new Error(result.error), {
        alertId,
        metal: updates.metal,
        condition: updates.condition,
        targetPrice: updates.target_price,
      })
    }
    return result
  } catch (error) {
    reportAlertError('update_alert', error, { alertId })
    return { success: false, error: 'update_alert_failed' }
  }
}
