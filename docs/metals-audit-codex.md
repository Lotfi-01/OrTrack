# Audit metals.dev - état des lieux

Date : 2026-04-30

## Résumé exécutif

- Nombre d’appels directs metals.dev : 0 depuis le mobile ; 1 côté Supabase Edge Function (`check-alerts`).
- Nombre d’usages EXPO_PUBLIC_METAL_API_KEY : 1 configuration locale (`.env:1`, valeur `[REDACTED]`) ; 0 lecture dans le code source mobile audité.
- Risque principal : une clé metals.dev existe sous préfixe public Expo dans `.env`, même si son utilisation dans le bundle n’est pas confirmée par le code audité.
- Recommandation : supprimer/rotater la clé `EXPO_PUBLIC_METAL_API_KEY`, conserver la clé uniquement comme secret Supabase (`METALS_API_KEY`), puis centraliser les lectures prix derrière une Edge Function prix avec cache serveur.
- Nombre d’Edge Functions recommandé : 1 Edge Function prix dédiée, en plus de `check-alerts` qui existe déjà.

## 1. Appels metals.dev directs depuis le mobile

Aucun appel direct à `metals.dev` depuis le code mobile n’a été confirmé dans les fichiers audités. Les recherches sur `app/`, `components/`, `contexts/`, `hooks/`, `services/`, `lib/`, `utils/` et `constants/` ne trouvent pas `metals.dev`, `api.metals`, `EXPO_PUBLIC_METAL_API_KEY` ni lecture `process.env.EXPO_PUBLIC_METAL_API_KEY`.

| fichier:ligne | endpoint | caller | fréquence | données | risque |
|---|---|---|---|---|---|
| Aucun depuis le mobile | Non applicable | Non applicable | 0 appel metals.dev | Non applicable | Le risque "appel direct mobile vers metals.dev" n’est pas confirmé dans le code audité. |

Appel direct `metals.dev` hors mobile :

| fichier:ligne | endpoint | méthode | paramètres | headers | caller direct | caller parent | fréquence | données | type | risque |
|---|---|---|---|---|---|---|---|---|---|---|
| `supabase/functions/check-alerts/index.ts:56-58` | `https://api.metals.dev/v1/latest` | GET implicite via `fetch` | `api_key=[REDACTED]`, `currency=EUR`, `unit=toz` | Aucun header spécifique | Handler `Deno.serve` de `check-alerts` | Commentaire de cron, mais schedule non trouvé dans le repo. Non confirmé dans le code audité. | 1 appel par invocation de `check-alerts` | `pricesData.metals` avec `gold`, `silver`, `platinum`, `palladium`, puis mapping vers `or`, `argent`, `platine`, `palladium` | spot price, batch metals | Quota serveur metals.dev consommé à chaque invocation ; pas de cache serveur dans la fonction ; échec bloque la vérification des alertes. |

Dépendance focus/mount/action/polling : aucun appel `metals.dev` mobile ne dépend du focus, du mount, d’une action utilisateur ou d’un polling. L’appel serveur `check-alerts` dépend d’une invocation HTTP autorisée par `CRON_SECRET`; la planification réelle n’est pas confirmée dans le code audité.

## 2. Usages de EXPO_PUBLIC_METAL_API_KEY

- `.env:1` : variable `EXPO_PUBLIC_METAL_API_KEY=[REDACTED]`. Contexte : configuration locale, valeur non recopiée. Risque : préfixe `EXPO_PUBLIC_*` destiné au client Expo ; exposition effective dans le bundle non confirmée dans le code audité car aucune lecture `process.env.EXPO_PUBLIC_METAL_API_KEY` n’a été trouvée. Remplacement attendu : supprimer cette variable de l’environnement mobile, rotater la clé si elle a été utilisée dans un build, stocker la clé uniquement côté Supabase sous `METALS_API_KEY`.
- `CLAUDE.md:158` : mention documentaire de la règle sécurité. Contexte : documentation, pas runtime. Remplacement attendu : garder la règle, mais mettre à jour après migration si nécessaire.
- `docs/release-blockers.md:17` et `docs/release-blockers.md:34` : mention documentaire du blocker et commande de vérification. Contexte : documentation, pas runtime. Remplacement attendu : mettre à jour le statut quand la clé publique est supprimée et que la fonction prix est en place.

