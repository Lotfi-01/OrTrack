import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { STORAGE_KEYS } from '@/constants/storage-keys'
import { reportError } from '@/utils/error-reporting'
import { getCurrentSessionUserId } from './auth-session'

const EAS_PROJECT_ID = 'db42a187-7b2b-44e3-9a14-65210a86a1b6'

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
      // Transport token registry. The `token` column is the legacy routing key
      // and remains the onConflict target. owner_id is populated only when a
      // real Supabase session is available at write time; otherwise the row
      // stays legacy-unowned. The notification token is never used as owner.
      // This is structural alignment with the owner-based migration and is
      // NOT effective access control until target RLS is activated.
      const ownerId = await getCurrentSessionUserId()
      const payload: Record<string, unknown> = { token: notificationToken }
      if (ownerId) payload.owner_id = ownerId

      await supabase
        .from('push_tokens')
        .upsert(payload, { onConflict: 'token' })
    } catch (error) {
      reportError(error, { scope: 'notifications', action: 'upsert_notification_token' })
    }

    return notificationToken
  } catch (error) {
    reportError(error, { scope: 'notifications', action: 'register_for_push_notifications' })
    return null
  }
}
