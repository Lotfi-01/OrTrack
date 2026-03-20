# AUDIT FISCALITÉ — Résultats

## Simulation par position
H1_FILE: `app/fiscalite.tsx` — composant `FiscaliteScreen`. Accédé via `router.push({ pathname: '/fiscalite', params: { positionId } })` depuis portefeuille.tsx.

H2_STRUCTURE: ordre des sections dans le JSX :
1. Header (Stack.Screen avec `← Retour` + titre "Simulation fiscale")
2. Sélecteur de position (chips horizontales, si > 1 position)
3. Card info position (badge métal + produit + détails)
4. Détails de la cession (prix + date — inputs)
5. Résultats de la simulation (durée détention + 2 cards régime + recommandation + "Voir le détail du calcul")
6. Avertissement légal (disclaimer)

H3_TABS: ScrollView horizontal (`showsHorizontalScrollIndicator={false}`). Chips pill (borderRadius 20, paddingH 14, paddingV 8). Texte : "{product} · {qty} pièce(s)". Sélectionnée : fond `#1F1B0A`, border gold. State : `selectedId` (string). Pré-sélection via `positionId` param ou première position. Pas de troncature visible (chip scroll horizontalement).

H4_CARD_POSITION: `<View style={[styles.card, styles.posInfoCard]}>`. Contenu :
- Ligne 1 : badge métal (symbol, couleur config) + nom produit (16px bold)
- Ligne 2 : "{qty} pièce(s) · Acquis le {date} · Prix de revient : {cost} €" (subtext, 13px)
- marginBottom 24. Hauteur ~80px.

H5_CESSION_FIELDS: 2 champs fixes (pas expandable) dans une section "Détails de la cession" :
- **Prix de cession (€)** : TextInput `decimal-pad`, pré-rempli avec la valeur marché estimée (`spotValue`). Hint italic : "Valeur marché estimée : {val} €". State : `salePriceStr`.
- **Date de cession** : TextInput `number-pad`, pré-rempli avec `todayStr()` (date du jour JJ/MM/AAAA). Auto-formatage via `autoFormatDate`. State : `saleDate`.

H6_RESULTS: conditionnel `{taxResult && salePrice !== null && costPrice !== null}`. 2 cards côte à côte (empilées verticalement) :
- **Taxe forfaitaire** : card avec nom + desc ("11,5 % du prix de cession...") + montant (28px bold) + "Net encaissé : {val} €". Badge "Le moins taxé" si `bestRegime === 'forfaitaire'`.
- **Régime plus-values** : même structure. Badge "Le moins taxé" ou "Exonéré" si applicable. Desc dynamique selon exonération/perte/abattement.
Composant : inline, pas de sous-composant.

H7_NET: "Net encaissé : {fmtEur(salePrice - tax)} €" — affiché dans chaque card régime (L299, L326). Calcul simple : prix de cession - taxe applicable.

H8_ECONOMY_CARD: `<View style={styles.recommendCard}>` (fond #161C10, border #2E4A1A — vert sombre). Titre : "Régime {X} conseillé" ou "exonération totale" ou "cession à perte". Sous-texte conditionnel : "Économie estimée : {savings} €" (couleur #7EC85A, bold). Conditionnel : `!isExempt && plusValue > 0`. Card toujours affichée si taxResult existe.

H9_DETAIL_CALC: expandable via state `showDetail` (boolean). Toggle : `<TouchableOpacity>` "Voir le détail du calcul ▼" / "Masquer le détail ▲" (gold, 13px). Contenu : card avec lignes clé-valeur. Sections : commun (prix cession, prix revient, PV brute) + séparateur + "Régime forfaitaire" (assiette, taux, taxe) + séparateur + "Régime plus-values" (durée, abattement, PV imposable, taux 36,2%, taxe).

H10_DISCLAIMER: `<View style={styles.legalCard}>` en bas de page. Texte inline (pas de composant) : "Cette simulation est fournie à titre purement indicatif... art. 150 VI du CGI... DGFiP...". Style : fond card, border, borderRadius 10, fontSize 11, subtext, lineHeight 18.

## Simulation globale
H11_FILE: `app/fiscalite-globale.tsx` — composant `FiscaliteGlobaleScreen`. Accédé via `router.push('/fiscalite-globale')` depuis portefeuille.tsx et statistiques.tsx.

H12_STRUCTURE: ordre des sections dans le JSX :
1. Header (Stack.Screen avec `← Retour` + titre "Simulation globale")
2. État vide (si 0 positions) ou état warning (cours indispo)
3. DATE DE CESSION (input + hint explicatif abattement)
4. Positions exclues (banner orange si cours indispo)
5. DÉTAIL PAR POSITION (card avec toutes les positions)
6. RÉCAPITULATIF GLOBAL (valeur totale + 2 colonnes forfaitaire/PV + badge "Le moins taxé")
7. Card économie (vert, si économie > 0,01 €)
8. Avertissement légal

H13_DATE_FIELD: TextInput `number-pad`, pré-rempli avec `todayStr()`. Auto-formatage via `autoFormatDate`. State : `saleDate`. Hint explicatif sous le champ : "La date de cession détermine l'abattement du régime plus-values (5 % par an dès la 3e année de détention)."

H14_DETAIL_POSITIONS: dans une seule `<View style={styles.card}>`. Pour chaque position (`computed.map`) :
- Ligne 1 : badge métal + produit (truncated) + durée "{years} an(s)"
- Ligne 2 : "Taxe forfaitaire : {val} €" (highlight si best) + "Taxe plus-values : {val} €" (highlight si best)
- Séparateurs entre positions. Pas de badge "Le moins taxé" individuel mais le texte du meilleur régime est en gold + bold.

H15_RECAP: `<View style={[styles.card, styles.recapHero]}>`. "VALEUR TOTALE DE CESSION" (gold, 11px) + montant (28px bold). Puis 2 colonnes côte à côte (flexDirection row, gap 12) :
- Colonne "Forfaitaire" : taxe + net. Border gold si best.
- Colonne "Plus-values" : taxe + net. Border gold si best.
Badge "Le moins taxé" dans la colonne gagnante. Style des colonnes : fond background, borderRadius 10, border, alignItems center.

H16_ECONOMY_CARD_GLOBAL: OUI — `<View style={styles.savingCard}>` (fond #161C10, border #2E4A1A). Conditionnel `economieGlobale > 0.01`. Titre : "Régime {X} conseillé". Montant : "Économie estimée : {val} €" en #7EC85A bold. Même style que la card économie par position.

## Commun
H17_NAVIGATION: les deux écrans utilisent `Stack.Screen options` avec `headerLeft: () => <TouchableOpacity onPress={() => router.back()}>← Retour</TouchableOpacity>`. Le header est géré par le Stack navigator (pas custom inline). `router.back()` pour revenir.

H18_SPACING: les deux : `scroll: { padding: 20, paddingBottom: 48 }`. section marginBottom 28. card pas de marginBottom propre (géré par la section). sectionLabel marginBottom 12. inputGroup marginBottom 14. regimeCard marginBottom 12.

H19_SCROLL: ScrollView dans un KeyboardAvoidingView (behavior 'padding' iOS). `showsVerticalScrollIndicator={false}`. paddingBottom 48. Pas de RefreshControl.

H20_SHARE: NON — aucun bouton de partage dans aucun des deux écrans. Pas de Share, pas de Linking, pas d'export.
