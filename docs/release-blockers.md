# OrTrack — Release blockers avant production

Ce fichier liste les points bloquants avant publication Play Store.

Un élément supprimé du code doit être retiré de cette checklist.

---

## 🔴 Sécurité

### Proxifier metals.dev

Statut : à faire.

Problème :

- `EXPO_PUBLIC_METAL_API_KEY` est exposé dans le bundle mobile.
- Un attaquant peut extraire la clé depuis l’APK.
- Le quota metals.dev peut être consommé hors app.
- L’app peut perdre l’accès aux prix sans bug côté mobile.

Décision :

- L’app mobile ne doit plus appeler metals.dev directement.
- Créer une Supabase Edge Function.
- Stocker la clé metals.dev côté Supabase.
- L’app appelle uniquement l’Edge Function.
- Ajouter un cache serveur pour limiter les appels metals.dev.
- Prévoir un fallback UI propre si l’API prix échoue.

Vérification attendue :

~~~bash
grep -R "EXPO_PUBLIC_METAL_API_KEY" .
grep -R "metals.dev" .
~~~

Critère de sortie :

- aucune clé metals.dev exploitable côté client
- appels prix centralisés via Supabase Edge Function
- cache serveur actif
- fallback UI propre si l’API prix échoue

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