import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.
// Never declare them as manual secrets.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_EVENT_NAMES = new Set<string>([
  'app_opened',
  'session_start',
  'home_viewed',
  'portfolio_viewed',
  'add_position_started',
  'add_position_completed',
  'global_simulation_opened',
  'tap_global_simulation',
  'use_simulated_fiscal_date',
  'view_alerts',
  'premium_teaser_viewed',
  'premium_teaser_clicked',
  'paywall_viewed',
  'paywall_plan_selected',
  'paywall_dismissed',
  'purchase_started',
  'purchase_success',
  'purchase_cancelled',
  'purchase_failed',
  'restore_started',
  'restore_success',
  'restore_failed',
])

const ALLOWED_PLATFORMS = new Set<string>(['android', 'ios', 'web', 'unknown'])

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Local smoke test for the UUID v4 regex. Logged once on cold start.
;(() => {
  const ok = UUID_V4_REGEX.test('550e8400-e29b-41d4-a716-446655440000')
  const ko1 = UUID_V4_REGEX.test('not-a-uuid')
  const ko2 = UUID_V4_REGEX.test('550e8400-e29b-11d4-a716-446655440000')
  if (!ok || ko1 || ko2) {
    console.warn('[track-event] uuid_v4_regex_self_check_failed', { ok, ko1, ko2 })
  }
})()

const SENSITIVE_WORDS = new Set<string>([
  'email',
  'name',
  'phone',
  'address',
  'price',
  'amount',
  'portfolio',
  'value',
])
const SAFE_KEYS = new Set<string>([
  'has_purchase_price',
  'has_purchase_date',
])

const MAX_PROPERTY_COUNT = 20
const MAX_STRING_LENGTH = 120
const MIN_ID_LENGTH = 10
const MAX_ID_LENGTH = 160
const MAX_APP_VERSION_LENGTH = 32
const MAX_EVENT_NAME_LENGTH = 80

let rate429LogCounter = 0

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return false
  return true
}

function tokenize(key: string): string[] {
  return key.toLowerCase().split(/[_\-.\s]+/g).filter(Boolean)
}

function keyContainsSensitiveWord(key: string): boolean {
  if (SAFE_KEYS.has(key)) return false
  for (const t of tokenize(key)) {
    if (SENSITIVE_WORDS.has(t)) return true
  }
  return false
}

function sanitizePropertiesServerSide(input: unknown): Record<string, unknown> | null {
  if (input === undefined || input === null) return {}
  if (!isPlainObject(input)) return null

  const out: Record<string, unknown> = {}
  let count = 0

  for (const key of Object.keys(input)) {
    const value = input[key]
    if (value === undefined) continue
    if (Array.isArray(value)) return null
    if (isPlainObject(value)) return null
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      return null
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return null
    if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) return null
    if (keyContainsSensitiveWord(key)) continue

    out[key] = value
    count += 1
    if (count > MAX_PROPERTY_COUNT) return null
  }

  return out
}

function isValidId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= MIN_ID_LENGTH &&
    value.length <= MAX_ID_LENGTH
  )
}

