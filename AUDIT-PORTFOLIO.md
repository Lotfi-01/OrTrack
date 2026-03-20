# AUDIT PORTFOLIO — Résultats

C1_FILE: `app/(tabs)/portefeuille.tsx` — composant principal `PortefeuilleScreen`, sous-composant `PositionCard`

C2_STRUCTURE: ordre des sections dans le JSX :
1. Header ("ORTRACK" + "Portefeuille")
2. Card valeur totale estimée (conditionnel hasPositions)
3. Résumé métaux / summaryCard (conditionnel hasPositions + visibleMetals > 0 + !hideValue)
4. Bouton "Statistiques →" (conditionnel hasPositions)
5. Bouton "Simulation fiscale globale →" (conditionnel hasPositions)
6. Liste des positions OU état vide (conditionnel hasPositions)

C3_HEADER: inline dans le JSX. `<View style={styles.headerRow}>` contient "ORTRACK" (gold, 13px, letterSpacing 2, fontWeight 600) à gauche et "Portefeuille" (subtext, 13px) à droite. Même pattern que l'ancien header Accueil.

C4_VALEUR_CARD: inline `<View style={styles.totalCard}>`. Composant DIFFÉRENT de l'Accueil (pas partagé). Label "Valeur totale estimée" (gold, 11px, uppercase). Icône œil : `<Ionicons name="eye-outline"/"eye-off-outline">` dans `TouchableOpacity` hitSlop. State `hideValue` persisté dans AsyncStorage (`@ortrack:hide_portfolio_value`, même clé que l'Accueil). Toggle via `toggleHideValue` (useCallback). Mode masqué : 3 blocs gris (`blurRow`/`blurBlock`). Valeur : fontSize 32, fontWeight 800. Gain/perte en dessous. Calcul : boucle sur positions avec `getSpot(p.metal, prices)`, `totalCost += qty * purchasePrice`, `totalValue += qty * (weightG / OZ_TO_G) * spot`.

C5_DETENTION: `<View style={styles.summaryCard}>` (nommé "Résumé métaux" dans le code). Conditionnel `hasPositions && visibleMetals.length > 0 && !hideValue`. Données : `metalSummary` calculé à partir de `positions` + `getSpot`. Pour chaque métal ayant totalG > 0 : badge rond (28x28, borderColor chipBorder), nom, valeur EUR (gold, 15px bold), poids (white, 14px bold), pièces (subtext, 12px). Séparateurs 1px entre lignes. NON cliquable. Pas de composant dédié — inline.

C6_STATS_BTN: `<TouchableOpacity style={styles.statsButton}>`. Fond card, borderRadius 10, border 1px, padding 14, alignItems center. Texte "Statistiques →" (gold, 13px, fontWeight 600). Navigation : `router.push('/statistiques' as never)`. Conditionnel `hasPositions`.

C7_SIMULATION_BTN: `<TouchableOpacity style={styles.globalFiscalButton}>`. Fond `#1F1B0A` (doré sombre), borderRadius 10, border 1px `OrTrackColors.gold`, padding 14, alignItems center. Texte "Simulation fiscale globale →" (gold, 13px, fontWeight 600). Navigation : `router.push('/fiscalite-globale' as never)`. Conditionnel `hasPositions`. marginBottom 24.

C8_POSITIONS: rendues via `positions.map(pos => <PositionCard .../>)`. `PositionCard` est un sous-composant déclaré dans le même fichier (L120-286). Expandable via state local `expanded` (useState boolean). Toggle au tap sur `posHeader` (`onPress={() => setExpanded(!expanded)}`). PAS de LayoutAnimation. Chevron Ionicons `chevron-up`/`chevron-down` (16px, subtext). Header : badge métal (symbole, couleur config) + nom produit (numberOfLines 1) + chevron.

C9_POSITION_EXPANDED: contenu déplié (L189-283), dans l'ordre :
1. Gain/perte (vert/rouge, %, conditionnel !hideValue)
2. Détail : "{qty} pièce(s) · {poids} · Acheté le {date}"
3. Prix d'achat unitaire (si qty > 1) : "{prix} €/pièce"
4. Note (italic, si existante)
5. Divider 1px (conditionnel !hideValue)
6. Ligne "Investi" / "Vaut aujourd'hui" côte à côte (conditionnel !hideValue)
7. Bloc fiscal : titre "Exonération fiscale", détention, abattement %, barre de progression, label exonération
8. Footer : "Simulation fiscale →" (gold) à gauche + "Retirer" (#9A8E7E) à droite

C10_RETIRER: bouton `<TouchableOpacity>` dans le footer déplié. Texte "Retirer" (fontSize 13, color #9A8E7E, fontWeight 600). `onPress={() => onDelete(pos.id)}`. `handleDelete` (L328-345) : `Alert.alert('Supprimer la position', 'Cette action est irréversible.', [Annuler, Supprimer (destructive)])`. Confirmation obligatoire. Suppression : filtre la position, save AsyncStorage, update state.

C11_PREMIUM_NUDGE: affiché dans `positionsHeader` (L497-508). Conditionnel `!isPremium`. `<TouchableOpacity onPress={showPaywall}>` avec texte `"{positions.length}/{limits.maxPositions} · Passer à illimité"` (gold, 11px, fontWeight 600). Le `usePremium` hook fournit `isPremium`, `limits`, `showPaywall`, `canAddPosition`.

C12_NAVIGATION: `router` importé de `expo-router`. Navigations :
1. `router.push('/statistiques' as never)` — vers stats
2. `router.push('/fiscalite-globale' as never)` — vers simulation globale
3. `router.push({ pathname: '/fiscalite', params: { positionId: pos.id } })` — vers simulation position
4. `router.navigate('/(tabs)/ajouter')` — vers onglet Ajouter (inter-tab, dans l'état vide)

C13_SCROLL: `<ScrollView>` simple, `contentContainerStyle={styles.scrollContent}`, `showsVerticalScrollIndicator={false}`. Pas de ref. Pas de RefreshControl (pas de pull-to-refresh).

C14_SPACING: `scrollContent: { padding: 20, paddingBottom: 48 }`. totalCard marginBottom 16. summaryCard marginBottom 28. statsButton marginBottom 12. globalFiscalButton marginBottom 24. posCard marginBottom 12. headerRow marginBottom 20. positionsHeader marginBottom 12.

C15_MODIFIER: NON — aucun bouton ni fonctionnalité "Modifier" une position. Seul "Retirer" (supprimer) existe.

C16_EMPTY_STATE: OUI — quand `!hasPositions` (L522-536). `<View style={styles.emptyState}>` centré. Icône "+" dans un cercle doré (64x64, border gold 2px). Titre "Aucun actif enregistré" (white, 18px, bold). Texte d'aide "Commencez par ajouter vos lingots..." (subtext, 14px). L'icône "+" est un `TouchableOpacity` qui navigue vers `router.navigate('/(tabs)/ajouter')`.
