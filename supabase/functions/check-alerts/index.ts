import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont
// automatiquement injectés par Supabase.
// Ne JAMAIS les définir comme secrets manuellement.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// metals.dev retourne les clés en anglais :
// gold, silver, platinum, palladium
// La base Supabase stocke en français :
// or, argent, platine, palladium
const METAL_MAPPING: Record<string, string> = {
  gold: 'or',
  silver: 'argent',
  platinum: 'platine',
  palladium: 'palladium',
}

const METAL_LABELS: Record<string, string> = {
  or: 'Or',
  argent: 'Argent',
  platine: 'Platine',
  palladium: 'Palladium',
}

Deno.serve(async (req) => {
  // ── Auth : vérifier CRON_SECRET avant toute logique métier ──────────
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    return new Response(
      JSON.stringify({ error: 'Internal configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }
  // ────────────────────────────────────────────────────────────────────

  const metalsApiKey = Deno.env.get('METALS_API_KEY')
  if (!metalsApiKey) {
    return new Response(
      JSON.stringify({ error: 'METALS_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Récupère les prix depuis metals.dev en EUR/toz
    const pricesRes = await fetch(
      `https://api.metals.dev/v1/latest?api_key=${metalsApiKey}&currency=EUR&unit=toz`
    )

    if (!pricesRes.ok) {
      return new Response(
        JSON.stringify({
          error: 'metals.dev HTTP error',
          status: pricesRes.status,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const pricesData = await pricesRes.json()

    if (pricesData.status !== 'success') {
      return new Response(
        JSON.stringify({
          error: 'metals.dev API error',
          details: pricesData,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!pricesData.metals || typeof pricesData.metals !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Format inattendu', raw: pricesData }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Mappe les prix anglais → français
    // Métaux absents du plan → ignorés silencieusement
    const prices: Record<string, number> = {}
    for (const [key, value] of Object.entries(pricesData.metals)) {
      const frenchKey = METAL_MAPPING[key]
      if (frenchKey && typeof value === 'number' && value > 0) {
        prices[frenchKey] = value
      }
    }
    console.log('Prix récupérés:', JSON.stringify(prices))

    // 2. Récupère toutes les alertes actives
    // service_role bypasse RLS automatiquement
    const { data: alerts, error: alertsError } = await supabase
      .from('alerts')
      .select('*')
      .eq('is_active', true)

    if (alertsError) {
      return new Response(
        JSON.stringify({ error: 'Supabase error', details: alertsError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Aucune alerte active', prices }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 3. Vérifie chaque alerte et construit le mapping alerte → message Expo
    const triggered: { alertId: string; message: object }[] = []

    for (const alert of alerts) {
      const currentPrice = prices[alert.metal]

      if (currentPrice === undefined) {
        console.log(`Prix non disponible pour: ${alert.metal}`)
        continue
      }

      const targetPrice = Number(alert.target_price)
      const isTriggered =
        (alert.condition === 'above' && currentPrice >= targetPrice) ||
        (alert.condition === 'below' && currentPrice <= targetPrice)

      if (!isTriggered) continue

      // alerts.push_token is only the Expo notification destination. It is not
      // ownership; this cron runs with service_role and processes active rows.
      const notificationToken = alert.push_token
      if (!notificationToken || typeof notificationToken !== 'string' || notificationToken.trim() === '') {
        console.log(`Alerte ${alert.id} déclenchée mais token push absent — laissée active`)
        continue
      }

      const label = METAL_LABELS[alert.metal] ?? alert.metal
      const conditionLabel =
        alert.condition === 'above' ? 'a dépassé' : 'est passé sous'
      const fmt = (n: number) =>
        n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

      triggered.push({
        alertId: alert.id,
        message: {
          to: notificationToken,
          title: `🔔 Alerte ${label}`,
          body: `${label} ${conditionLabel} ${fmt(targetPrice)}€ — actuellement ${fmt(currentPrice)}€`,
          sound: 'default',
          data: { metal: alert.metal, price: currentPrice },
        },
      })
    }

    if (triggered.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'Vérification terminée — aucune alerte déclenchée',
          prices,
          alertsChecked: alerts.length,
          alertsTriggered: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 4. Envoie les notifications via Expo Push API AVANT toute désactivation
    const messages = triggered.map(t => t.message)
    let tickets: { status?: string; id?: string; details?: unknown; message?: string }[] = []

    try {
      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      })

      if (!pushRes.ok) {
        console.error(`Expo Push HTTP error: ${pushRes.status}`)
        // Aucune alerte désactivée — aucune preuve d'acceptation
        return new Response(
          JSON.stringify({
            error: 'Expo Push HTTP error',
            status: pushRes.status,
            alertsTriggered: triggered.length,
            alertsDisabled: 0,
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const body = await pushRes.json()
      // Expo retourne { data: [...tickets] } avec un ticket par message, même index
      if (body && Array.isArray(body.data)) {
        tickets = body.data
      } else {
        console.error('Expo Push: structure de réponse inattendue')
        return new Response(
          JSON.stringify({
            error: 'Expo Push unexpected response',
            alertsTriggered: triggered.length,
            alertsDisabled: 0,
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      }
    } catch (pushErr) {
      console.error('Expo Push fetch error:', String(pushErr))
      // Aucune alerte désactivée — aucune preuve d'acceptation
      return new Response(
        JSON.stringify({
          error: 'Expo Push fetch failed',
          alertsTriggered: triggered.length,
          alertsDisabled: 0,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 5. Inspecte les tickets et ne désactive que les alertes dont le push est accepté
    const acceptedIds: string[] = []
    const failedCount = { total: 0 }

    for (let i = 0; i < triggered.length; i++) {
      const ticket = tickets[i]
      if (ticket && ticket.status === 'ok' && ticket.id) {
        acceptedIds.push(triggered[i].alertId)
      } else {
        failedCount.total++
      }
    }

    console.log(`Push: ${acceptedIds.length} accepté(s), ${failedCount.total} échoué(s) sur ${triggered.length}`)

    // 6. Désactive uniquement les alertes dont le push a été accepté par Expo
    if (acceptedIds.length > 0) {
      const { error: updateError } = await supabase
        .from('alerts')
        .update({
          is_active: false,
          triggered_at: new Date().toISOString(),
        })
        .in('id', acceptedIds)

      if (updateError) {
        console.error('Erreur désactivation alertes:', updateError)
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Vérification terminée',
        prices,
        alertsChecked: alerts.length,
        alertsTriggered: triggered.length,
        alertsDisabled: acceptedIds.length,
        alertsFailed: failedCount.total,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erreur inattendue', details: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