Usages indirects cherchés et non trouvés : constante intermédiaire, helper réseau, service prix, hook prix ou config lisant `EXPO_PUBLIC_METAL_API_KEY`. Non confirmé dans le code audité.

Usage serveur connexe :

- `supabase/functions/check-alerts/index.ts:44` lit `Deno.env.get('METALS_API_KEY')`. C’est un secret serveur Supabase, pas une variable `EXPO_PUBLIC_*`.
- `supabase/functions/check-alerts/index.ts:47` retourne l’erreur textuelle `METALS_API_KEY not configured` si le secret serveur est absent. Aucune valeur de secret n’est exposée.

## 3. Couche réseau prix actuelle

Le fichier principal de récupération des prix spot est `hooks/use-spot-prices.ts`.

Responsabilités actuelles :

- `hooks/use-spot-prices.ts:60-121` : `fetchSpotFromSupabase(currency)` appelle directement l’API REST Supabase `metal_prices_spot`.
- `hooks/use-spot-prices.ts:70-76` : endpoint REST `metal_prices_spot?select=metal,price_usd,price_eur,price_chf`, headers `apikey` et `Authorization` avec `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `hooks/use-spot-prices.ts:88-117` : transforme les lignes Supabase en format interne `{ gold, silver, platinum, palladium }`, avec trois vues : devise courante, EUR et USD.
- `hooks/use-spot-prices.ts:143-245` : gère loading initial, refreshing silencieux, erreur, cache, refresh manuel et polling 30 minutes.
- `contexts/spot-prices-context.tsx:16-23` : monte un provider partagé pour les tabs.

Historique et chart :

- `hooks/use-metal-history.ts:94-171` : `loadPriceHistory(period, currency, metal?)` appelle `metal_prices_daily` via REST Supabase, avec pagination `limit=1000` et `offset`.
- `hooks/use-metal-history.ts:101-103` : force les périodes `10A` et `20A` en USD.
- `hooks/use-metal-history.ts:145-157` : si EUR/CHF manque, reconstruit toute la série en USD pour éviter un mélange de devises.
- `components/price-chart.tsx:117-130` : charge l’historique au mount et à chaque changement de période/devise/métal.
- `app/(tabs)/index.tsx:156-161` : charge l’historique du métal sélectionné pour le graphique Accueil.
- `app/(tabs)/index.tsx:166-183` : charge `1S` tous métaux pour calculer la variation 24h.
- `app/graphique.tsx:35` : affiche `PriceChart` en plein écran.

Consommateurs spot partagés via `useSharedSpotPrices` :

- `app/(tabs)/_layout.tsx:10` : provider autour des tabs.
- `app/(tabs)/index.tsx:112` : Accueil.
- `app/(tabs)/portefeuille.tsx:55` : Portefeuille.
- `app/(tabs)/ajouter.tsx:155` : Ajouter.

Consommateurs qui appellent directement `useSpotPrices` et démarrent donc leur propre cycle runtime :

- `app/(tabs)/alertes.tsx:80`
- `app/statistiques.tsx:45`
- `app/fiscalite.tsx:47`
- `app/fiscalite-globale.tsx:191`
- `components/metal-converter.tsx:45`
- `components/indicateurs-panel.tsx:136`
- `components/metal-guide.tsx:141`

Réponses aux points d’architecture :

- Le code a une couche service centralisée partielle : spot dans `use-spot-prices.ts`, historique dans `use-metal-history.ts`, radar dans `utils/radar/radar-query.ts`.
- Les composants n’appellent pas `metals.dev` directement. Certains composants appellent toutefois `useSpotPrices` directement, ce qui démarre plusieurs cycles réseau Supabase si ces composants sont montés.
- La proxification prix peut préserver l’API des hooks et donc éviter de modifier tous les composants. Les points principaux à modifier sont `hooks/use-spot-prices.ts`, `hooks/use-metal-history.ts`, et probablement `supabase/functions/check-alerts/index.ts` si les alertes doivent réutiliser le cache prix serveur.

Gestion erreur/retry/fallback :

- Spot : timeout 10 s, erreur en state, fallback sur cache expiré, pas de retry automatique court, refresh manuel exposé.
- Historique : pas de timeout explicite, erreurs avalées avec retour `{ data: [], actualCurrency }`, cache local si valide.
- Radar Prime : `useRadarProducts` expose `error` et `refetch`, avec cache mémoire 15 min.

## 4. Cache actuel

### Cache client

Clés AsyncStorage liées aux prix :

- `constants/storage-keys.ts:7` : `@ortrack:spot_cache`.
- `constants/storage-keys.ts:8` : `@ortrack:price_history`.
- `constants/storage-keys.ts:9` : préfixe dynamique `@ortrack:history_cache_`.

Spot :

- `hooks/use-spot-prices.ts:8-10` : polling 30 min, TTL cache 29 min, timeout fetch 10 s.
- `hooks/use-spot-prices.ts:152-170` : si cache valide et devise identique, aucun fetch réseau.
- `hooks/use-spot-prices.ts:192-198` : écrit `prices`, `pricesEur`, `pricesUsd`, `currency`, `timestamp`.
- `hooks/use-spot-prices.ts:205-226` : si le fetch échoue, fallback sur cache même expiré et erreur visible `Données en cache — mise à jour impossible`.
- `hooks/use-spot-prices.ts:233-239` : fetch au mount puis intervalle 30 min.
- `hooks/use-spot-prices.ts:243` : refresh manuel force le réseau et ignore le cache valide.

Historique :

- `hooks/use-metal-history.ts:6` : TTL 60 min.
- `hooks/use-metal-history.ts:103` : clé `${historyCachePrefix}${period}_${requestedCurrency}${metal?}`.
- `hooks/use-metal-history.ts:108-114` : lecture du cache.
- `hooks/use-metal-history.ts:159-165` : écriture du cache.
- `hooks/use-metal-history.ts:173-193` : `savePricePoint` maintient un historique local court, max 200 points, sous `@ortrack:price_history`.

Invalidation :

- `app/(tabs)/reglages.tsx:287-305` : changement de devise supprime `spotCache` et une liste de caches historiques.
- Point à corriger : cette invalidation liste `1M`, `3M`, `1A`, `5A`, `10A`, `20A`, mais pas `1S`, alors que `1S` est utilisé par Accueil et `PriceChart`.
- `lib/local-wipe.ts:33-38` : suppression locale globale récupère toutes les clés et supprime celles qui commencent par `historyCachePrefix`.

Refresh :

- Focus Accueil/Portefeuille : recharge les positions, pas les prix spot.
- Accueil : pull-to-refresh appelle `refresh` et force un fetch spot.
- Ajouter : `app/(tabs)/ajouter.tsx:159-163` appelle `refresh()` au focus, donc force un fetch spot Supabase à l’ouverture de l’écran.
- Périodes chart : chaque changement de période appelle `loadPriceHistory`.
- Polling : chaque instance active de `useSpotPrices` lance son propre intervalle 30 min.

### Cache serveur

Tables Supabase consommées par le mobile :

- `metal_prices_spot` : lu par `hooks/use-spot-prices.ts:70`. Sert les prix spot `metal`, `price_usd`, `price_eur`, `price_chf`.
- `metal_prices_daily` : lu par `hooks/use-metal-history.ts:129`. Sert l’historique journalier `date`, `metal`, `price_usd`, `price_eur`, `price_chf`.
- `prime_daily` : lu par `utils/radar/radar-query.ts:38`, `utils/radar/radar-query.ts:49`, `utils/radar/radar-query.ts:73`. Sert Radar Prime, pas les prix spot métaux.

Tables recherchées :

- `market_prices` : aucune occurrence trouvée.
- `prime_daily` : utilisée par Radar Prime.

État confirmé :

- Le mobile lit déjà des prix spot et historiques depuis Supabase, pas depuis `metals.dev`.
- `check-alerts` ne réutilise pas `metal_prices_spot`; il appelle `metals.dev` directement à chaque invocation.
- Les migrations locales ne définissent pas `metal_prices_spot`, `metal_prices_daily` ni `prime_daily`; elles définissent seulement `alerts`, `app_installs`, `push_tokens`, `analytics_events` et `analytics_rate_limits`.

Réponses :

- Un cache serveur existe-t-il déjà pour les prix spot ? Le code mobile consomme `metal_prices_spot`, donc une table serveur est attendue. Son schéma, son alimentation et son TTL ne sont pas confirmés dans le code audité.
- Un cache serveur existe-t-il déjà pour l’historique ? Le code mobile consomme `metal_prices_daily`, donc une table serveur est attendue. Son schéma, son alimentation et son TTL ne sont pas confirmés dans le code audité.
- Faut-il créer une table de cache ? Si les tables existent en production, il faut les réutiliser et ajouter une migration locale de schéma. Si elles n’existent pas ou ne sont pas maîtrisées, il faut créer un cache serveur formel.
- Faut-il réutiliser une table existante ? Oui, recommandation : réutiliser `metal_prices_spot` et `metal_prices_daily` si leur présence production est confirmée, pour limiter la migration mobile.

## 5. Volume d’appels estimé

Tous les scénarios ci-dessous indiquent les appels `metals.dev`. Les appels Supabase sont mentionnés pour anticiper l’impact après proxification.

| Scénario | Appels metals.dev estimés | Endpoint metals.dev | Déclencheur | Risque quota | Opportunité de cache |
|---|---:|---|---|---|---|
| Démarrage app sur Accueil | 0 | Aucun | Mount du provider + effets Accueil | Aucun quota metals.dev côté mobile | Spot : `metal_prices_spot` cache 29 min. Historique : `metal_prices_daily` cache 60 min. |
| Retour sur Accueil après navigation | 0 | Aucun | Focus tab, positions rechargées | Aucun quota metals.dev côté mobile | Provider tabs reste monté ; pas de fetch spot sauf polling/refresh. |
| Ouverture Portfolio | 0 | Aucun | Focus tab | Aucun quota metals.dev côté mobile | Réutilise provider spot partagé. |
| Ouverture écran Chart | 0 | Aucun | Mount `PriceChart` | Aucun quota metals.dev côté mobile | `loadPriceHistory` lit/cache `metal_prices_daily`. |
| Changement de période chart | 0 | Aucun | `setPeriod` puis `loadPriceHistory` | Aucun quota metals.dev côté mobile | Cache par période/devise/métal ; le 1S doit être inclus dans l’invalidation. |
| Ouverture Radar Prime | 0 | Aucun | `useRadarProducts` au focus | Aucun quota metals.dev côté mobile | Cache mémoire Radar 15 min ; lit `prime_daily`. |
| Ajout d’une position | 0 | Aucun | Focus de l’écran Ajouter force `refresh()` | Aucun quota metals.dev côté mobile | Après proxy, ce force refresh deviendra un appel Edge Function spot ; cache serveur nécessaire. |
| Refresh manuel si existant | 0 | Aucun | Pull-to-refresh Accueil appelle `refresh()` | Aucun quota metals.dev côté mobile | À servir depuis cache serveur ou fetch server si stale. |
| Polling ou background si existant | 0 | Aucun | Intervalles 30 min de chaque instance `useSpotPrices` active | Aucun quota metals.dev côté mobile | Risque futur : si le hook appelle une Edge Function prix, plusieurs instances peuvent multiplier les appels. |

Fourchette Supabase actuelle, hors cache :

- Accueil à froid : environ 1 fetch spot + 1 fetch historique `1A` métal + 1 fetch historique `1S` tous métaux. Les gros historiques peuvent paginer par blocs de 1000 lignes.
- Chart : 1 à plusieurs fetchs Supabase selon période et pagination.
- Radar : 3 queries Supabase si cache mémoire absent (`latestDate`, primes courantes, historique).
- Ajouter : 1 fetch spot forcé à chaque focus.

Hors scénarios utilisateur : `check-alerts` effectue 1 appel `metals.dev /v1/latest` par invocation serveur. La fréquence de scheduling est non confirmée dans le code audité.

## 6. Pattern Edge Function existant

Référence : `supabase/functions/check-alerts`.

Structure :

- Dossier : `supabase/functions/check-alerts/`.
- Fichier principal : `supabase/functions/check-alerts/index.ts`.
- Import : `createClient` depuis `https://esm.sh/@supabase/supabase-js@2`.
- Pas de fichier partagé ou helper local dans ce dossier.

