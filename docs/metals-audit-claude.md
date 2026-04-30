# Audit metals.dev - état des lieux

Date : 2026-04-30

## Résumé exécutif

- Nombre d'appels directs `metals.dev` depuis le mobile : **0**
- Nombre d'appels directs `metals.dev` depuis Supabase Edge Functions : **1** (`supabase/functions/check-alerts/index.ts:57`)
- Nombre d'usages `EXPO_PUBLIC_METAL_API_KEY` dans le code source : **0** (variable présente dans `.env` mais jamais lue par le code mobile audité)
- Risque principal : la variable `EXPO_PUBLIC_METAL_API_KEY` est définie dans `.env` (valeur `[REDACTED]`). Le préfixe `EXPO_PUBLIC_` provoque l'inclusion automatique dans le bundle JS Expo, **même si aucun fichier ne lit la variable**. La clé est donc exploitable côté client après extraction du bundle APK, conformément au modèle de fuite décrit dans `docs/release-blockers.md`.
- Recommandation : pas besoin de créer de nouvelle Edge Function pour les prix — la proxification réseau est déjà effective. Le release blocker se règle en 3 actions : (1) supprimer `EXPO_PUBLIC_METAL_API_KEY` de `.env`, (2) faire tourner la clé chez `metals.dev` (la valeur committée dans `.env` doit être considérée comme compromise), (3) confirmer que le secret `METALS_API_KEY` côté Supabase est bien la nouvelle clé et seul moyen d'accès.
- Nombre d'Edge Functions recommandé pour les prix : **0 nouvelle**. L'Edge Function `check-alerts` est l'unique consommateur serveur de `metals.dev` actuellement audité. Les tables `metal_prices_spot` / `metal_prices_daily` / `prime_daily` sont déjà servies depuis Supabase via PostgREST — la couche d'isolation existe.

---

## 1. Appels metals.dev directs depuis le mobile

| Fichier:ligne | Endpoint | Caller | Fréquence | Données | Risque |
|---|---|---|---|---|---|
| _aucun_ | _aucun_ | _aucun_ | _aucun_ | _aucun_ | 🟢 |

**Aucun appel direct `metals.dev` depuis le code mobile** (`app/`, `components/`, `hooks/`, `services/`, `lib/`, `utils/`, `constants/`).

Vérification :

```bash
grep -rn "metals.dev" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.expo --exclude-dir=dist --exclude-dir=build
```

Seules occurrences hors documentation :

| Fichier:ligne | Contexte | Côté |
|---|---|---|
| `supabase/functions/check-alerts/index.ts:9` | Commentaire de mapping FR/EN | Server (Deno) |
| `supabase/functions/check-alerts/index.ts:55` | Commentaire bloc `1. Récupère les prix` | Server (Deno) |
| `supabase/functions/check-alerts/index.ts:57` | `fetch('https://api.metals.dev/v1/latest?api_key=…&currency=EUR&unit=toz')` | Server (Deno) |
| `supabase/functions/check-alerts/index.ts:63` | Message d'erreur `metals.dev HTTP error` | Server (Deno) |
| `supabase/functions/check-alerts/index.ts:75` | Message d'erreur `metals.dev API error` | Server (Deno) |

### Détail de l'unique appel `metals.dev` (côté serveur)

- Fichier : `supabase/functions/check-alerts/index.ts`
- Ligne : 57
- Endpoint : `GET https://api.metals.dev/v1/latest`
- Méthode HTTP : `GET`
- Paramètres : `api_key=[REDACTED]&currency=EUR&unit=toz`
- Header utilisé : aucun header custom (clé en query string)
- Caller direct : la fonction `Deno.serve` exportée par défaut du fichier
- Caller parent : invocation cron Supabase (déclenchement par appel HTTP avec header `Authorization: Bearer ${CRON_SECRET}`, voir `index.ts:36`)
- Fréquence d'appel : non déductible du code audité — dépend de la planification cron Supabase, qui n'est pas définie dans `supabase/config.toml` (section `[cron]` absente). _Non confirmé dans le code audité._
- Données récupérées : `pricesData.metals` (objet `{ gold, silver, platinum, palladium }`), uniquement les prix spot des 4 métaux du plan
- Dépendance : déclenchement externe (cron / RemoteTrigger), pas de focus, mount, action utilisateur ou polling client
- Type de donnée : **spot price** (`/v1/latest`)
- Risque : 🟢 mineur — appel côté serveur, clé jamais exposée côté client, gardé derrière `CRON_SECRET`

