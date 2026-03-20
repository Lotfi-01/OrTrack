# AUDIT ALERTES — Résultats

E1_FILE: `app/(tabs)/alertes.tsx` — composant unique `AlertesScreen`. Pas de sous-composant dans `components/`. Service importé : `services/alerts.ts` (types `Alert`, `Condition` + fonctions `getAlerts`, `createAlert`, `deleteAlert`).

E2_HEADER: inline dans le JSX. `<View style={styles.header}>` contient "ORTRACK" (gold, 13px, fontWeight bold, letterSpacing 2, uppercase) à gauche et "Alertes" (subtext, 13px) à droite. Même pattern que les autres écrans.

E3_CTA_BUTTON: `<TouchableOpacity style={styles.createButton}>` avec texte "+ Nouvelle alerte" (gold, 15px, fontWeight 600). Style : fond transparent, border 1px gold, borderRadius 10, padding 14, alignItems center, marginBottom 24. Au tap : vérifie `canAddAlert(alerts.length)` → si non, appelle `showPaywall()` et return. Sinon, ouvre le modal de création (`setModalVisible(true)`). Le modal contient : sélecteur métal (pills horizontales), sélecteur condition (Au-dessus/En-dessous), input prix cible, hint cours actuel, boutons Créer/Annuler.

E4_ALERT_CARD: rendu inline (pas de sous-composant). `<View style={styles.alertCard}>` (fond card, borderRadius 10, border 1px, padding 14, marginBottom 10). Contenu dans `alertCardContent` (flexDirection row) :
- `alertInfo` (flex: 1) contient :
  1. Ligne header : badge métal (symbole, borderColor chipBorder, borderRadius 6) + nom métal (white, bold, 15px)
  2. Badge condition : "▲ Au-dessus" fond #1B3A1B/vert OU "▼ En-dessous" fond #3A1B1B/rouge
  3. Bloc calculé (IIFE) : grille cours actuel / seuil cible, texte écart (€ + %), barre de proximité, label "X % du seuil atteint"
- `deleteButton` (TouchableOpacity, padding 8) à droite avec Ionicons `trash-outline` (20px, subtext)

E5_PROGRESS_BAR: barre de proximité calculée dans l'IIFE (L226-288). Calcul :
- `gap = target_price - currentPrice`
- `gapPct = (gap / currentPrice) * 100`
- `proximityRaw = isAbove ? currentPrice / target_price : target_price / currentPrice`
- `proximity = Math.min(Math.max(proximityRaw, 0), 1)` — clampé entre 0 et 1
- Fill width : `${(proximity * 100).toFixed(1)}%`
- Couleur fill : gold si above, #F44336 (rouge) si below
- Label : `"{proximity * 100} % du seuil atteint"` (subtext, 10px, aligné droite)
- Condition >= 100% : oui, `proximity` est clampé à max 1.0 donc la barre ne dépasse jamais 100%. Pas de style spécial quand 100% atteint.

E6_DIRECTION_BADGE: `<View style={styles.conditionBadge}>` avec `<Text style={styles.conditionText}>`. Conditionnel sur `alert.condition` :
- `'above'` → texte "▲ Au-dessus", couleur #4CAF50 (vert), fond #1B3A1B (vert sombre)
- `'below'` → texte "▼ En-dessous", couleur #F44336 (rouge), fond #3A1B1B (rouge sombre)
Style : borderRadius 4, paddingHorizontal 8, paddingVertical 3, fontSize 12, fontWeight 600.

E7_DELETE: icône `<Ionicons name="trash-outline" size={20} color={OrTrackColors.subtext}>` dans `<TouchableOpacity style={styles.deleteButton}>` (padding 8). `onPress={() => handleDelete(alert.id)}`. `handleDelete` (L89-105) utilise `RNAlert.alert("Supprimer l'alerte", "Cette alerte sera supprimée définitivement.", [Annuler, Supprimer(destructive)])`. Confirmation obligatoire. Suppression via `deleteAlert(alertId)` puis rechargement `loadAlerts(pushToken)`.

E8_EMPTY_STATE: deux états vides distincts :
1. **Token absent** (notifications non dispo) : Ionicons `notifications-off-outline` (48px, subtext) + "Notifications non disponibles" (subtext, 16px, fontWeight 600) + "Testez sur un appareil physique" (subtext, 12px). Centré, marginTop 60.
2. **Token OK + 0 alertes** : Ionicons `notifications-outline` (40px, subtext) + "Aucune alerte active" (subtext, 14px, fontWeight 600, marginTop 8) + "Définissez un seuil de prix pour être notifié" (subtext, 12px, opacity 0.6). Centré, marginTop 40, gap 8.

E9_PREMIUM_NUDGE: dans `alertsHeader` (L158-169). Conditionnel `!isPremium`. `<TouchableOpacity onPress={showPaywall}>` avec texte `"{alerts.length}/{limits.maxAlerts} · Passer à illimité"` (gold, 11px, fontWeight 600). Visible à côté du titre "MES ALERTES". Non conditionnel au nombre exact — toujours affiché si !isPremium.

E10_SCROLL: `<ScrollView contentContainerStyle={styles.content}>`. paddingBottom 32 (insuffisant pour tab bar). Pas de FlatList. Pas de RefreshControl.

E11_SPACING: `content: { padding: 16, paddingBottom: 32 }`. header marginBottom 20. createButton marginBottom 24. alertsHeader marginBottom 12. alertCard marginBottom 10. emptyState marginTop 60. emptyAlerts marginTop 40.

E12_TRIGGERED_STATE: NON — pas de style visuel différent quand proximity >= 100% (seuil atteint). La barre est simplement pleine (100%) et le label affiche "100 % du seuil atteint". Pas de changement de couleur, pas d'icône, pas de badge "DÉCLENCHÉ".