Pattern `check-alerts` :

- `supabase/functions/check-alerts/index.ts:6-7` : lit `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` via `Deno.env`.
- `supabase/functions/check-alerts/index.ts:27` : handler `Deno.serve`.
- `supabase/functions/check-alerts/index.ts:29-40` : exige `CRON_SECRET` et compare `Authorization: Bearer ...`.
- Méthode HTTP : aucune restriction explicite ; toute méthode avec bon header passe la garde.
- CORS : aucune gestion `OPTIONS` ni headers CORS.
- `supabase/functions/check-alerts/index.ts:44-50` : lit `METALS_API_KEY` via `Deno.env`.
- `supabase/functions/check-alerts/index.ts:53` : crée un client Supabase service role dans le handler.
- `supabase/functions/check-alerts/index.ts:56-58` : appelle `metals.dev`.
- `supabase/functions/check-alerts/index.ts:72-87` : valide le statut API et la shape `metals`.
- `supabase/functions/check-alerts/index.ts:91-97` : mappe les métaux anglais vers les métaux français.
- `supabase/functions/check-alerts/index.ts:102-105` : lit toutes les alertes actives avec service role.
- `supabase/functions/check-alerts/index.ts:181-190` : envoie les notifications via Expo Push API.
- `supabase/functions/check-alerts/index.ts:251-257` : désactive les alertes acceptées par Expo.
- Format réponse : JSON avec `Content-Type: application/json`, mais sans helper central.
- Logs : `console.log`/`console.error` pour prix, indisponibilités, push et erreurs.
- Pattern de secret : secret serveur `METALS_API_KEY`, `CRON_SECRET`, service role Supabase.
- Pattern scheduling : commentaires de cron, mais aucun fichier de schedule trouvé. Non confirmé dans le code audité.
- Invocation mobile : aucune invocation de `check-alerts` depuis le mobile trouvée.

