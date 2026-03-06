import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

const EAS_PROJECT_ID = 'db42a187-7b2b-44e3-9a14-65210a86a1b6'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function registerForPushNotifications(): Promise<string | null> {
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

  try {
    // projectId obligatoire depuis expo-notifications 0.20+
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    })
    const token = tokenData.data

    await AsyncStorage.setItem('@ortrack:push_token', token)

    const { error: upsertError } = await supabase
      .from('push_tokens')
      .upsert({ token }, { onConflict: 'token' })

    if (upsertError) {
      console.log('🔔 Erreur upsert Supabase:', JSON.stringify(upsertError))
    } else {
      console.log('🔔 Token sauvegardé dans Supabase avec succès')
    }

    console.log('Push token enregistré:', token)
    return token
  } catch (error) {
    // Normal sur émulateur → ne bloque pas l'app
    console.log('Push token non disponible (émulateur?):', error)
    return null
  }
}