---

## 2. Usages de EXPO_PUBLIC_METAL_API_KEY

| Fichier:ligne | Usage | Contexte | Risque | Remplacement attendu |
|---|---|---|---|---|
| `.env:1` | `EXPO_PUBLIC_METAL_API_KEY=[REDACTED]` | Définition de la variable, valeur committée | 🔴 critique | Supprimer la ligne. Faire tourner la clé chez `metals.dev`. Conserver uniquement le secret `METALS_API_KEY` côté Supabase Edge Function. |

**Aucun usage en lecture** dans le code source mobile :

- `services/` — 0 occurrence
- `lib/` — 0 occurrence
- `hooks/` — 0 occurrence
- `utils/` — 0 occurrence
- `constants/` — 0 occurrence
- `app/` — 0 occurrence
- `components/` — 0 occurrence
- `contexts/` — 0 occurrence

Vérification :

```bash
grep -rn "EXPO_PUBLIC_METAL_API_KEY" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.expo --exclude-dir=dist --exclude-dir=build
grep -rn "METAL_API" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.expo --exclude-dir=dist --exclude-dir=build
```

Les seules occurrences textuelles sont dans `CLAUDE.md`, `docs/release-blockers.md` et `.env`.

### Pourquoi c'est tout de même critique

Bien que la variable ne soit lue par aucun fichier, le préfixe `EXPO_PUBLIC_` provoque l'**inclusion automatique de la valeur dans le bundle JS produit par Expo**. Toute clé portant ce préfixe finit en clair dans l'APK, indépendamment de son usage. Le bundle est extractible (apktool / reverse engineering trivial). Comportement documenté par Expo et confirmé par le release blocker `docs/release-blockers.md:17`.

Le release blocker reste donc valide — la simple absence de `process.env.EXPO_PUBLIC_METAL_API_KEY` dans le code n'est **pas** suffisante.

### Action de remplacement attendue

1. Supprimer `EXPO_PUBLIC_METAL_API_KEY` de `.env` et de tout artefact de build (cache `.expo/`, EAS build profiles).
2. Considérer la valeur committée comme **compromise** — la faire tourner immédiatement côté `metals.dev`.
3. Vérifier que le secret Supabase `METALS_API_KEY` (utilisé par `check-alerts`, `index.ts:44`) contient la **nouvelle** clé et **uniquement** celle-ci.
4. Re-builder et re-publier l'APK pour purger la valeur de tout build distribué.

---

## 3. Couche réseau prix actuelle

### Fichier principal de récupération

- **Spot prices** : `hooks/use-spot-prices.ts` — appelle directement Supabase REST (`fetch` ligne 71) sur `metal_prices_spot`. Aucun client `supabase-js` ici (fetch brut + headers `apikey` / `Authorization`).
- **Historique** : `hooks/use-metal-history.ts` — fonction `loadPriceHistory` (ligne 94), `fetch` ligne 130 sur `metal_prices_daily` avec pagination (1000 lignes / page, max 30 pages).
- **Primes / Radar** : `utils/radar/radar-query.ts` — utilise le client `supabase-js` (`from('prime_daily')`, lignes 38, 49, 73). Hook : `hooks/use-radar-products.ts`.

### Services / hooks impliqués

| Couche | Fichier | Rôle |
|---|---|---|
| Client supabase-js | `lib/supabase.ts` | Création de l'instance partagée (URL + anon key) |
| Hook spot | `hooks/use-spot-prices.ts` | Fetch + cache AsyncStorage + refresh 30 min + savePricePoint |
| Hook spot partagé | `contexts/spot-prices-context.tsx` | `SpotPricesProvider` + `useSharedSpotPrices` — réduit les fetchs concurrents en montant un cycle unique sous (tabs)/_layout |
| Helper historique | `hooks/use-metal-history.ts` | `loadPriceHistory` + `savePricePoint` (cache local de fallback en `priceHistory`) |
| Query radar | `utils/radar/radar-query.ts` | `fetchCurrentPrimes` + `fetchPrimeHistory` |
| Hook radar | `hooks/use-radar-products.ts` | Cache module-level Map + TTL 15 min + filtre métal côté client |

### Composants consommateurs identifiés

`useSpotPrices` (direct hook ou via context) :

