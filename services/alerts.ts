import { supabase } from '../lib/supabase'
import { MetalType } from '../constants/metals'
import { reportError } from '@/utils/error-reporting'

export type Condition = 'above' | 'below'

export interface Alert {
  id: string
  // Legacy database column used by the alert cron as Expo notification routing.
  // This is not a business owner and must not be treated as durable identity.
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
export type LegacyNotificationTokenAlertScope = {
  kind: 'legacy_notification_token_scope'
  notificationToken: NotificationToken
}

function hasValidNotificationToken(notificationToken: NotificationToken): boolean {
  return notificationToken.trim().length > 0
}

export function createLegacyNotificationTokenAlertScope(
  notificationToken: NotificationToken | null | undefined,
): LegacyNotificationTokenAlertScope | null {
  if (!notificationToken || !hasValidNotificationToken(notificationToken)) return null

  return {
    kind: 'legacy_notification_token_scope',
    notificationToken,
  }
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
  if (affectedRows === 0) return { success: false, error: 'not_found_or_not_in_legacy_scope' }
  if (affectedRows > 1) return { success: false, error: 'integrity_anomaly_multiple_rows' }
  return { success: true }
}

// Current v1 backend schema partitions mobile access by the notification token
// stored in alerts.push_token. This is a legacy transport-token scope, not
// ownership. Real ownership requires a backend identity, RLS, and RPC migration.
export async function getAlerts(scope: LegacyNotificationTokenAlertScope): Promise<Alert[]> {
  if (!hasValidNotificationToken(scope.notificationToken)) return []
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('push_token', scope.notificationToken)
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

// Sprint 3A transitional write.
// push_token is still required by the alerts_owner_or_legacy_push_token check
// constraint and is still used by the current push-routing cron. When a real
// Supabase session exists at write time, owner_id is populated alongside for
// structural alignment with the owner-based migration. Co-writing both columns
// is explicitly allowed by the backend transition design and is NOT effective
// security until target RLS is activated in a later sprint.
export async function createAlert(
  scope: LegacyNotificationTokenAlertScope,
  metal: MetalType,
  condition: Condition,
  targetPrice: number,
  ownerId?: string | null,
): Promise<boolean> {
  if (!hasValidNotificationToken(scope.notificationToken) || !hasValidTargetPrice(targetPrice)) {
    reportAlertError('create_alert_invalid_payload', new Error('invalid_alert_payload'), {
      scope: scope.kind,
      hasNotificationToken: hasValidNotificationToken(scope.notificationToken),
      metal,
      condition,
      targetPrice,
    })
    return false
  }
  if (!supabase) return false
  try {
    const payload: Record<string, unknown> = {
      push_token: scope.notificationToken,
      metal,
      condition,
      target_price: targetPrice,
      currency: 'EUR',
      is_active: true,
    }
    if (typeof ownerId === 'string' && ownerId.trim().length > 0) {
      payload.owner_id = ownerId
    }

    const { error } = await supabase.from('alerts').insert(payload)
    if (error) {
      reportAlertError('create_alert', error, {
        metal,
        condition,
        targetPrice,
        hasOwnerId: typeof ownerId === 'string' && ownerId.trim().length > 0,
      })
      return false
    }
    return true
  } catch (error) {
    reportAlertError('create_alert', error, { metal, condition, targetPrice })
    return false
  }
}

export async function deleteAlert(
  scope: LegacyNotificationTokenAlertScope,
  alertId: string,
): Promise<AlertMutationResult> {
  if (!hasValidNotificationToken(scope.notificationToken) || alertId.trim().length === 0) {
    return { success: false, error: 'invalid_alert_delete_payload' }
  }
  if (!supabase) return { success: false, error: 'supabase_unavailable' }
  try {
    const { data, error } = await supabase
      .from('alerts')
      .update({ is_active: false })
      .eq('id', alertId)
      .eq('push_token', scope.notificationToken)
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
  scope: LegacyNotificationTokenAlertScope,
  alertId: string,
  updates: {
    metal: MetalType;
    condition: Condition;
    target_price: number;
  },
): Promise<AlertMutationResult> {
  if (
    !hasValidNotificationToken(scope.notificationToken)
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
      .eq('push_token', scope.notificationToken)
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
