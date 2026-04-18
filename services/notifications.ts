import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { STORAGE_KEYS } from '@/constants/storage-keys'
import { reportError } from '@/utils/error-reporting'

const EAS_PROJECT_ID = 'db42a187-7b2b-44e3-9a14-65210a86a1b6'

export type NotificationPermissionStatus =
  | { state: 'granted'; canAskAgain: boolean }
  | { state: 'denied'; canAskAgain: boolean }
  | { state: 'undetermined'; canAskAgain: boolean }
  | { state: 'unavailable'; reason: string }

// Reads the OS notification permission state without prompting the user and
// without triggering push token retrieval. Returns an explicit `unavailable`
// state when the native call fails so the UI can surface an honest status.
export async function getCurrentPermissionStatus(): Promise<NotificationPermissionStatus> {
  try {
    const res = await Notifications.getPermissionsAsync()
    const canAskAgain = res.canAskAgain ?? false
    if (res.status === 'granted' || res.status === 'denied' || res.status === 'undetermined') {
      return { state: res.status, canAskAgain }
    }
    return { state: 'unavailable', reason: `unknown_status:${String(res.status)}` }
  } catch (error) {
    reportError(error, { scope: 'notifications', action: 'read_permission_status' })
    return { state: 'unavailable', reason: 'read_failed' }
  }
}

export type TokenRefreshOutcome =
  | { outcome: 'missing_permission' }
  | { outcome: 'unavailable'; reason: string }
  | { outcome: 'same'; current: string }
  | { outcome: 'rotated'; previous: string | null; current: string }

// Silently re-reads the current Expo push token when the OS permission is
// already granted and compares it to the locally stored one. Persists the new
// token to AsyncStorage and upserts the push_tokens table when a rotation is
// observed. Does not prompt the user. Callers are expected to invoke
// `registerForPushNotifications` for the first-time permission flow.
export async function refreshCurrentPushToken(): Promise<TokenRefreshOutcome> {
  try {
    const status = await getCurrentPermissionStatus()
    if (status.state !== 'granted') return { outcome: 'missing_permission' }

    let previous: string | null = null
    try {
      previous = await AsyncStorage.getItem(STORAGE_KEYS.notificationToken)
    } catch (error) {
      reportError(error, { scope: 'notifications', action: 'read_stored_token_for_refresh' })
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })
    const current = tokenData.data
    if (!current || current.trim().length === 0) {
      return { outcome: 'unavailable', reason: 'empty_token' }
    }

    if (previous && previous === current) return { outcome: 'same', current }

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.notificationToken, current)
    } catch (error) {
      reportError(error, { scope: 'notifications', action: 'store_rotated_token' })
    }

    if (supabase) {
      try {
        await supabase
          .from('push_tokens')
          .upsert({ token: current }, { onConflict: 'token' })
      } catch (error) {
        reportError(error, { scope: 'notifications', action: 'upsert_rotated_token' })
      }
    }

    return { outcome: 'rotated', previous, current }
  } catch (error) {
    reportError(error, { scope: 'notifications', action: 'refresh_current_token' })
    return { outcome: 'unavailable', reason: 'refresh_failed' }
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Alertes prix',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      })
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return null

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    })
    const notificationToken = tokenData.data

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.notificationToken, notificationToken)
    } catch (error) {
      reportError(error, { scope: 'notifications', action: 'store_notification_token' })
    }

    if (!supabase) return notificationToken

    try {
      await supabase
        .from('push_tokens')
        .upsert({ token: notificationToken }, { onConflict: 'token' })
    } catch (error) {
      reportError(error, { scope: 'notifications', action: 'upsert_notification_token' })
    }

    return notificationToken
  } catch (error) {
    reportError(error, { scope: 'notifications', action: 'register_for_push_notifications' })
    return null
  }
}