Pattern Edge Function mobile existant à considérer :

- `services/analytics/client.ts:117-127` appelle `/functions/v1/track-event` par `fetch`.
- `supabase/functions/track-event/index.ts:145-156` impose `POST` et le header `x-ortrack-client: mobile`.
- `supabase/functions/track-event/index.ts:158-229` valide strictement le JSON.
- `supabase/functions/track-event/index.ts:76-80` centralise les réponses JSON.
- `supabase/functions/track-event/index.ts:72-74` crée le client service role au module scope.

Recherches :

- `supabase.functions.invoke` : aucune occurrence trouvée.
- Appels `fetch` vers Supabase Functions : `services/analytics/client.ts:117`.
- Scripts de déploiement Supabase Functions : aucun script npm ou fichier local trouvé.
- Documentation locale des Edge Functions prix : non confirmée dans le code audité.

Réponses :

- Pattern à réutiliser pour `metals.dev` : pour une fonction prix appelée par le mobile, réutiliser la validation HTTP/JSON de `track-event` et la gestion de secrets/service role de `check-alerts`.
- Faut-il une seule Edge Function ou plusieurs ? Une seule Edge Function prix est recommandée.
- Nom recommandé : `metal-prices`.

## 7. Risques classés

### Critique

1. Clé metals.dev sous préfixe public Expo
   - Impact : une clé présente sous `EXPO_PUBLIC_*` est destinée au client et peut être exposée en build si utilisée par Expo ou par configuration de build. La présence dans le bundle n’est pas confirmée par le code audité, mais la configuration locale est incompatible avec la règle sécurité.
   - Fichier concerné : `.env:1`, valeur `[REDACTED]`.
   - Action recommandée : supprimer `EXPO_PUBLIC_METAL_API_KEY`, rotater la clé si elle a été utilisée dans un build, stocker uniquement `METALS_API_KEY` comme secret Supabase.
   - Priorité : P0 avant publication.

