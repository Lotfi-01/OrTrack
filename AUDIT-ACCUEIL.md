# AUDIT ACCUEIL — Résultats

B1_FILE: `app/(tabs)/index.tsx` — composant `TableauDeBordScreen`

B2_STRUCTURE: ordre des sections dans le JSX :
1. Header compact (ORTRACK + "Mis à jour à HH:MM")
2. Hero card (VALEUR TOTALE ESTIMÉE + gain/perte)
3. Section HISTORIQUE (onglets métal + PriceChart compact)
4. Section MARCHÉS (bandeau erreur + grille spotCards 2x2 + cuivre full-width)
5. Section MA DÉTENTION (résumé portefeuille par métal — conditionnel)
6. Bouton "Alertes de cours" (accès rapide)

B3_HEADER: inline dans le JSX. `<View style={styles.headerRow}>` contient `<Text>ORTRACK</Text>` (gold, 13px, letterSpacing 2) à gauche et soit un `ActivityIndicator` (si loading+no prices), soit `<Text>Mis à jour à {formatTime(lastUpdated)}</Text>` (subtext, 11px) à droite. Pas de composant dédié.

B4_VALEUR_CARD: inline dans le JSX, `<View style={styles.heroCard}>`.
- Label "VALEUR TOTALE ESTIMÉE" (gold, uppercase, 11px)
- Icône œil : `<Ionicons name="eye-outline"/"eye-off-outline">` dans un `TouchableOpacity` avec `hitSlop`. State `hideValue` persisté dans AsyncStorage (`@ortrack:hide_portfolio_value`). Toggle via `toggleHideValue` (useCallback).
- Calcul valeur totale : `portfolio.totalValue` calculé dans un `useMemo`. Itère toutes les positions, pour chaque : `quantity * (weightG / OZ_TO_G) * spotPrice`. Somme totale accumulée.
- Gain/perte : `totalGainLoss = totalValue - totalCost`, `totalGainLossPct = (totalGainLoss / totalCost) * 100`
- Mode masqué : 3 blocs gris arrondis (`blurRow` / `blurBlock`) remplacent la valeur
- Sans positions : affiche "— {currencySymbol}" + "Ajoutez des actifs pour commencer"

B5_CHART: composant `<PriceChart>` importé de `@/components/price-chart`. Props passées : `metal={selectedChartMetal}` (type ChartMetal), `currency={currency}`, `compact` (boolean, sans valeur = true), `onFullScreen={() => router.push('/graphique?metal=...&currency=...')}`. Le chart gère ses propres données en interne (appel Supabase via loadPriceHistory). Hauteur actuelle : définie dans price-chart.tsx (200px compact, 380px non-compact — cf. session précédente).

B6_METAL_TABS: rendus via `METALS_CONFIG.map(...)` dans un `<ScrollView horizontal>`. 5 onglets : gold, silver, platinum, palladium, copper. State : `selectedChartMetal` (useState<ChartMetal>('gold')). Style : pills borderRadius 20, bordure couleur du métal, fond actif = couleur du métal, texte actif = background, inactif = couleur du métal sur fond card.

B7_PERIOD_TABS: NON rendus dans index.tsx. Les onglets de période (1S/1M/3M/1A/5A/10A) sont internes au composant `<PriceChart>`. Le premium lock est géré dans PriceChart via `usePremium().isPeriodLocked`.

B8_MARCHES_CARDS: rendus via `METALS_CONFIG.map(...)` dans `<View style={styles.spotGrid}>` (flexDirection:'row', flexWrap:'wrap', gap:12). 4 premières cards en grille 2x2 (`width: cardHalfWidth = (screenWidth - 40 - 12) / 2`), cuivre en full-width (`width: '100%', paddingVertical: 8`). Chaque card affiche : nom, symbole, prix spot (via `prices[m.metal]`), unité (€/oz ou €/kg pour cuivre), variation 24h (▲/▼ + % + €). Badge rond avec symbole à droite. Données : `prices` du hook `useSpotPrices()`, `change24h` calculé via `loadPriceHistory('1S', 'USD')`.

B9_DETENTION: conditionnel `{hasPositions && portfolioMetals.length > 0 && !hideValue && (...)}`. Rendu dans `<View style={styles.portfolioCard}>`. Pour chaque métal détenu (filtré par `totalG > 0`) : badge rond (symbole + couleur), label, poids total (fmtG), nb pièces (fmtQty), valeur en EUR (`(totalG / OZ_TO_G) * spot`). Séparateurs 1px entre les lignes. Données : `portfolioMetals` dérivé du useMemo `portfolio`. NON cliquable (pas de TouchableOpacity/onPress).

B10_ALERTES: `<TouchableOpacity style={styles.alertsBtn} onPress={() => router.push('/alertes')}>` avec texte "Alertes de cours" (white, 13px) et flèche "›" (gold, 20px). Navigue vers `/alertes`. Card style : fond card, border, borderRadius 10.

B11_TOUCHEZ: le texte "Touchez le graphique pour voir le prix" n'est PAS dans index.tsx. Il est dans `components/price-chart.tsx` (L320), interne au composant PriceChart. Il est conditionnel (affiché quand aucun point n'est sélectionné sur le graphique).

B12_SCROLL: `<ScrollView>` (pas FlatList). Pas de ref explicite. Contient un `<RefreshControl>` pour le pull-to-refresh (refreshing + onRefresh + tintColor gold).

B13_SPACING: `scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }`. marginBottom entre sections : heroCard marginBottom 8, sectionTitle marginBottom 12 marginTop 4, spotGrid marginBottom 16, portfolioCard marginBottom 16, alertsBtn marginBottom 16, headerRow marginBottom 8.

B14_IMPORTS: `PriceChart` de `@/components/price-chart` (utilise react-native-svg en interne — Svg, Line, Circle, Text, Rect). Pas de Victory, recharts, ou autre lib de chart. Le composant PriceChart est custom, construit directement sur react-native-svg.

B15_NAVIGATION: `router` importé de `expo-router`. Deux navigations :
1. `router.push('/graphique?metal=${selectedChartMetal}&currency=${currency}')` — depuis le PriceChart fullscreen
2. `router.push('/alertes')` — depuis le bouton "Alertes de cours"