- `app/fiscalite.tsx:47`
- `app/fiscalite-globale.tsx:191`
- `app/statistiques.tsx:45`
- `app/(tabs)/alertes.tsx:80`
- `components/metal-converter.tsx:45`
- `components/indicateurs-panel.tsx:136`
- `components/metal-guide.tsx:141`
- `contexts/spot-prices-context.tsx:17` (provider — instance partagée pour la subtree wrapped)

`loadPriceHistory` :

- `components/price-chart.tsx:122`
- `app/(tabs)/index.tsx:158` (chart par métal)
- `app/(tabs)/index.tsx:167` (variation 24h)

`useRadarProducts` :

- `app/radar.tsx:58`
- `components/radar/RadarDashboardCard.tsx:53`

### Format de réponse interne

| Endpoint Supabase | Forme | Hook |
|---|---|---|
| `metal_prices_spot` | `{ metal, price_usd, price_eur, price_chf }[]` | `use-spot-prices` |
| `metal_prices_daily` | `{ date, metal, price_usd, price_eur, price_chf }[]` (paginé) | `use-metal-history` |
| `prime_daily` | `{ product_slug, date, prime_pct }[]` | `radar-query` |

### Gestion loading / erreur / retry / fallback

- **Loading** : `useSpotPrices` distingue `loading` (premier mount) et `refreshing` (refreshs silencieux). `useRadarProducts` a `isLoading`. `loadPriceHistory` n'expose pas d'état de chargement — le caller gère son propre `setChartLoading`.
- **Error** : `useSpotPrices` retourne `error: string | null`. `loadPriceHistory` retourne `EMPTY` silencieusement en cas d'échec. `useRadarProducts` retourne `error: string | null`.
- **Retry** : aucun retry automatique. Refresh périodique 30 min pour spot (`use-spot-prices.ts:8`). Refresh à `useFocusEffect` pour radar (`use-radar-products.ts:118`).
- **Fallback** : `useSpotPrices` rejoue le cache AsyncStorage expiré sur erreur réseau (lignes 207-222). `loadPriceHistory` rejoue le cache si fresh, sinon retourne tableau vide. `useRadarProducts` n'a pas de fallback offline (cache module-level uniquement, perdu au kill).
- **Couplage UI ↔ API** : aucun composant n'appelle `fetch` directement. Toute l'UI passe par `useSpotPrices` / `loadPriceHistory` / `useRadarProducts`.

### Réponses claires aux questions du périmètre

- **Le code a-t-il une couche service centralisée ?** Oui pour les prix, en 3 modules : `hooks/use-spot-prices.ts`, `hooks/use-metal-history.ts`, `utils/radar/radar-query.ts`. Pas de `services/prices.ts` unifié, mais aucun composant n'appelle `metals.dev` ni `fetch` réseau prix directement.
- **Les composants appellent-ils directement le réseau ?** Non. Tous passent par les 3 hooks/helpers ci-dessus.
- **La proxification exige-t-elle une seule modification ou plusieurs points ?** **Aucune modification de la couche réseau mobile**. La proxification est déjà effective : le mobile interroge Supabase, jamais `metals.dev`. Reste uniquement à neutraliser la fuite de la variable `.env`.

---

## 4. Cache actuel

### Cache client

| Donnée | Clé AsyncStorage | TTL | Invalidation | Fallback offline |
|---|---|---|---|---|
| Spot prices (4 métaux × 3 devises) | `STORAGE_KEYS.spotCache` (`@ortrack:spot_cache`) | 29 min (`CACHE_TTL_MS`, `use-spot-prices.ts:9`) | Refresh manuel (`refresh()`) ou interval 30 min (`REFRESH_INTERVAL_MS`, `use-spot-prices.ts:8`) | Oui — cache expiré rejoué sur erreur réseau (lignes 207-222) avec `error: 'Données en cache — mise à jour impossible'` |
| Historique prix | `STORAGE_KEYS.historyCachePrefix` + `${period}_${currency}[_${metal}]` (`use-metal-history.ts:103`) | 60 min (`CACHE_TTL_MS`, `use-metal-history.ts:6`) | Implicite — pas de purge active | Non explicite — retourne tableau vide en cas d'échec |
| Snapshot historique local | `STORAGE_KEYS.priceHistory` (`@ortrack:price_history`) | Non (cap 200 points, `MAX_POINTS`) | `savePricePoint` push à chaque refresh spot | Lecture interne, alimente la persistence locale |
| Prime / Radar | _Aucun_ AsyncStorage. Cache `Map` module-level (`use-radar-products.ts:21`) | 15 min (`CACHE_TTL_MS`, `use-radar-products.ts:12`) | `invalidateRadarCache()` ou `refetch()` | Aucun — cache perdu au kill du process |