2. `check-alerts` appelle `metals.dev` sans cache serveur
   - Impact : chaque invocation consomme le quota metals.dev ; une erreur metals.dev bloque la vérification des alertes et donc les notifications de seuil.
   - Fichier concerné : `supabase/functions/check-alerts/index.ts:56-58`.
   - Action recommandée : faire lire `check-alerts` depuis le cache spot serveur ou mutualiser avec la future Edge Function `metal-prices`.
   - Priorité : P0/P1 selon la fréquence réelle du cron. Fréquence non confirmée dans le code audité.

### Moyen

3. Couche prix mobile couplée directement à REST Supabase
   - Impact : la logique prix est centralisée dans des hooks, mais les hooks construisent eux-mêmes les URLs REST Supabase. La migration vers une Edge Function demandera au moins deux points (`use-spot-prices`, `use-metal-history`) et pas une simple variable d’URL.
   - Fichiers concernés : `hooks/use-spot-prices.ts:70`, `hooks/use-metal-history.ts:129`.
   - Action recommandée : introduire un petit service client `services/metal-prices.ts` ou remplacer les fetchs dans les deux hooks par `/functions/v1/metal-prices`.
   - Priorité : P1.

4. Multiplication potentielle des cycles spot
   - Impact : plusieurs écrans/composants appellent `useSpotPrices` directement et créent leur propre polling 30 min. Aujourd’hui le cache AsyncStorage limite l’impact ; demain cela peut multiplier les appels Edge Function.
   - Fichiers concernés : `app/(tabs)/alertes.tsx:80`, `app/statistiques.tsx:45`, `app/fiscalite.tsx:47`, `app/fiscalite-globale.tsx:191`, `components/metal-converter.tsx:45`, `components/indicateurs-panel.tsx:136`, `components/metal-guide.tsx:141`.
   - Action recommandée : réutiliser le provider quand possible ou ajouter une déduplication module-level dans le client prix.
   - Priorité : P1.

