// RP1.2 — Edge Function radar-prime.
//
// Sert les snapshots Radar Prime agrégés au mobile. Toute la sécurité repose
// sur cette fonction :
//   - validation du JWT utilisateur via Supabase Auth ;
//   - vérification serveur de l'entitlement Premium via RevenueCat REST API ;
//   - cache mémoire 60s par userId pour limiter les appels RevenueCat ;
//   - lecture des tables rp_* via service_role ;
//   - fail-closed si l'entitlement est inconnu ou indisponible.
//
// Le client mobile ne peut jamais influer sur la décision Premium :
// aucun champ du body, header ou query string n'est lu pour cela.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createEntitlementCache,
  ENTITLEMENT_NAME,
  parseRevenueCatEntitlement,
  REVENUECAT_TIMEOUT_MS,
  type PremiumStatus,
} from './_internal.ts'

// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont auto-injectés par Supabase.
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

function logInfo(reason: string, details?: Record<string, unknown>): void {
  console.log(`[radar-prime] ${reason}`, details ?? {})
}

// ─── Entitlement Premium serveur ────────────────────────────────────────────

const entitlementCache = createEntitlementCache()

async function fetchRevenueCatPremiumStatus(userId: string): Promise<PremiumStatus> {
  const apiKey = Deno.env.get('REVENUECAT_API_KEY')
  if (!apiKey) {
    logWarn('revenuecat_api_key_missing')
    return 'unknown'
  }

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), REVENUECAT_TIMEOUT_MS)
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: ctrl.signal,
      },
    )
    clearTimeout(t)

    if (!res.ok) {
      logWarn('revenuecat_http', { status: res.status })
      return 'unknown'
    }

    let body: unknown
    try {
      body = await res.json()
    } catch (e) {
      logWarn('revenuecat_invalid_json', {
        message: e instanceof Error ? e.message : 'unknown',
      })
      return 'unknown'
    }

    return parseRevenueCatEntitlement(body, Date.now(), ENTITLEMENT_NAME)
  } catch (e) {
    logWarn('revenuecat_error', {
      message: e instanceof Error ? e.message : 'unknown',
    })
    return 'unknown'
  }
}

async function getServerPremiumStatus(userId: string): Promise<PremiumStatus> {
  const now = Date.now()
  const cached = entitlementCache.get(userId, now)
  if (cached) return cached

  const status = await fetchRevenueCatPremiumStatus(userId)
  if (status === 'premium' || status === 'free') {
    entitlementCache.set(userId, status, now)
  }
  return status
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
    logInfo('auth_ok', { user_prefix: userId.slice(0, 8) })

    // 5. Entitlement Premium serveur via RevenueCat REST API + cache 60s.
    //    Le client n'a aucun moyen d'influer sur cette décision.
    const premiumStatus = await getServerPremiumStatus(userId)
    logInfo('revenuecat_status', { status: premiumStatus })
    if (premiumStatus !== 'premium') {
      // 'free' et 'unknown' → 403. On ne distingue pas pour ne rien fuiter.
      return jsonResponse(403, { error: 'premium_required' })
    }

    // 6. Premium confirmé serveur — lecture des tables rp_* via service_role.
    const dataClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

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
