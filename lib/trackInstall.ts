import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { STORAGE_KEYS } from '@/constants/storage-keys';

export async function trackInstall(): Promise<void> {
  try {
    const alreadyTracked = await AsyncStorage.getItem(STORAGE_KEYS.installTracked);
    if (alreadyTracked === 'true') return;
    if (!supabase) return;

    let deviceId: string;
    if (Platform.OS === 'android') {
      deviceId = Application.getAndroidId() ?? `android-${Date.now()}-${Math.random()}`;
    } else {
      deviceId = `ios-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    const { error } = await supabase.from('app_installs').upsert(
      {
        device_id: deviceId,
        platform: Platform.OS,
        app_version: Application.nativeApplicationVersion ?? 'unknown',
      },
      { onConflict: 'device_id' }
    );

    if (error) return;

    await AsyncStorage.setItem(STORAGE_KEYS.installTracked, 'true');
  } catch {}
}
