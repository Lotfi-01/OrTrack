# OrTrack — Contexte Claude Code

OrTrack est une app mobile React Native/Expo de suivi des métaux précieux physiques.

Cible v1.0 : investisseurs français patrimoniaux, 40–65 ans.  
Langue produit : français exclusivement, vouvoiement formel.  
Fiscalité active v1.0 : France uniquement.  
BE/CH/LU : roadmap conditionnelle, sans code visible sans validation.

Différenciateur produit : le net vendeur après fiscalité.  
Cette métrique doit rester cohérente partout.

---

## Stack

- Expo SDK 54
- React Native
- TypeScript strict
- Expo Router
- Supabase
- AsyncStorage
- Jest
- GitHub Actions
- EAS Android

Commandes de vérification :

~~~bash
npx tsc --noEmit
npx jest
npx expo lint
~~~

---

## Sources de vérité

Avant toute modification, lire et réutiliser les fichiers concernés.

- Fiscal : `utils/fiscal.ts`
- Portefeuille : `utils/portfolio.ts`
- Storage keys : `constants/storage-keys.ts`
- Métaux : `constants/metals.ts`
- Stats : `constants/stats-config.ts`, `utils/stats-helpers.ts`
- Format : `utils/format.ts`
- Couleurs : `OrTrackColors`

Ne pas dupliquer une logique déjà centralisée.

---

## Règles de code

- TypeScript strict.
- Pas de `any` sans justification.
- Pas de `console.log` en production.
- Pas de catch vide.
- Pas de hex en dur dans les composants.
- Utiliser `OrTrackColors`.
- Utiliser les formatters manuels.
- Ne pas utiliser `toLocaleString` sur Hermes.
- Tester toute logique fiscale ou financière.
- Garder les écrans lisibles et maintenables.

`useCallback` et `useMemo` : uniquement là où ça impacte.

---

## Navigation

En contexte tabs :

- utiliser `router.replace` après save
- éviter `router.back`
- éviter `router.navigate`
- ne pas utiliser `router.setParams({ editId: undefined })`

Pour le lifecycle de tab :

- utiliser `useFocusEffect`
- éviter `useEffect` pour les effets liés au focus

---

## Formulaires

- `canSave` est la source de vérité du CTA.
- Ne pas créer de `isFormValid` parallèle.
- Pour Android TextInput sensible au backspace, utiliser `defaultValue` + `key` remount.

---

## Architecture

Rester simple.

À éviter sans demande explicite :

- nouvelle dépendance npm
- refactor global d’architecture, incluant migration vers `domain/` ou route centralization
- abstraction non reliée à une douleur réelle

Autorisé si ça réduit la dette :

- petits helpers
- hooks ciblés
- view models simples
- extraction de logique dupliquée

Pas de FlatList par réflexe sur petite liste.  
Choisir selon performance, lisibilité et besoin réel.

---

## Fiscalité

Blocage absolu :

- aucune nouvelle fiscalité pays sans source juridique primaire
- aucune phrase assimilable à du conseil fiscal
- aucun recalcul local du net vendeur hors source fiscale

Invariants :

- forfaitaire appliqué au prix de vente, même en moins-value
- `net vendeur` calculé via `utils/fiscal.ts`
- `computePortfolioFiscalSummary()` doit rester cohérent avec `fiscalite-globale.tsx`

Gestion d’erreur :

- logique pure : throw explicite si invariant cassé
- UI : état d’erreur visible, sans crash inutile
- jamais de catch silencieux

---

## Prix et historique

- Périodes 1S à 5A : EUR
- Périodes 10A et 20A : USD
- Mention obligatoire : `Cours en USD (source historique)`
- Ne jamais inventer une conversion EUR sur historique long

Raison : prix EUR absents avant `2021-03-07` dans Supabase.

---

## Sécurité

Aucune clé privée dans `EXPO_PUBLIC_*`.

Toute clé payante, sensible ou à quota limité doit passer par une Supabase Edge Function.

Cas bloquant avant production :

- `metals.dev` ne doit pas être appelé directement depuis l’app mobile
- `EXPO_PUBLIC_METAL_API_KEY` ne doit pas contenir de clé exploitable côté client

Voir `docs/release-blockers.md` pour le plan d’action avant production.

RLS obligatoire sur les données utilisateur.

---

## Analytics

Logs techniques et analytics produit sont deux sujets séparés.

- Logs structurés pour debug technique.
- Events centralisés pour funnel produit.
- Pas de tables event ad hoc sans spec analytics.

Source unique attendue : `utils/analytics.ts`.

Tous les events produit doivent passer par les helpers de ce fichier.

Interdits :

- appel direct à un SDK analytics depuis un composant
- payload contenant des données personnelles inutiles
- création de table event ad hoc sans spec analytics

Si `utils/analytics.ts` n’existe pas, le créer avant d’ajouter de nouveaux events.

Funnel prioritaire :

- install
- onboarding
- ajout position
- simulation
- paywall
- conversion

---

## Premium

V1.0 : paywall “Me prévenir au lancement”.  
RevenueCat : reporté v1.1.

Aucun contournement premium ne doit rester en production.  
Les bypass temporaires vivent dans `docs/release-blockers.md`.

---

## Workflow Claude Code

Avant modification :

1. Lire les fichiers concernés.
2. Identifier les conventions existantes.
3. Réutiliser les helpers existants.
4. Dire “rien à faire” si le code est déjà correct.

Après modification :

1. Lancer les commandes utiles.
2. Résumer les fichiers modifiés.
3. Signaler les risques restants.
4. Ne pas créer de commit sans demande.

Pour tâche simple :

- objectif
- fichiers à lire
- modifications attendues
- vérification

Pour refactor multi-fichiers :

- contexte
- objectif
- fichiers à lire
- modifications
- fichiers à ne pas toucher
- vérification

---

## Communication

Répondre en français.  
Être direct.  
Challenger le scope creep, la dette technique et le risque légal.  
Donner un avis tranché quand le choix est évident.