Refresh au focus :

- Spot : non (refresh par interval, pas par focus). `useEffect` au mount du hook.
- Historique : déclenché par `useEffect` sur changement `period` / `metal`.
- Radar : oui via `useFocusEffect` (`use-radar-products.ts:118`).

Refresh manuel :

- Spot : `refresh()` exposé par `useSpotPrices` (force fetch).
- Historique : pas d'API publique de refresh — il faut changer `period` ou attendre le TTL.
- Radar : `refetch()` exposé.

Refresh périodique :

- Spot uniquement, 30 min via `setInterval` (`use-spot-prices.ts:235`).
- Historique : aucun.
- Radar : aucun.

### Cache serveur

Tables Supabase liées aux prix interrogées par le mobile :

| Table | Lue par | Forme observée |
|---|---|---|
| `metal_prices_spot` | `hooks/use-spot-prices.ts:70` | Spot courant — colonnes `metal, price_usd, price_eur, price_chf` |
| `metal_prices_daily` | `hooks/use-metal-history.ts:129` | Historique journalier — `date, metal, price_usd, price_eur, price_chf` |
| `prime_daily` | `utils/radar/radar-query.ts:38,49,73` | Prime des produits — `product_slug, date, prime_pct` |

**Aucune** de ces tables n'est définie dans les migrations locales committées (`supabase/migrations/`). Les seules tables couvertes par les migrations locales sont :

