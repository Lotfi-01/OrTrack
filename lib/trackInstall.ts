import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { reportError } from '@/utils/error-reporting';
import { getCurrentSessionUserId } from '@/services/auth-session';

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

    // device_id remains the legacy onConflict key and is explicitly not a
    // business identity. owner_id is attached only when a real Supabase
    // session is available at write time; otherwise the row stays
    // legacy-unowned. No implicit link between device_id and any auth user.
    // This is structural alignment with the owner-based migration and is
    // NOT effective access control until target RLS is activated.
    const ownerId = await getCurrentSessionUserId();
    const payload: Record<string, unknown> = {
      device_id: deviceId,
      platform: Platform.OS,
      app_version: Application.nativeApplicationVersion ?? 'unknown',
    };
    if (ownerId) payload.owner_id = ownerId;

    const { error } = await supabase.from('app_installs').upsert(
      payload,
      { onConflict: 'device_id' }
    );

    if (error) {
      reportError(error, { scope: 'install', action: 'upsert_app_install' });
      return;
    }

    await AsyncStorage.setItem(STORAGE_KEYS.installTracked, 'true');
  } catch (error) {
    reportError(error, { scope: 'install', action: 'track_install' });
  }
}