5. Tables prix serveur sans schéma local confirmé
   - Impact : `metal_prices_spot`, `metal_prices_daily` et `prime_daily` sont consommées, mais absentes des migrations locales. La stratégie de cache serveur ne peut pas être validée en local par replay.
   - Fichiers concernés : `hooks/use-spot-prices.ts:70`, `hooks/use-metal-history.ts:129`, `utils/radar/radar-query.ts:38`.
   - Action recommandée : ajouter des migrations de schéma ou documenter explicitement ces tables comme baseline distante réparée.
   - Priorité : P1.

### Mineur

6. Invalidation historique incomplète sur changement de devise
   - Impact : la clé `1S` n’est pas supprimée alors que l’Accueil et `PriceChart` l’utilisent.
   - Fichier concerné : `app/(tabs)/reglages.tsx:289-304`.
   - Action recommandée : inclure `1S` dans la liste des périodes invalidées.
   - Priorité : P2.

7. `RadarDashboardCard` semble non utilisé
   - Impact : ce composant déclencherait `useRadarProducts` et donc 3 queries Supabase s’il était monté, mais aucune importation active n’a été trouvée.
   - Fichier concerné : `components/radar/RadarDashboardCard.tsx:52-60`.
   - Action recommandée : confirmer s’il s’agit de code dormant avant de l’inclure dans le plan de migration.
   - Priorité : P3.

## 8. Recommandations pour la proxification

Architecture cible simple :

- Créer une seule Edge Function prix : `supabase/functions/metal-prices`.
- Exposer plusieurs actions internes dans cette fonction plutôt que plusieurs fonctions.
- Ne laisser aucun secret metals.dev côté mobile.
- Conserver les formats internes existants des hooks pour limiter les changements UI.

Endpoints internes recommandés :

- `spot` : retourne `{ prices, pricesEur, pricesUsd, lastUpdated, source }` pour `gold`, `silver`, `platinum`, `palladium`.
- `history` : paramètres `period`, `currency`, `metal?`; retourne `{ data, actualCurrency }` au format `PricePoint[]`.
- Optionnel plus tard : `convert` si une conversion devise/métal dédiée devient nécessaire. Non confirmé dans le code audité aujourd’hui.

Stratégie de cache :

- Spot : réutiliser `metal_prices_spot` si la table est confirmée ; TTL serveur recommandé 10 à 15 min ; fallback serveur possible sur dernière ligne connue.
- Historique : réutiliser `metal_prices_daily` si la table est confirmée ; TTL serveur recommandé 24 h ou invalidation après refresh quotidien.
- Mobile : conserver `@ortrack:spot_cache` et `@ortrack:history_cache_*` comme fallback offline/stale.
- Alertes : modifier `check-alerts` pour utiliser le cache spot serveur ou une logique partagée avec `metal-prices`, afin d’éviter un appel metals.dev par cron si le cache est frais.

