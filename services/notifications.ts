import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { STORAGE_KEYS } from '@/constants/storage-keys'
import { reportError } from '@/utils/error-reporting'

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
    const token = tokenData.data

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.pushToken, token)
    } catch (error) {
      reportError(error, { scope: 'notifications', action: 'store_push_token' })
    }

    if (!supabase) return token

    try {
      await supabase
        .from('push_tokens')
        .upsert({ token }, { onConflict: 'token' })
    } catch (error) {
      reportError(error, { scope: 'notifications', action: 'upsert_push_token' })
    }

    return token
  } catch (error) {
    reportError(error, { scope: 'notifications', action: 'register_for_push_notifications' })
    return null
  }
}
