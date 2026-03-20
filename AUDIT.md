# AUDIT — Résultats

A1_KAV: oui — behavior=`Platform.OS === 'ios' ? 'padding' : undefined`, offset=aucun, position: enveloppe le ScrollView à l'intérieur du SafeAreaView (L300-590)

A2_LAYOUT_ANIM: non — aucun appel à `setLayoutAnimationEnabledExperimental` dans le projet

A3_POPULAR: oui — champ `popular?: boolean` sur le type Product (L48). Utilisé dans PRODUCTS data + renderChip pour badge "Populaire" + filtre pièces dépliables (L374)

A4_AUTRE_LINGOT: "Autre" est un Product avec `weightG: null`, `category: 'autre'`. Sélectionner "Autre" affiche une section "Poids unitaire" avec TextInput custom (L404-420). Rendu en demi-largeur (CHIP_WIDTH), dans sa propre section marginTop:8, hors du productGrid (L394-401)

A5_RESET_METAL: handler=`handleMetalChange` (L163). States reset: `setProduct(PRODUCTS[m][0])`, `setCustomWeight('')`, `setShowAllPieces(false)`. NON reset: quantity, purchasePrice, purchaseDate, note

A6_SPACING: scrollContent padding=20 paddingBottom=48. section marginBottom=24. productGrid gap=8. fieldGroup gap=14. field gap=6. Pas de paddingHorizontal explicite sur section (hérité du padding:20 de scrollContent)

A7_DATE: format=JJ/MM/AAAA. fonction=`autoFormatDate` (helper inline L113-122, auto-insert des `/`). handleSave stocke `purchaseDate.trim()` tel quel (string JJ/MM/AAAA)

A8_ESTIMATED: type=inline. `currentValue` = `qty * (effectiveWeightG / OZ_TO_G) * spotEur` (L177-180). `gainLoss` = `currentValue - qty * price` (L182-185). Pas de fonction dédiée, calcul direct dans le composant

A9_EDIT: non — aucune fonctionnalité d'édition de position depuis le Portfolio (pas de handleEdit/onEdit/modifier trouvé dans portefeuille.tsx)

A10_DESELECT: non — renderChip onPress (L249) fait toujours `setProduct(p)`, pas de toggle (ne vérifie pas si déjà sélectionné)

A11_SPOT: variable=`spotEur` (L175). source=`getSpot(metal, prices)` où `prices` vient du hook `useSpotPrices()` (L127). `getSpot` est importé de `@/constants/metals` et retourne `prices[METAL_CONFIG[metal].spotKey]`

A12_OLD_CTA: texte="Ajouter à mon portefeuille" (confirmé: "Position ajoutée !", saving: "Enregistrement..."). styles=`submitButton`, `submitButtonDisabled`, `submitButtonConfirmed`, `submitText`, `submitTextDisabled`. position=dans le ScrollView, dernier élément avant `</ScrollView>` (L571-587)

A13_PRICE_PARSE: oui, handleSave utilise `price = toNum(purchasePrice)` (L174). `toNum` (L109-111) fait `parseFloat(s.replace(',', '.'))` — gère la virgule française correctement. Le résultat est un number stocké dans Position.purchasePrice
