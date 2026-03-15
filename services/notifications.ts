import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

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

    if (finalStatus !== 'granted') {
      console.log('Permission notifications refusée')
      return null
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    })
    const token = tokenData.data

    await AsyncStorage.setItem('@ortrack:push_token', token)

    if (!supabase) return token

    try {
      const { error: upsertError } = await supabase
        .from('push_tokens')
        .upsert({ token }, { onConflict: 'token' })

      if (upsertError) {
        console.log('Erreur upsert Supabase:', JSON.stringify(upsertError))
      }
    } catch (netErr) {
      console.log('Supabase push token upsert failed:', netErr)
    }

    return token
  } catch (e) {
    console.log('registerForPushNotifications error:', e)
    return null
  }
}
