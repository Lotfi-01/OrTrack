# OrTrack — Release blockers avant production

Ce fichier liste les points bloquants avant publication Play Store.

Un élément supprimé du code doit être retiré de cette checklist.

---

## 🔴 Sécurité

### Sécuriser metals.dev

Statut : à vérifier après suppression de la variable publique.

Problème initial :

- `EXPO_PUBLIC_METAL_API_KEY` est présente dans `.env`.
- Une variable `EXPO_PUBLIC_*` est destinée au client Expo.
- Si elle est référencée statiquement, elle peut être inlinée dans le bundle JS.
- Une clé metals.dev ne doit jamais vivre côté mobile.
- L’app peut perdre l’accès aux prix si le quota metals.dev est consommé hors app.

Décision post-audit :

- aucune Edge Function prix dédiée n’est créée pour le go-live
- le mobile n’appelle pas `metals.dev`
- les prix spot et historiques passent déjà par Supabase
- le risque immédiat vient de `EXPO_PUBLIC_METAL_API_KEY` dans `.env`
- le pipeline d’ingestion des tables prix reste à documenter post-launch

Actions go-live :

- supprimer `EXPO_PUBLIC_METAL_API_KEY`
- vérifier si `.env` est tracké ou l’a été
- rotater la clé si exposition confirmée
- vérifier que `METALS_API_KEY` côté Supabase contient la nouvelle clé
- rebuild Android après suppression de la variable publique

Vérification attendue :

~~~bash
git ls-files .env
git log -- .env
git check-ignore -v .env

grep -R "EXPO_PUBLIC_METAL_API_KEY" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.expo \
  --exclude-dir=dist \
  --exclude-dir=build

grep -R "metals.dev" app components hooks services lib utils constants contexts 2>/dev/null
~~~

Critère de sortie :

- aucun `EXPO_PUBLIC_METAL_API_KEY` actif côté mobile
- aucun appel `metals.dev` depuis le code mobile
- statut Git de `.env` documenté
- besoin de rotation clair
- secret `METALS_API_KEY` confirmé côté Supabase
- build Android refait après nettoyage

---

## 🔴 Premium

### Retirer les bypass premium temporaires

Statut : à faire.

Fichiers connus :

- `app/(tabs)/index.tsx`
- `components/price-chart.tsx`

Actions attendues :

- retirer le bypass des périodes premium
- renommer `_isPeriodLocked` en `isPeriodLocked`
- vérifier que les périodes verrouillées restent verrouillées
- vérifier que les périodes gratuites restent accessibles

Vérification attendue :

~~~bash
grep -R "_isPeriodLocked" .
grep -R "bypass" app components contexts utils
grep -R "isPeriodLocked" app components contexts utils
~~~

Critère de sortie :

- aucun bypass premium actif
- aucun nom `_isPeriodLocked`
- comportement premium cohérent sur Accueil et Chart

---

## 🟠 Fiscalité

### Confirmer cohérence fiscalité globale

Statut : à vérifier.

Invariant :

- `computePortfolioFiscalSummary()` doit matcher l’écran `fiscalite-globale.tsx`
- le net vendeur ne doit pas être recalculé localement
- le forfaitaire s’applique au prix de vente, même en moins-value

Vérification attendue :

~~~bash
npx jest utils/fiscal
grep -R "net vendeur" app components utils
grep -R "computePortfolioFiscalSummary" .
~~~

Critère de sortie :

- tests fiscaux OK
- aucune duplication de calcul fiscal critique
- affichages cohérents entre Portfolio et Simulation globale

---

## 🟠 Analytics funnel

### Vérifier les events v1.0

Statut : à vérifier.

Source unique attendue : `utils/analytics.ts`.

Tous les events produit doivent passer par les helpers de ce fichier.

Interdits :

- appel direct à un SDK analytics depuis un composant
- payload contenant des données personnelles inutiles
- création de table event ad hoc sans spec analytics

Si `utils/analytics.ts` n’existe pas, le créer avant d’ajouter de nouveaux events.

Events prioritaires :

- `session_start`
- `onboarding_completed`
- `add_position_started`
- `add_position_saved`
- `global_simulation_opened`
- `paywall_opened`
- `premium_intent_submitted`

Critère de sortie :

- events centralisés
- payloads sobres
- pas de données personnelles inutiles
- pas de table event ad hoc hors spec
- funnel lisible dans Supabase ou l’outil analytics choisi

---

## 🟢 Store readiness

### Vérifier informations publiques Play Store

Statut : à vérifier.

Points à contrôler :

- nom développeur affiché
- adresse publique
- email support
- politique de confidentialité
- nom OrTrack cohérent
- screenshots cohérents avec l’app réelle
- versionCode incrémenté avant build Android
- versionName cohérent avec le tag Git
- build EAS production généré depuis une branche propre

Vérification attendue :

~~~bash
git status --porcelain
cat app.json
cat app.config.js
eas build:version:get -p android
~~~

Si le versionCode doit être corrigé :

~~~bash
eas build:version:set -p android
~~~

Critère de sortie :