- `public.alerts`, `public.push_tokens`, `public.app_installs` (`20260416090000_create_core_notification_tables.sql`)
- `public.analytics_events`, `public.analytics_rate_limits` (`20260425120000_create_analytics_events.sql`)
- `public.alerts` (transition d'ownership, `20260417173000_alerts_owner_transition.sql`)

Le commentaire en tête du fichier `20260416090000_…` confirme que le repo migrations locale est un **replay baseline** — la prod a un schéma plus large jamais re-déclaré localement.

Source du peuplement de `metal_prices_spot`, `metal_prices_daily`, `prime_daily` : _Non confirmé dans le code audité._ Aucun script d'ingestion `metals.dev → metal_prices_spot` n'est présent dans `supabase/functions/`. Hypothèse plausible non vérifiée : ingestion via un job externe / webhook / fonction non versionnée localement. **À confirmer hors audit.**

Données encore servies depuis `metals.dev` (côté code audité) :

- Aucune sur le chemin mobile.
- Côté serveur, `check-alerts` consomme `/v1/latest` une fois par invocation cron pour vérifier les alertes — sans persister les prix dans `metal_prices_spot` (cf. `index.ts:91-97`, écriture en variable locale uniquement).

### Réponses claires

- **Un cache serveur existe-t-il déjà pour les prix spot ?** Oui, table `metal_prices_spot`. Schéma exact et fréquence d'alimentation _non confirmés dans le code audité_.
- **Un cache serveur existe-t-il déjà pour l'historique ?** Oui, table `metal_prices_daily`. Idem, pas de migration locale.
- **Faut-il créer une table de cache ?** Non. Réutiliser `metal_prices_spot` et `metal_prices_daily` qui répondent déjà aux deux besoins UI (spot + historique).
- **Faut-il réutiliser une table existante ?** Oui — les trois tables `metal_prices_spot`, `metal_prices_daily`, `prime_daily` sont déjà la source unique côté mobile.

---

## 5. Volume d'appels estimé

Estimations dérivées du code audité. Le mobile **n'appelle plus `metals.dev` directement**. Les appels listés sont vers Supabase REST / supabase-js. La colonne « metals.dev » est systématiquement zéro côté client — n'est pas zéro pour `check-alerts` côté serveur.

| Scénario | Appels Supabase mobile | Appels `metals.dev` mobile | Endpoint Supabase | Déclencheur | Risque quota | Cache disponible |
|---|---|---|---|---|---|---|
| Démarrage app sur Accueil | 1 spot + 2 history (chart 1S + 24h) = **3** au mount, **0** si caches valides | 0 | `metal_prices_spot`, `metal_prices_daily` | mount `_layout`, mount `(tabs)/index` | nul (Supabase) | spot 29 min, history 60 min |
| Retour sur Accueil après navigation | **0** si caches valides, jusqu'à **3** sinon | 0 | idem | `useFocusEffect` positions, `useEffect[period,metal]` chart | nul | idem |
| Ouverture Portfolio | **0** appel prix (consomme `useSharedSpotPrices` du provider) | 0 | _aucun nouveau_ | `(tabs)/portefeuille` mount | nul | provider monté en `_layout` |
| Ouverture écran Chart | **1** `loadPriceHistory(period, currency, metal)` au mount | 0 | `metal_prices_daily` (paginé, jusqu'à 30 pages × 1000 lignes) | mount écran chart / `useEffect` | nul | history 60 min |
| Changement de période chart | **1** par changement de `period` ou `metal` | 0 | `metal_prices_daily` | `useEffect` | nul | hit cache si period × currency × metal déjà chargé en moins de 60 min |
| Ouverture Radar Prime | **2** queries (`fetchCurrentPrimes` + `fetchPrimeHistory`) au focus, 0 si cache module valide | 0 | `prime_daily` | `useFocusEffect` | nul | 15 min en mémoire (perdu au kill) |
| Ajout d'une position | **0** appel prix dédié (consomme caches existants) | 0 | _aucun_ | _Non confirmé dans le code audité_ — fourchette 0-1 selon le composant `usePriceField` | nul | — |
| Refresh manuel | **1** force-refresh spot (`refresh(true)`) ou **1** `refetch()` radar | 0 | `metal_prices_spot` ou `prime_daily` | bouton refresh | nul | bypass cache |
| Polling / background | **1** spot toutes les 30 min tant que l'app est montée (`setInterval`, `use-spot-prices.ts:235`) | 0 | `metal_prices_spot` | `setInterval` 30 min | nul | n/a (refresh actif) |
| Cron `check-alerts` (serveur) | n/a | **1** appel `/v1/latest` par exécution cron | `metals.dev` | cron Supabase + `Authorization: Bearer ${CRON_SECRET}` | dépend de la fréquence cron — _non confirmé dans le code audité_ | aucun cache côté Edge Function (re-fetch à chaque invocation) |

Volume `metals.dev` total côté **mobile** : **0 appel par scénario utilisateur**, par construction.

Volume `metals.dev` côté **serveur** : 1 par exécution de `check-alerts`. Fréquence d'exécution non lisible dans `supabase/config.toml` ni dans aucun fichier audité — _Non confirmé dans le code audité._ Source : la planification cron, qui doit être configurée hors `config.toml` (Supabase Hosted Cron / pg_cron).

---

## 6. Pattern Edge Function existant

Deux Edge Functions présentes dans le repo :

- `supabase/functions/check-alerts/index.ts` (281 lignes)
- `supabase/functions/track-event/index.ts` (290 lignes)

### Structure du dossier

```
supabase/functions/
├── check-alerts/
│   └── index.ts
└── track-event/
    └── index.ts
```

Une Edge Function = un dossier dont le nom devient le slug d'invocation (`/functions/v1/<slug>`). Pas de `_shared/`, pas de `deno.json`, pas de `import_map.json` à la racine `supabase/functions/`. Imports directs via URL `https://esm.sh/...`.

### Documentation locale / scripts de déploiement

_Non confirmé dans le code audité._ Aucun fichier `supabase/functions/README.md` ni script `deploy.sh` détecté.

### Pattern `check-alerts` (référence imposée par le brief)

| Élément | Détail | Ligne |
|---|---|---|
| Imports | `createClient` depuis `https://esm.sh/@supabase/supabase-js@2` | 1 |
| Variables auto-injectées | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` lus via `Deno.env.get` (pas déclarés en secret manuel) | 6-7 |
| Méthode HTTP | Pas de filtre — `Deno.serve` accepte tout. Implicite : appel cron `POST` ou `GET` | 27 |
| Gestion CORS | **Aucune** (fonction non invoquée depuis navigateur — uniquement appelée par cron Supabase) | — |
| Auth | Vérification `Authorization: Bearer ${CRON_SECRET}` avec `CRON_SECRET` lu via `Deno.env.get`. 401 si absent ou mismatch. 500 si secret manquant côté serveur. | 28-41 |
| Validation paramètres | Aucune — la fonction n'accepte pas de paramètres de requête | — |
| Accès secrets | `Deno.env.get('METALS_API_KEY')` (ligne 44), garde fail-fast à 500 si absent | 44-50 |
| Client Supabase | `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` — service_role bypasse RLS | 53 |
| Gestion erreurs | `try/catch` global + erreurs métier remontées en JSON `{ error, status, … }`. Codes 401 / 500 / 502 / 200. | 52, 60-67, 73-80, 192-203, 221-232, 275-280 |
| Format de réponse | JSON `Content-Type: application/json`. Code HTTP discriminant. | partout |
| Logs | `console.log` / `console.error` — pas de structured logger. | 98, 128, 143, 193, 211, 222, 247, 260 |
| Pattern de secret | Tous les secrets via `Deno.env.get(<NAME>)`. Aucun secret hardcodé. Variables auto-injectées vs secrets manuels documentés en commentaire haut de fichier (lignes 3-5). | — |
| Pattern de scheduling | Non déclaré dans le repo — le cron Supabase Hosted est configuré hors fichier de config. _Non confirmé dans le code audité._ | — |
| Invocation depuis le mobile | **Non** — fonction réservée au cron, protégée par `CRON_SECRET`. | — |

### Pattern `track-event` (deuxième référence utile)

| Élément | Détail | Ligne |
|---|---|---|
| Méthode HTTP | `POST` exclusivement (`405` sinon) | 147-150 |
| Auth client | Header obligatoire `x-ortrack-client: mobile` (`403` sinon). Pas de JWT — anon key suffisant. | 152-156 |
| Validation paramètres | Stricte : UUID v4, longueurs, allowlists, sanitization payload | 171-229 |
| Rate limit | RPC `check_analytics_rate_limit` avant insert (`429`) | 232-248 |
| Client Supabase | `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (auth disabled) | 72-74 |
| Réponses | `jsonResponse(status, body)` helper centralisé | 76-81 |
| Invocation mobile | `services/analytics/client.ts:117` via `fetch('${SUPABASE_URL}/functions/v1/track-event')` (pas `supabase.functions.invoke`), avec headers `apikey`, `Authorization: Bearer ${ANON_KEY}`, `x-ortrack-client: mobile` | — |

### Recherches d'autres invocations

- `supabase.functions.invoke` : 0 occurrence dans le code audité.
- `fetch` vers `/functions/v1/` : 1 occurrence (`services/analytics/client.ts:22` et `:117`).

### Réponses claires

- **Quel pattern réutiliser pour `metals.dev` ?** Le **mobile n'a pas besoin de nouveau pattern Edge Function** — il consomme déjà Supabase via PostgREST + supabase-js. Si plus tard une Edge Function dédiée aux prix devient nécessaire (par ex. parce qu'on souhaite forcer un fallback live `metals.dev` quand `metal_prices_spot` est stale), réutiliser le pattern `track-event` : `POST` + header `x-ortrack-client: mobile` + `fetch` direct depuis le mobile + `jsonResponse` helper côté serveur. Ne pas réutiliser le pattern `check-alerts` côté mobile (CRON_SECRET = secret server-to-server).
- **Faut-il une seule Edge Function ou plusieurs ?** **Aucune nouvelle pour la proxification stricte.** Si une Edge Function de fallback live devient nécessaire, **une seule** suffit, avec actions internes (`?action=spot|history|prime`).
- **Quel nom recommander ?** Si fonction additionnelle créée plus tard : `prices` ou `metals-proxy`. Conserver le format kebab-case déjà utilisé (`check-alerts`, `track-event`).

---

## 7. Risques classés

### 🔴 Critique

#### Clé `metals.dev` exposée dans le bundle JS via `EXPO_PUBLIC_METAL_API_KEY`

- **Impact** : la clé `[REDACTED]` présente dans `.env:1` est embarquée automatiquement par Expo dans tout build (`EXPO_PUBLIC_*` => bundle), et donc extractible depuis l'APK Play Store. Un attaquant peut épuiser le quota `metals.dev`, casser silencieusement l'app (perte de prix => Accueil + Portfolio + Chart en fallback cache, puis tableau vide une fois cache expiré).
- **Fichier concerné** : `.env:1` (présence). Aucun fichier source ne lit la variable, mais le bundling Expo est indépendant de l'usage.
- **Action recommandée** : (1) supprimer la ligne de `.env`, (2) faire tourner la clé chez `metals.dev` (la valeur committée doit être considérée compromise — toute personne ayant accès au repo Git la voit), (3) vérifier que `METALS_API_KEY` côté Supabase est la nouvelle clé, (4) re-builder et re-publier l'APK.
- **Priorité** : P0 — critère de sortie du release blocker `docs/release-blockers.md:11`.

### 🟠 Moyen

#### Schéma `metal_prices_spot` / `metal_prices_daily` / `prime_daily` non versionné dans les migrations locales

- **Impact** : impossible de reproduire le schéma prix sur un environnement local Supabase. Risque d'incohérence entre dev et prod. Tout changement de colonne côté prod n'a pas de filet de sécurité côté repo.
- **Fichier concerné** : `supabase/migrations/` (absence des migrations correspondantes).
- **Action recommandée** : ajouter une migration `*_create_metal_prices_tables.sql` (replay baseline, garde fail-fast comme `20260416090000_…`). Hors périmètre direct de la proxification, mais utile pour fiabiliser la suite.
- **Priorité** : P2 — pas un release blocker, mais à traiter avant d'industrialiser.

#### Fréquence cron `check-alerts` non documentée dans le repo

- **Impact** : impossible d'estimer le volume d'appels `metals.dev` côté serveur sans accès à la console Supabase. Hypothèse non vérifiable que le quota est respecté.
- **Fichier concerné** : `supabase/config.toml` (section `[cron]` absente), `supabase/functions/check-alerts/index.ts`.
- **Action recommandée** : documenter la fréquence dans un commentaire en tête de `check-alerts/index.ts` ou dans un `supabase/functions/README.md` minimal.
- **Priorité** : P2.

#### Source d'ingestion `metal_prices_spot` / `metal_prices_daily` inconnue

- **Impact** : si l'ingestion s'arrête (job externe non maintenu, webhook cassé), le mobile sert silencieusement des prix périmés via cache, puis tombe sur "Aucun prix disponible". Aucun monitoring visible.
- **Fichier concerné** : aucun fichier audité ne contient le pipeline.
- **Action recommandée** : confirmer la source d'ingestion hors audit, la documenter dans `docs/`. Pas une modification de code dans le scope de cet audit.
- **Priorité** : P2.

### 🟢 Mineur

#### Appel `metals.dev` dans `check-alerts/index.ts:57` via query string `?api_key=…`

- **Impact** : conventionnellement on préfère un header `Authorization`, mais `metals.dev` n'expose qu'un paramètre `api_key` en query. Risque de logging accidentel de la clé dans les access logs Supabase. Côté production hosted, les logs Supabase peuvent capter l'URL complète.
- **Fichier concerné** : `supabase/functions/check-alerts/index.ts:57`.
- **Action recommandée** : laisser tel quel — c'est l'API metals.dev qui impose le query. Optionnel : audit ponctuel des logs Supabase pour vérifier qu'aucune URL n'expose la clé en plaintext (relève des logs d'edge-runtime).
- **Priorité** : P3.

#### Pas de fallback offline pour le radar

- **Impact** : kill app + relance => première vue radar bloquée sur `isLoading` jusqu'à fetch Supabase. Pas un risque sécurité, mais UX dégradée hors ligne.
- **Fichier concerné** : `hooks/use-radar-products.ts` (cache Map module-level uniquement).
- **Action recommandée** : hors périmètre de la proxification metals.dev. À traiter dans un sprint UX si nécessaire.
- **Priorité** : P3.

---

## 8. Recommandations pour la proxification

### Stratégie cible

La proxification réseau **est déjà effective** — le mobile ne consomme `metals.dev` à aucun moment. Le release blocker se résume à neutraliser la fuite via `.env`.

Recommandation par défaut du brief : « une seule Edge Function pour les prix + cache serveur + aucun appel direct depuis mobile ». **Cette cible est déjà atteinte** :

- Aucun appel direct depuis mobile : ✅
- Cache serveur (tables Supabase) : ✅ (`metal_prices_spot`, `metal_prices_daily`, `prime_daily`)
- Edge Function pour `metals.dev` : ✅ via `check-alerts` (pour les alertes — pas pour servir les prix au mobile, qui passent par PostgREST)

### Réponses claires aux questions du périmètre

- **Nombre d'Edge Functions recommandé** : **0 nouvelle**. La fonction `check-alerts` reste l'unique consommateur `metals.dev`.
- **Nom de la fonction** : si une Edge Function de fallback live devient nécessaire plus tard, recommandation `prices` ou `metals-proxy`.
- **Endpoints internes à exposer** : `?action=spot` (latest) / `?action=history&period=…` / `?action=prime` — uniquement si fallback live. Sinon, PostgREST sur les 3 tables suffit.
- **Stratégie de cache** : conserver le cache existant (29 min spot AsyncStorage, 60 min history AsyncStorage, 15 min radar in-memory). Cache serveur déjà assuré par les tables `metal_prices_*`.
- **TTL recommandé** : pas de changement — les TTLs actuels sont cohérents avec la fréquence d'update probable des prix spot (intra-jour) et daily (1×/j).
- **Fallback mobile** : déjà présent dans `use-spot-prices.ts:207-222` (cache expiré rejoué). Conserver tel quel.
- **Ordre de migration** : voir la roadmap ci-dessous.
- **Fichiers à modifier ensuite** : voir section 9.
- **Tests à créer ou adapter** : aucun nouveau test de proxification réseau (rien à proxifier côté mobile). Tests à conserver intacts : `services/analytics/__tests__/sanitizer.test.ts`, `hooks/__tests__/use-radar-products.test.ts`, `utils/radar/__tests__/*.test.ts`. Pas de test à créer pour la suppression d'une variable inutilisée.

### Roadmap de sortie de release blocker

1. Supprimer `EXPO_PUBLIC_METAL_API_KEY` de `.env`. Supprimer toute trace dans les EAS build profiles si présente (hors périmètre code).
2. Faire tourner la clé chez `metals.dev`.
3. Re-définir `METALS_API_KEY` côté Supabase Edge Functions avec la nouvelle valeur.
4. Re-builder et re-publier l'APK pour purger les bundles antérieurs.
5. Vérification :
   ```bash
   grep -R "EXPO_PUBLIC_METAL_API_KEY" .
   grep -R "metals.dev" app components hooks lib services utils contexts constants
   ```
   Le premier grep ne doit retourner que `CLAUDE.md` + `docs/`. Le second doit retourner zéro résultat.
6. Marquer le release blocker `docs/release-blockers.md:11` comme résolu et le retirer.

---

## 9. Fichiers à modifier lors du prochain sprint

Liste minimale pour clore le release blocker `Proxifier metals.dev` :

- `.env` — supprimer la ligne 1 (`EXPO_PUBLIC_METAL_API_KEY=…`).
- `docs/release-blockers.md` — retirer le bloc `### Proxifier metals.dev` une fois la rotation effectuée et la suppression de `.env` confirmée.

Aucun fichier source TypeScript / TSX du mobile n'a besoin d'être touché pour la proxification.

Optionnel (P2) — fiabilisation post-release blocker :

- `supabase/migrations/<timestamp>_create_metal_prices_tables.sql` — replay baseline `metal_prices_spot`, `metal_prices_daily`, `prime_daily` aligné sur la prod (non confirmé dans le code audité, à dériver via inspection live).
- `supabase/functions/check-alerts/index.ts` — commenter la fréquence cron en tête de fichier.
- `supabase/functions/README.md` — documenter pattern Edge Function (auth, secrets, format réponse).

---

## 10. Questions ouvertes

Points **non confirmés dans le code audité** — à valider hors audit avant la production :

1. **Quel job alimente `metal_prices_spot` et `metal_prices_daily`** ? Aucun script d'ingestion n'est versionné dans `supabase/functions/` ni `supabase/migrations/`. Hypothèse plausible : une Edge Function ou un job externe non versionné.
2. **Quelle est la fréquence cron de `check-alerts`** ? La planification n'apparaît ni dans `supabase/config.toml` ni dans `supabase/functions/check-alerts/index.ts`.
3. **La clé `[REDACTED]` présente dans `.env:1` correspond-elle à la même clé que le secret `METALS_API_KEY` côté Supabase ?** Si oui, faire tourner les deux. Si non, faire tourner uniquement la `.env`.
4. **Le bundle EAS actuellement publié sur Play Store contient-il déjà la clé** ? Probablement oui, vu le préfixe `EXPO_PUBLIC_`. À confirmer en dépaquetant l'APK.
5. **Existe-t-il d'autres profils de build EAS (`eas.json`) qui re-injectent la variable** ? Hors fichiers audités.
6. **L'Edge Function `check-alerts` doit-elle persister les prix dans `metal_prices_spot` au passage** ? Aujourd'hui non (cf. `index.ts:91-97`, écriture en variable locale uniquement). Optimisation possible mais hors scope proxification.
7. **Y a-t-il un autre endpoint `metals.dev` consommé par un job externe non versionné** (history, range chart, batch, conversion devise) ? Le code audité ne montre que `/v1/latest`.
