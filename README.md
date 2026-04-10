# OrTrack

## Description courte

Application mobile Expo / React Native pour OrTrack.

## Stack

- Expo 54
- React 19
- React Native 0.81
- TypeScript
- Expo Router
- Supabase (`@supabase/supabase-js`)
- Jest / jest-expo
- ESLint (`eslint-config-expo`)

## Prérequis

- Node.js
- npm
- Un environnement Expo pour lancer l'application sur Android, iOS ou Web

## Installation

```bash
npm install
```

## Lancement

```bash
npm run start
```

Autres cibles disponibles :

```bash
npm run android
npm run ios
npm run web
```

## Scripts disponibles

- `npm run start` : démarre le serveur Expo
- `npm run android` : lance Expo pour Android
- `npm run ios` : lance Expo pour iOS
- `npm run web` : lance Expo pour le Web
- `npm run lint` : exécute le lint
- `npm run test` : exécute les tests Jest

## Structure rapide du projet

- `app/` : routes et écrans via Expo Router
- `assets/` : icônes et ressources statiques
- `components/` : composants UI réutilisables
- `constants/` : constantes applicatives
- `contexts/` : contextes React
- `hooks/` : hooks métier et hooks d'accès aux données
- `lib/` : intégrations et helpers techniques
- `services/` : services applicatifs
- `supabase/` : configuration et fonctions Supabase
- `types/` : types TypeScript
- `utils/` : utilitaires métier et de formatage
- `scripts/` : scripts de maintenance du dépôt
