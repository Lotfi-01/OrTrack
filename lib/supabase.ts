import { createClient, SupabaseClient } from '@supabase/supabase-js'

import AsyncStorage from '@react-native-async-storage/async-storage'

let supabaseInstance: SupabaseClient | null = null;

try {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const isValid = url
    && key
    && url !== 'undefined'
    && key !== 'undefined'
    && url.startsWith('https://');

  if (isValid) {
    supabaseInstance = createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } else {
    console.warn('[OrTrack] Supabase disabled: missing or invalid URL/key');
  }
} catch (e) {
  console.warn('[OrTrack] Supabase init failed:', e);
}

export const supabase = supabaseInstance;
