# AUDIT STATISTIQUES — Résultats

G1_FILE: `app/statistiques.tsx` — composant unique `StatistiquesScreen`. Pas de sous-composant. Accessible via `router.push('/statistiques')` depuis portefeuille.tsx.

G2_STRUCTURE: ordre des sections dans le JSX :
1. Header ("← Retour" + "Statistiques")
2. État vide (si 0 positions)
3. Hero card PERFORMANCE GLOBALE (gain/perte + % + investi/valeur)
4. RÉPARTITION DU PORTEFEUILLE (barres horizontales par métal)
5. Mur premium conditionnel (`isPremium ?`)
   - SI Premium :
     - VOS POSITIONS (podium best/2nd/worst)
     - MÉTRIQUES CLÉS (grille 2x2)
     - ANALYSE ORTRACK (conseil intelligent)
   - SI Free :
     - Card "Statistiques détaillées" → paywall

G3_PREMIUM_WALL: conditionnel `{isPremium ? (...sections premium...) : (...card premium...)}` (L293-467). En version gratuite : `<TouchableOpacity style={styles.premiumStatsCard}>` avec texte "Statistiques détaillées" (gold, 15px bold) + sous-texte "Classement des positions, métriques clés et analyse personnalisée disponibles en Premium." (subtext, 12px) + badge "Découvrir Premium" (pill dorée). Pas de blur. Pas de composant séparé.

G4_PREMIUM_CTA: badge pill "Découvrir Premium" — fond `rgba(201,168,76,0.15)`, border `rgba(201,168,76,0.4)` 1px, borderRadius 20, paddingVertical 8, paddingHorizontal 20. Texte gold, 13px, fontWeight 700. Au tap : `showPaywall()` (via `usePremium()`). La card entière est cliquable (TouchableOpacity).

G5_PERFORMANCE: inline dans le JSX. Hero card avec bordure verte (gain ≥ 0) ou rouge (perte). Calculs :
- `totalCost = Σ(qty × purchasePrice)` pour toutes les positions
- `totalValue = Σ(qty × (weightG / OZ_TO_G) × spot)` pour toutes les positions
- `totalGainLoss = totalValue - totalCost` (si totalCost > 0)
- `totalGainLossPct = (totalGainLoss / totalCost) × 100`
Affiché : montant gain/perte (36px bold) + % (18px) + ligne "Investi | Valeur actuelle" séparée par un trait vertical.

G6_REPARTITION: barres horizontales inline. `metalValues` = pour chaque métal, somme des `qty × (weightG / OZ_TO_G) × spot`, filtré > 0. Chaque barre : nom métal (couleur chipText) à gauche, % à droite, barre remplie proportionnellement (`width: ${pct}%`, couleur chipBorder). Track height 8px, borderRadius 4. Card fond card + border.

G7_POSITIONS: "VOS POSITIONS" — podium inline. Tri : `positionsWithPerf` trié par `gainPct` décroissant. Affiche :
1. #1 (badge gold, borderColor gold) = meilleure perf
2. #2 (badge silver, borderColor #A8A8B8) = si ≥ 3 positions
3. Dernier (badge red, borderColor #E07070) = pire perf
Condition : `positionsWithPerf.length > 1`. Badges numérotés (pas d'emoji). Chaque ligne : badge numéro + product name + metal name + % gain/perte.

G8_METRIQUES: "MÉTRIQUES CLÉS" — grille 2x2 (`flexDirection: 'row', flexWrap: 'wrap', gap: 12`). 4 cards :
1. **PRIX DE REVIENT** — prix moyen d'achat par métal (fmtEur)
2. **POIDS TOTAL** — poids total par métal (fmtG)
3. **DÉTENTION MOYENNE** — durée globale (fmtMonths) + détail par métal. Calculé : moyenne des mois entre date d'achat et maintenant
4. **ALLOCATION OR / ARGENT** — ratio poids argent/poids or. Format "1 : X". Si un métal manque → message explicatif
Chaque card : width 47.5%, minHeight 90, fond card, border, borderRadius 12.

G9_ANALYSE: "ANALYSE ORTRACK" — card avec fond coloré selon le type :
- `warning` (jaune) : portefeuille concentré > 80% or
- `good` (vert) : bonne perf, diversifié
- `info` (gold) : pas d'argent, ou conseil générique
Icône emoji (⚠️ / ✅ / 💡) + texte dynamique (`getAdvice()` retourne `{ text, type }`). Si `type === 'good'` ET `totalGainLossPct > 50` : lien "Simuler ma fiscalité →" → `router.push('/fiscalite-globale')`.

G10_NAVIGATION: header custom inline. "← Retour" (`<TouchableOpacity onPress={() => router.back()}>`) + "Statistiques" (white, 18px bold). Pas de Stack.Screen header. `router.back()` utilisé.

G11_SPACING: `scrollContent: { padding: 20, paddingBottom: 48 }`. heroCard marginBottom 24. card marginBottom 20. sectionTitle marginBottom 10, marginTop 4. headerRow marginBottom 24, gap 12. grid gap 12, marginBottom 20. adviceCard marginBottom 8.

G12_SCROLL: `<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>`. paddingBottom 48. Pas de RefreshControl.

G13_TEMPORAL: NON — pas de données de performance temporelle (semaine, mois, année). Seule la performance globale (depuis l'achat) est calculée. Les dates d'achat (`purchaseDate`) sont disponibles sur chaque position, donc une performance par période SERAIT calculable en comparant la valeur spot actuelle à la valeur spot historique (nécessiterait `loadPriceHistory`). La durée de détention moyenne est calculée (mois depuis l'achat), mais pas la performance sur une période donnée.
