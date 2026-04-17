import { supabase } from '../lib/supabase'
import { reportError } from '@/utils/error-reporting'

export type ServerAccountDeletionOutcome = 'skipped' | 'success' | 'failed'

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

// Sprint 3B-1 defensive wiring.
// Invokes the backend RPC `public.delete_current_user_data()` when (and only
// when) a usable Supabase session is present, then signs the user out.
//
// Contract:
//   - 'skipped'  : no session / no client ⇒ nothing attempted on the server.
//                  Caller must still perform local wipe and never claim that
//                  server data was deleted.
//   - 'success'  : RPC call returned without error. A best-effort signOut is
//                  attempted after the RPC; a signOut failure does NOT
//                  downgrade the outcome because the server purge already
//                  happened. The caller can proceed to the local wipe.
//   - 'failed'   : RPC call errored or threw. signOut is NOT attempted
//                  (keeping the session alive lets the user retry). The
//                  caller must present an honest choice and must not claim
//                  the server data was deleted.
//
// This function does not create sessions and does not trigger any auth UX.
// Until the RLS target is activated the RPC only removes rows where
// owner_id = auth.uid(); legacy rows with owner_id IS NULL stay on the
// server by design.
export async function deleteAuthenticatedUserServerData(): Promise<ServerAccountDeletionOutcome> {
  const userId = await getCurrentSessionUserId()
  if (!userId) return 'skipped'
  if (!supabase) return 'skipped'

  try {
    const { error } = await supabase.rpc('delete_current_user_data')
    if (error) {
      reportError(error, {
        scope: 'account_deletion',
        action: 'delete_current_user_data_rpc',
      })
      return 'failed'
    }
  } catch (error) {
    reportError(error, {
      scope: 'account_deletion',
      action: 'delete_current_user_data_rpc',
    })
    return 'failed'
  }

  try {
    const { error } = await supabase.auth.signOut()
    if (error) {
      reportError(error, {
        scope: 'account_deletion',
        action: 'sign_out_after_rpc',
      })
    }
  } catch (error) {
    reportError(error, {
      scope: 'account_deletion',
      action: 'sign_out_after_rpc',
    })
  }

  return 'success'
}