- aucune adresse personnelle exposée
- email support professionnel
- politique de confidentialité à jour
- versionCode supérieur au dernier build soumis
- versionName aligné avec la version publiée
- build production généré depuis un état Git propre

---

## 🟡 Post-launch tech debt metals.dev

Ces points ne bloquent pas le go-live v1.0.

Ils restent tracés pour éviter de refaire l’audit plus tard.

### P1 — `check-alerts` consomme metals.dev sans cache serveur

Statut : post-launch.

Constat :

- fichier : `supabase/functions/check-alerts/index.ts:56-58`
- `check-alerts` appelle `metals.dev` une fois par invocation
- chaque invocation cron consomme le quota metals.dev
- un échec metals.dev casse la vérification des alertes
- la fréquence cron n’est pas documentée dans le repo

Actions attendues :

- retrouver la fréquence réelle dans Supabase
- documenter la fréquence dans le repo
- vérifier le nombre d’appels mensuels estimés
- vérifier les logs d’échec
- décider si `check-alerts` doit lire `metal_prices_spot`
- décider si un cache serveur partagé est nécessaire

Critère de sortie :

- fréquence cron documentée
- volume mensuel estimé
- décision claire sur le cache spot
- impact quota maîtrisé

---

### P1 — Cycles `useSpotPrices` multipliés

Statut : post-launch.

Constat :

Plusieurs écrans ou composants appellent `useSpotPrices` directement.

Fichiers identifiés :

- `app/(tabs)/alertes.tsx:80`
- `app/statistiques.tsx:45`
- `app/fiscalite.tsx:47`
- `app/fiscalite-globale.tsx:191`
- `components/metal-converter.tsx:45`
- `components/indicateurs-panel.tsx:136`
- `components/metal-guide.tsx:141`

Risque :

- plusieurs cycles réseau Supabase
- plusieurs intervalles 30 min
- dette accrue si une Edge Function prix est ajoutée plus tard

Actions attendues :

- inventorier les consommateurs directs
- privilégier `useSharedSpotPrices` quand le provider est disponible
- étendre `SpotPricesProvider` aux écrans hors tabs si pertinent
- ajouter une déduplication module-level si nécessaire
- éviter un refactor large avant mesure réelle

Critère de sortie :

- un seul cycle spot principal dans les tabs
- consommateurs directs justifiés
- pas de polling dupliqué inutile

---

### P2 — Schéma tables prix non versionné

Statut : post-launch.

Tables concernées :

- `metal_prices_spot`
- `metal_prices_daily`
- `prime_daily`

Constat :

- les tables sont consommées par le mobile
- elles ne sont pas versionnées dans les migrations locales
- le schéma ne se rejoue pas en local Supabase
- le repo n’offre pas de filet de sécurité sur ces tables

Actions attendues :

- confirmer le schéma réel en production
- ajouter une migration baseline si le schéma doit être rejoué localement
- documenter les colonnes utilisées par l’app
- documenter les index nécessaires

Critère de sortie :

- schéma des tables prix documenté
- migration baseline ajoutée si nécessaire
- colonnes utilisées connues
- environnement local reproductible si requis

---

### P2 — Pipeline d’ingestion des prix non documenté

Statut : post-launch.

Constat :

- aucun script versionné n’alimente `metal_prices_spot`
- aucune Edge Function versionnée n’alimente `metal_prices_daily`
- la source d’ingestion des prix n’est pas documentée
- si l’ingestion casse, l’app peut servir des prix périmés

Actions attendues :

- identifier le job qui alimente `metal_prices_spot`
- identifier le job qui alimente `metal_prices_daily`
- documenter la fréquence de refresh
- documenter la source de la clé utilisée
- documenter le comportement si l’ingestion échoue
- définir comment détecter un prix stale

Critère de sortie :

- source d’ingestion connue
- fréquence de refresh connue
- comportement stale connu
- monitoring ou vérification manuelle documentée

---

### P3 — `RadarDashboardCard` potentiellement non utilisé

Statut : post-launch.

Constat :

- fichier : `components/radar/RadarDashboardCard.tsx`
- composant potentiellement dormant
- usage réel non confirmé

Actions attendues :

- grep des imports
- confirmer s’il est utilisé
- supprimer si inutilisé
- conserver si prévu pour une feature proche et documentée

Critère de sortie :

- composant confirmé utile ou supprimé
- pas de code dormant non justifié

---

### P3 — Évaluer une Edge Function prix dédiée

Statut : post-launch.

Décision actuelle :

Aucune Edge Function prix dédiée avant go-live.

Critères pour rouvrir le sujet :

- tables prix non fiables
- ingestion non maîtrisée
- besoin de rate limiting serveur
- besoin de fallback live `metals.dev`
- besoin d’empêcher le mobile de lire directement les tables prix
- besoin d’unifier spot, history et stale policy

Décision cible si nécessaire :

- créer une seule Edge Function `metal-prices`
- exposer des actions internes
- garder les formats des hooks existants
- réutiliser `metal_prices_spot` et `metal_prices_daily`
- conserver le cache mobile existant

Critère de sortie :

- décision documentée
- pas de refactor sans preuve
- pas de nouvelle couche serveur sans gain mesuré