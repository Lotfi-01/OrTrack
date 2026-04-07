import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont
// automatiquement injectés par Supabase.
// Ne JAMAIS les définir comme secrets manuellement.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const METALS_API_KEY = Deno.env.get('METALS_API_KEY')!

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

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Récupère les prix depuis metals.dev en EUR/toz
    const pricesRes = await fetch(
      `https://api.metals.dev/v1/latest?api_key=${METALS_API_KEY}&currency=EUR&unit=toz`
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

    // 3. Vérifie chaque alerte
    const triggeredIds: string[] = []
    const notifications: object[] = []

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

      triggeredIds.push(alert.id)

      const label = METAL_LABELS[alert.metal] ?? alert.metal
      const conditionLabel =
        alert.condition === 'above' ? 'a dépassé' : 'est passé sous'
      const fmt = (n: number) =>
        n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

      notifications.push({
        to: alert.push_token,
        title: `🔔 Alerte ${label}`,
        body: `${label} ${conditionLabel} ${fmt(targetPrice)}€ — actuellement ${fmt(currentPrice)}€`,
        sound: 'default',
        data: { metal: alert.metal, price: currentPrice },
      })
    }

    // 4. Désactive les alertes déclenchées (une seule fois)
    if (triggeredIds.length > 0) {
      const { error: updateError } = await supabase
        .from('alerts')
        .update({
          is_active: false,
          triggered_at: new Date().toISOString(),
        })
        .in('id', triggeredIds)

      if (updateError) {
        console.error('Erreur désactivation alertes:', updateError)
      }
    }

    // 5. Envoie les notifications via Expo Push API
    let pushResult = null
    if (notifications.length > 0) {
      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(notifications),
      })
      pushResult = await pushRes.json()
      console.log('Push result:', JSON.stringify(pushResult))
    }

    return new Response(
      JSON.stringify({
        message: 'Vérification terminée',
        prices,
        alertsChecked: alerts.length,
        alertsTriggered: triggeredIds.length,
        notificationsSent: notifications.length,
        pushResult,
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
