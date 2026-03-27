import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const INSTALL_TRACKED_KEY = 'ortrack_install_tracked';

export async function trackInstall(): Promise<void> {
  try {
    const alreadyTracked = await AsyncStorage.getItem(INSTALL_TRACKED_KEY);
    if (alreadyTracked === 'true') return;

    if (!supabase) {
      console.warn('Supabase not initialized, skipping install tracking');
      return;
    }

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

    if (error) {
      console.warn('Track install error:', error.message);
      return;
    }

    await AsyncStorage.setItem(INSTALL_TRACKED_KEY, 'true');
    console.log('✅ Install tracked successfully');
  } catch (err) {
    console.warn('Track install failed:', err);
  }
}