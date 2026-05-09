// RP1.1 — Edge Function radar-prime.
//
// Sert les snapshots Radar Prime agrégés au mobile. Toute la sécurité repose
// sur cette fonction :
//   - validation du JWT utilisateur via Supabase Auth ;
//   - vérification serveur de l'entitlement Premium ;
//   - lecture des tables rp_* via service_role ;
//   - fail-closed si l'entitlement est inconnu ou indisponible.
//
// IMPORTANT — Cas B (audit RP1) :
// Aucune source serveur fiable pour l'entitlement Premium n'existe encore
// (pas d'auth Supabase active, pas de webhook RevenueCat, pas de table
// d'entitlements). `getServerPremiumStatus` échoue donc fermé en
// retournant 'unknown' systématiquement → tout appel reçoit 403 jusqu'à
// ce qu'un mapping serveur soit livré dans un lot dédié.
//
// Le client mobile ne peut jamais influer sur la décision Premium :
// aucun champ du body, header ou query string n'est lu pour cela.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont auto-injectés par Supabase.
// Ne jamais les déclarer comme secrets manuels.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const RESPONSE_VERSION = 1

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info',
  'Access-Control-Max-Age': '3600',
}

// ─── Helpers de réponse ─────────────────────────────────────────────────────

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function logWarn(reason: string, details?: Record<string, unknown>): void {
  console.warn(`[radar-prime] ${reason}`, details ?? {})
}

// ─── Entitlement Premium — TODO: brancher mapping serveur ───────────────────

type PremiumStatus = 'premium' | 'free' | 'unknown'

/**
 * Vérifie l'entitlement Premium côté serveur.
 *
 * TODO RP1.x : aucune source serveur fiable n'existe (Cas B de l'audit).
 *   - pas de webhook RevenueCat ingéré
 *   - pas de table `entitlements` dans le repo
 *   - pas d'auth Supabase active (config.toml: enable_anonymous_sign_ins=false)
 * Tant qu'un mapping serveur n'est pas livré, ce helper retourne toujours
 * 'unknown' → 403 systématique. C'est le comportement attendu (fail-closed).
 *
 * Quand le mapping sera disponible (Cas A) :
 *   - lire l'entitlement depuis la table dédiée (ex. `user_entitlements`)
 *     ou l'API RevenueCat via clé secrète stockée en Supabase secret ;
 *   - retourner 'premium' uniquement si l'entitlement actif est confirmé ;
 *   - en cas d'erreur réseau / DB → retourner 'unknown', JAMAIS 'premium'.
 */
async function getServerPremiumStatus(_userId: string): Promise<PremiumStatus> {
  return 'unknown'
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // 2. Méthode autorisée. POST aligné sur le SDK supabase.functions.invoke
  // (qui envoie POST par défaut) et sur le pattern existant `track-event`.
  if (req.method !== 'POST') {
    logWarn('method_not_allowed', { method: req.method })
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  try {
    // 3. Auth — header Authorization obligatoire
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      logWarn('missing_authorization')
      return jsonResponse(401, { error: 'unauthorized' })
    }
    const jwt = authHeader.slice('Bearer '.length).trim()
    if (!jwt) {
      logWarn('empty_jwt')
      return jsonResponse(401, { error: 'unauthorized' })
    }

    // 4. Validation du JWT utilisateur via client auth (anon key + JWT user).
    //    Le service_role n'est PAS utilisé pour cette étape.
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userData, error: userError } = await authClient.auth.getUser(jwt)
    if (userError || !userData?.user?.id) {
      logWarn('invalid_jwt', { code: userError?.message })
      return jsonResponse(401, { error: 'unauthorized' })
    }
    const userId = userData.user.id

    // 5. Entitlement Premium serveur — fail-closed.
    //    Le client n'a aucun moyen d'influer sur cette décision.
    const premiumStatus = await getServerPremiumStatus(userId)
    if (premiumStatus !== 'premium') {
      // 'free' et 'unknown' → 403. On ne distingue pas pour ne rien fuiter.
      return jsonResponse(403, { error: 'premium_required' })
    }

    // 6. Premium confirmé serveur — lecture des tables rp_* via service_role.
    const dataClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    // Snapshot date la plus récente disponible.
    const { data: latestRow, error: latestError } = await dataClient
      .from('rp_prime_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
    if (latestError) {
      logWarn('latest_snapshot_query_failed', { code: latestError.code })
      return jsonResponse(500, { error: 'server_error' })
    }
    const snapshotDate: string | null = latestRow && latestRow.length > 0
      ? (latestRow[0] as { snapshot_date: string }).snapshot_date
      : null

    if (!snapshotDate) {
      return jsonResponse(200, {
        version: RESPONSE_VERSION,
        snapshotDate: null,
        products: [],
      })
    }

    // Snapshots de la date la plus récente, joints au référentiel produits.
    // dealer_name et observations brutes ne sont JAMAIS lus ici (table
    // rp_prime_observations) ni retournés au client.
    const { data: snapshotRows, error: snapshotError } = await dataClient
      .from('rp_prime_snapshots')
      .select(
        'product_id, median_premium_pct, p25_premium_pct, p75_premium_pct, observations_count, freshness_days, status, confidence_level, rp_products!inner ( slug, label, metal, category, display_order, active )',
      )
      .eq('snapshot_date', snapshotDate)
    if (snapshotError) {
      logWarn('snapshot_query_failed', { code: snapshotError.code })
      return jsonResponse(500, { error: 'server_error' })
    }

    type Row = {
      median_premium_pct: number
      p25_premium_pct: number
      p75_premium_pct: number
      observations_count: number
      freshness_days: number
      status: string
      confidence_level: string
      rp_products: {
        slug: string
        label: string
        metal: string
        category: string
        display_order: number
        active: boolean
      } | null
    }

    const products = ((snapshotRows ?? []) as Row[])
      .filter((r) => r.rp_products && r.rp_products.active)
      .sort((a, b) => (a.rp_products!.display_order - b.rp_products!.display_order))
      .map((r) => ({
        slug: r.rp_products!.slug,
        label: r.rp_products!.label,
        metal: r.rp_products!.metal,
        category: r.rp_products!.category,
        medianPremiumPct: Number(r.median_premium_pct),
        p25PremiumPct: Number(r.p25_premium_pct),
        p75PremiumPct: Number(r.p75_premium_pct),
        observationsCount: r.observations_count,
        freshnessDays: r.freshness_days,
        status: r.status,
        confidenceLevel: r.confidence_level,
      }))

    return jsonResponse(200, {
      version: RESPONSE_VERSION,
      snapshotDate,
      products,
    })
  } catch (err) {
    logWarn('unexpected_error', {
      message: err instanceof Error ? err.message : 'unknown',
    })
    return jsonResponse(500, { error: 'server_error' })
  }
})
