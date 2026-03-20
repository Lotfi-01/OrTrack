# AUDIT RÉGLAGES — Résultats

F1_FILE: `app/(tabs)/reglages.tsx` — composant unique `ReglagesScreen` avec sous-composants inline (`SectionTitle`, `ItemSeparator`, `ToggleRow`, `SegmentRow`, `ActionRow`, `InfoRow`). Fichier externe lié : `components/premium-paywall.tsx` (affiché via `usePremium().showPaywall()`).

F2_HEADER: inline dans le JSX. `<View style={styles.header}>` contient "ORTRACK" (gold, 13px, fontWeight 700, letterSpacing 2, uppercase) à gauche et "Réglages" (subtext, 13px) à droite. marginBottom 24.

F3_PREMIUM_CARD: `<TouchableOpacity style={styles.premiumCard}>` avec :
- Gauche : icône couronne SVG (32x32, Path fill gold) + "OrTrack Premium" (gold, 15px, fontWeight 700) + "Découvrir les avantages" (subtext, 12px)
- Droite : Ionicons `chevron-forward` (18px, gold)
- Au tap : `showPaywall()` (ouvre le modal PremiumPaywall via le context)
- Style : fond card, borderRadius 12, border `rgba(201,168,76,0.3)` 1px, padding 16, marginBottom 24
- Le paywall est géré par `contexts/premium-context.tsx` qui rend un `<Modal>` avec `<PremiumPaywall>`.

F4_PROFIL: expandable via state `showProfileForm` (boolean). Header : avatar initiales (40x40 cercle doré), nom (ou "Ajouter votre nom"), email (ou "Ajouter votre email"), chevron up/down. Champs : nom (TextInput), email (TextInput email-address). Stockage : `AsyncStorage.setItem('@ortrack:profil', JSON.stringify({name, email}))`. Bouton "Enregistrer" (bordure gold) → feedback "✓ Enregistré" (fond vert #2E7D32) pendant 2s. Le nom est utilisé pour les initiales de l'avatar (`getInitials`). Le nom n'est PAS utilisé sur l'écran Accueil ni ailleurs.

F5_PREFERENCES: devise `settings.currency` (EUR/USD/CHF), rendu via `SegmentRow`. Stocké dans `AsyncStorage '@ortrack:settings'`. Au changement de devise : supprime le cache spot + tous les caches historiques, puis `router.replace('/(tabs)/')` pour recharger. Rafraîchissement auto : toggle `settings.autoRefresh` + segment intervalle (5/15/30 min) conditionnel. Sauvegarde instantanée à chaque changement (`updateSettings`).

F6_NOTIFICATIONS: 3 toggles (`ToggleRow` avec `Switch`) :
1. "Alertes de cours" (`notifPriceAlert`) — "Variations importantes de l'or et de l'argent"
2. "Variation journalière" (`notifDailyVariation`) — "Récap quotidien de votre portefeuille"
3. "Bilan hebdomadaire" (`notifWeeklyReport`) — "Résumé de la semaine chaque dimanche"
Stockage : dans l'objet `settings` (AsyncStorage). Pas d'appel direct à `expo-notifications` pour les permissions — c'est géré séparément (push token dans alertes.tsx). Lien "Gérer mes alertes de cours" → `router.push('/alertes')`.

F7_DONNEES_EXPORT: 3 boutons `ActionRow` :
1. "Exporter mon portefeuille (JSON)" → `Share.share({ message: json, title })` — Share sheet natif
2. "Exporter en CSV" → `Share.share({ message: csv, title })` — Share sheet natif. Si 0 positions : `Alert.alert('Aucune donnée', 'Votre portefeuille est vide.')`
3. "Sauvegarder mes données" → exporte positions + profil + settings en JSON via `Share.share`
Pas de `FileSystem`. Feedback = la Share sheet s'ouvre.

F8_DONNEES_DELETE: `Alert.alert('Supprimer toutes les données', 'Cette action effacera définitivement...', [Annuler, 'Tout supprimer'(destructive)])`. Confirmation obligatoire. Supprime : `POSITIONS_KEY`, `PROFILE_KEY`, `SETTINGS_KEY` via `AsyncStorage.multiRemove`. Reset des states en mémoire. Feedback : `Alert.alert('Données supprimées', 'Toutes vos données ont été effacées.')`.

F9_ABOUT: version hardcodée "1.0.0" (`InfoRow label="Version" value="1.0.0"`). Application = "OrTrack". Mentions légales et Politique de confidentialité → `Alert.alert` avec texte inline (pas de WebView, pas de Linking). Tutoriel de démarrage → supprime `@ortrack:onboarding_complete` puis `router.replace('/onboarding')`.

F10_SECURITY: biométrique via `expo-local-authentication`. Vérifie `hasHardwareAsync()` + `isEnrolledAsync()`. Si disponible → toggle `Switch` affiché dans section "Sécurité". Stockage : `AsyncStorage '@ortrack:biometric_enabled'` (string 'true'/'false'). Section entière conditionnelle à `biometricAvailable`.

F11_SPACING: `scrollContent: { padding: 20, paddingBottom: 48 }`. card marginBottom 24. sectionTitle marginBottom 8, marginTop 8. header marginBottom 24. row paddingHorizontal 16, paddingVertical 14. premiumCard marginBottom 24, padding 16.

F12_SCROLL: `<ScrollView>` dans un `<KeyboardAvoidingView>` (behavior 'padding' iOS). `contentContainerStyle={styles.scrollContent}`. `keyboardShouldPersistTaps="handled"`. `showsVerticalScrollIndicator={false}`. paddingBottom 48 (insuffisant pour tab bar).

F13_CONTACT: NON — pas de lien "Nous contacter" / email / support.

F14_NOTER: NON — pas de lien "Noter l'app" / Play Store / App Store.

F15_PREMIUM_AVANTAGES: le texte "Découvrir les avantages" est dans `reglages.tsx` (L373). Les avantages eux-mêmes sont dans `components/premium-paywall.tsx`. Les limites numériques sont dans `contexts/premium-context.tsx` : `PREMIUM_LIMITS = { maxPositions: 3, maxAlerts: 2, maxNewsSources: 2, freePeriods: ['1S','1M','3M','1A'] }`.