Fallback mobile :

- Garder le fallback actuel sur cache expiré pour spot.
- Pour historique, retourner une erreur typée côté fonction et laisser le hook retomber sur cache si présent ; sinon afficher l’état vide actuel.
- Ne jamais afficher ou logger une clé API.

Ordre de migration recommandé :

1. Supprimer `EXPO_PUBLIC_METAL_API_KEY` des environnements mobiles et rotater la clé si un build public a pu l’embarquer.
2. Confirmer ou créer le schéma local des tables `metal_prices_spot` et `metal_prices_daily`.
3. Créer `supabase/functions/metal-prices` avec validation stricte, secrets Supabase et cache serveur.
4. Migrer `hooks/use-spot-prices.ts` vers la fonction `metal-prices?action=spot` en conservant le format de retour.
5. Migrer `hooks/use-metal-history.ts` vers la fonction `metal-prices?action=history`.
6. Adapter `check-alerts` pour lire les prix spot depuis le cache serveur ou depuis la même logique serveur.
7. Réduire les cycles `useSpotPrices` directs ou dédupliquer les fetchs au niveau module.
8. Mettre à jour `docs/release-blockers.md` seulement après vérification `rg`.

Tests à créer ou adapter :

- Tests unitaires du mapper metals.dev vers `{ gold, silver, platinum, palladium }` et vers les clés françaises nécessaires aux alertes.
- Tests de validation paramètres Edge Function : action inconnue, période invalide, devise invalide, métal invalide.
- Tests cache serveur : cache fresh, cache stale, fallback stale sur erreur metals.dev.
- Tests hooks avec `fetch` mocké : spot success, spot fallback cache, history long terme USD, history erreur.
- Vérifications statiques : `rg "metals\\.dev|EXPO_PUBLIC_METAL_API_KEY|METAL_API" app components hooks services lib utils constants contexts`.

## 9. Fichiers à modifier lors du prochain sprint

- `.env` et variables EAS/CI : supprimer `EXPO_PUBLIC_METAL_API_KEY`, utiliser un secret Supabase `METALS_API_KEY`.
- `supabase/functions/metal-prices/index.ts` : nouvelle Edge Function prix.
- `supabase/functions/check-alerts/index.ts` : réutiliser le cache prix serveur, éviter l’appel direct metals.dev non caché.
- `hooks/use-spot-prices.ts` : remplacer le fetch REST `metal_prices_spot` par l’appel Edge Function.
- `hooks/use-metal-history.ts` : remplacer le fetch REST `metal_prices_daily` par l’appel Edge Function.
- `services/metal-prices.ts` : fichier probable pour centraliser le client mobile prix, si l’équipe préfère ne pas mettre les URLs de fonction dans les hooks.
- `app/(tabs)/reglages.tsx` : corriger l’invalidation `1S`.
- `contexts/spot-prices-context.tsx` et consommateurs directs de `useSpotPrices` : optionnel, pour réduire les cycles réseau.
- `supabase/migrations/*` : ajouter ou réparer le schéma des tables `metal_prices_spot`, `metal_prices_daily`, et éventuellement `prime_daily`.
- `docs/release-blockers.md` : mettre à jour le statut après migration et vérification.

## 10. Questions ouvertes

- La clé `.env:1` est-elle aussi configurée dans EAS, CI ou un build déjà publié ? Non confirmé dans le code audité.
- `EXPO_PUBLIC_METAL_API_KEY` est-elle réellement présente dans un bundle JS existant malgré l’absence de lecture dans le code source ? Non confirmé dans le code audité.
- Les tables `metal_prices_spot` et `metal_prices_daily` existent-elles en production avec un job de refresh actif ? Non confirmé dans le code audité.
- Quelle est la fréquence réelle d’invocation de `check-alerts` ? Non confirmé dans le code audité.
- Qui alimente `prime_daily` et à quelle fréquence ? Non confirmé dans le code audité.
- Faut-il interdire au mobile la lecture directe des tables Supabase prix ou seulement supprimer tout accès `metals.dev` et toute clé publique metals.dev ? Non confirmé dans le code audité.