function logWarn(reason: string, details?: Record<string, unknown>): void {
  console.warn(`[track-event] ${reason}`, details ?? {})
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      logWarn('method_not_allowed')
      return jsonResponse(405, { ok: false, error: 'method_not_allowed' })
    }

    const clientHeader = req.headers.get('x-ortrack-client')
    if (clientHeader !== 'mobile') {
      logWarn('forbidden_client_header')
      return jsonResponse(403, { ok: false, error: 'forbidden' })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      logWarn('invalid_json')
      return jsonResponse(400, { ok: false, error: 'invalid_json' })
    }

    if (!isPlainObject(raw)) {
      logWarn('invalid_payload_shape')
      return jsonResponse(400, { ok: false, error: 'invalid_payload' })
    }

    const {
      client_event_id,
      schema_version,
      event_name,
      properties,
      device_id,
      install_id,
      session_id,
      platform,
      app_version,
    } = raw as Record<string, unknown>

    if (typeof client_event_id !== 'string' || !UUID_V4_REGEX.test(client_event_id)) {
      logWarn('invalid_client_event_id')
      return jsonResponse(400, { ok: false, error: 'invalid_client_event_id' })
    }
    if (schema_version !== 1) {
      logWarn('invalid_schema_version')
      return jsonResponse(400, { ok: false, error: 'invalid_schema_version' })
    }
    if (
      typeof event_name !== 'string' ||
      event_name.length === 0 ||
      event_name.length > MAX_EVENT_NAME_LENGTH ||
      !ALLOWED_EVENT_NAMES.has(event_name)
    ) {
      logWarn('invalid_event_name')
      return jsonResponse(400, { ok: false, error: 'invalid_event_name' })
    }
    if (!isValidId(device_id)) {
      logWarn('invalid_device_id')
      return jsonResponse(400, { ok: false, error: 'invalid_device_id' })
    }
    if (!isValidId(install_id)) {
      logWarn('invalid_install_id')
      return jsonResponse(400, { ok: false, error: 'invalid_install_id' })
    }
    if (!isValidId(session_id)) {
      logWarn('invalid_session_id')
      return jsonResponse(400, { ok: false, error: 'invalid_session_id' })
    }
    if (typeof platform !== 'string' || !ALLOWED_PLATFORMS.has(platform)) {
      logWarn('invalid_platform')
      return jsonResponse(400, { ok: false, error: 'invalid_platform' })
    }
    let appVersionValue: string | null = null
    if (app_version !== undefined && app_version !== null) {
      if (typeof app_version !== 'string' || app_version.length > MAX_APP_VERSION_LENGTH) {
        logWarn('invalid_app_version')
        return jsonResponse(400, { ok: false, error: 'invalid_app_version' })
      }
      appVersionValue = app_version
    }

    const sanitizedProperties = sanitizePropertiesServerSide(properties ?? {})
    if (sanitizedProperties === null) {
      logWarn('invalid_properties')
      return jsonResponse(400, { ok: false, error: 'invalid_properties' })
    }

    // Rate limit must be checked BEFORE any insert.
    const { data: rateOk, error: rateErr } = await supabase.rpc(
      'check_analytics_rate_limit',
      { p_device_id: device_id },
    )

    if (rateErr) {
      logWarn('rate_limit_rpc_failed', { code: rateErr.code })
      return jsonResponse(500, { ok: false, error: 'rate_limit_check_failed' })
    }

    if (rateOk === false) {
      rate429LogCounter += 1
      if (rate429LogCounter % 100 === 1) {
        logWarn('rate_limited', { device_id_prefix: device_id.slice(0, 8) })
      }
      return jsonResponse(429, { ok: false, error: 'rate_limited' })
    }

    const { error: insertErr, data: inserted, count } = await supabase
      .from('analytics_events')
      .upsert(
        {
          client_event_id,
          schema_version,
          event_name,
          properties: sanitizedProperties,
          device_id,
          install_id,
          session_id,
          platform,
          app_version: appVersionValue,
        },
        {
          onConflict: 'device_id,client_event_id',
          ignoreDuplicates: true,
        },
      )
      .select('id', { count: 'exact' })

    if (insertErr) {
      logWarn('insert_failed', { code: insertErr.code })
      return jsonResponse(500, { ok: false, error: 'insert_failed' })
    }

    const isDuplicate = (inserted?.length ?? 0) === 0 || count === 0
    if (isDuplicate) {
      console.warn('[track-event] duplicate_ignored')
      return jsonResponse(200, { ok: true, duplicate: true })
    }

    return jsonResponse(200, { ok: true })
  } catch (err) {
    console.warn('[track-event] unexpected_error', {
      message: err instanceof Error ? err.message : 'unknown',
    })
    return jsonResponse(500, { ok: false, error: 'unexpected' })
  }
})
