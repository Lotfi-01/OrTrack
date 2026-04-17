import { supabase } from '../lib/supabase'
import { reportError } from '@/utils/error-reporting'

// Transition-only Sprint 3A helper.
// Reads the current Supabase session if one happens to exist. This is a
// technical probe, not an auth flow: no sign-in, sign-up or session creation
// happens here. Callers must treat a null result as "no authenticated session
// available right now" and fall back to legacy behaviour.
//
// A session is considered usable only if Supabase returns a session object
// carrying a non-empty auth.users.id. Any other state (no client, error,
// missing session, blank user id) resolves to null.
//
// Until target RLS is enabled on the backend, this identifier is only used to
// populate owner_id for structural alignment with the migration. It is not a
// client-side security boundary.
export async function getCurrentSessionUserId(): Promise<string | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      reportError(error, { scope: 'auth_session', action: 'get_current_session' })
      return null
    }

    const session = data?.session
    if (!session) return null

    const userId = session.user?.id
    if (typeof userId !== 'string' || userId.trim().length === 0) return null

    return userId
  } catch (error) {
    reportError(error, { scope: 'auth_session', action: 'get_current_session' })
    return null
  }
}
