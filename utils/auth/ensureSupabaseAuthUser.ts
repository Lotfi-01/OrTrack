import type { User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

// RP1.2 — Auth Supabase anonyme pour Radar Prime.
//
// Pas d'écran login, pas d'email, pas d'OAuth. Les utilisateurs OrTrack
// reçoivent un compte anonyme Supabase au boot, dont l'`auth.uid()` sert
// d'App User ID RevenueCat. La session est persistée via AsyncStorage par
// la config existante de `lib/supabase.ts` (persistSession + autoRefresh).
//
// Cette fonction n'écrit jamais d'identifiant ailleurs qu'en mémoire et
// dans la session Supabase. Elle ne stocke pas de donnée utilisateur.

export class SupabaseAuthError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SupabaseAuthError';
    this.cause = cause;
  }
}

/**
 * Récupère la session Supabase courante ou en crée une via signInAnonymously.
 *
 * Comportement :
 *   - si une session valide existe → retourne le user de la session ;
 *   - sinon → tente `signInAnonymously()` puis retourne le user créé ;
 *   - en cas d'échec, lève une `SupabaseAuthError`. Le caller doit gérer
 *     proprement : ne pas bloquer l'app, désactiver Radar Prime.
 *
 * Ne mute aucun stockage local autre que la session Supabase elle-même.
 * Ne déclenche pas d'effet de bord sur RevenueCat.
 */
export async function ensureSupabaseAuthUser(): Promise<User> {
  if (!supabase) {
    throw new SupabaseAuthError('supabase_client_unavailable');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new SupabaseAuthError('get_session_failed', sessionError);
  }
  const sessionUser = sessionData.session?.user;
  if (sessionUser) return sessionUser;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new SupabaseAuthError('anonymous_sign_in_failed', error);
  }
  if (!data.user) {
    throw new SupabaseAuthError('anonymous_sign_in_no_user');
  }
  return data.user;
}
