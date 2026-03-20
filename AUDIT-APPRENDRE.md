# AUDIT APPRENDRE — Résultats

D1_FILE: `app/(tabs)/apprendre.tsx` (écran principal) + 4 sous-composants :
- `components/indicateurs-panel.tsx` (onglet Marchés — ratios)
- `components/metal-converter.tsx` (onglet Convertir)
- `components/metal-guide.tsx` (onglet Guide)
- `components/actualites-panel.tsx` (onglet Actus)
Note : `components/gold-silver-ratio.tsx` existe aussi dans le dossier mais n'est PAS importé par apprendre.tsx (vestige probable).

D2_TABS: 4 onglets dans l'ordre :
1. `indicateurs` → label "Marchés" (IndicateursPanel)
2. `convertisseur` → label "Convertir" (MetalConverter)
3. `guide` → label "Guide" (MetalGuide)
4. `actualites` → label "Actus" (ActualitesPanel)
- State : `const [activeTab, setActiveTab] = useState<Tab>('indicateurs')` — défaut = `'indicateurs'` (Marchés)
- Type : `type Tab = 'indicateurs' | 'convertisseur' | 'guide' | 'actualites'`
- Config : tableau `TABS` (key + label)

D3_HEADER: inline dans le JSX de `apprendre.tsx`. `<View style={styles.headerRow}>` contient "ORTRACK" (gold, 13px, letterSpacing 2, fontWeight 600) à gauche et "Apprendre" (subtext, 13px) à droite. Même pattern que les autres écrans.

D4_RATIOS: composant `IndicateursPanel` dans `components/indicateurs-panel.tsx`. Données source : `useSpotPrices()` → `prices.gold`, `prices.silver`, `prices.platinum`, `prices.palladium`. 3 ratios calculés inline :
- Or/Argent : `prices.gold / prices.silver` (low=60, high=80)
- Or/Platine : `prices.gold / prices.platinum` (low=0.8, high=1.2)
- Or/Palladium : `prices.gold / prices.palladium` (low=0.8, high=1.5)
Badges signal via `getSignal(ind)` : `< low` → "ATTENTION" (rouge #E07070), `> high` → "OPPORTUNITÉ" (vert #4CAF50), entre → "NEUTRE" (gold #C9A84C). Chaque ratio = sous-composant `IndicatorCard` avec state local `expanded` (useState boolean). Toggle via `TouchableOpacity` header + chevron Ionicons (chevron-up/chevron-down, 16px).

D5_RATIO_BAR: jauge inline dans `IndicatorCard`. `View` fond `#2A2A3A`, height 6, borderRadius 3, overflow hidden. Fill width calculé : `((value - low*0.7) / (high*1.3 - low*0.7)) * 100`, clamped 0-100%. Couleur fill = couleur du signal. Labels min/max en dessous (gaugeLabels) : affiche `ind.low` à gauche et `ind.high` à droite, fontSize 10, subtext. Min/max sont des constantes hardcodées dans la définition de chaque indicateur.

D6_RATIO_DESCRIPTION: texte explicatif dans `ind.explanation`. Affiché UNIQUEMENT quand expanded = true (conditionnel au dépli, L96-103). Aussi : `ind.unit` affiché au-dessus de l'explanation (ex: "onces d'argent pour 1 once d'or"). Les deux sont dans un fragment `<>` rendu conditionnellement.

D7_CONVERTIR: composant `MetalConverter` dans `components/metal-converter.tsx`. States : `selectedMetal` (MetalKey, défaut 'gold'), `mode` ('weightToEur' | 'eurToWeight'), `inputValue` (string, défaut '1'), `unit` ('g' | 'oz' | 'kg'). Logique : spot price via `useSpotPrices()`, conversion via OZ_TO_G (31.10435). Mode "Poids → €" : input quantité + sélecteur unité (g/oz/kg) → résultat en EUR + équivalences. Mode "€ → Poids" : input montant € → résultat en oz/g/kg. Sélecteur métal : 5 pills (Or, Argent, Platine, Palladium, Cuivre). Note spéciale cuivre affichée quand sélectionné. `toNum` gère la virgule française.

D8_GUIDE: composant `MetalGuide` dans `components/metal-guide.tsx`. Données : tableau `METALS` (MetalInfo[]) hardcodé avec 5 fiches (or, argent, platine, palladium, cuivre). Expandable via state `openKey` (string | null) — un seul ouvert à la fois (accordion). Toggle : `toggle(key)` inverse entre key et null. Header : badge symbole (borderColor couleur métal) + nom métal + flèche ▲/▼. Contenu déplié (dans `styles.body`) :
1. Description (texte général)
2. COURS ACTUEL (via `getDisplayPrice` → spot price formaté, cuivre en €/kg)
3. Unités (once troy info)
4. Pureté (si disponible)
5. USAGES (tags avec emoji)
6. PRODUCTION MONDIALE (pays + %)
7. FACTEURS DE PRIX (tags neutres)
8. "Le saviez-vous ?" (funFactBox, fond doré 8%)
9. "Conseil" (tipBox, fond blanc 4%, emoji 💡)

D9_GUIDE_FUNFACT: "Le saviez-vous ?" est dans `funFactBox` (L241-244) — fond `rgba(201, 168, 76, 0.08)`, borderRadius 8, padding 12. Label "Le saviez-vous ?" en gold 11px bold + texte en subtext 13px. "Conseil" (💡) est dans `tipBox` (L247-250) — fond `rgba(255,255,255,0.04)`, borderRadius 8, padding 12, border `rgba(255,255,255,0.08)` 1px. Les deux sont en FIN du contenu déplié, après Production et Facteurs de prix.

D10_ACTUS: composant `ActualitesPanel` dans `components/actualites-panel.tsx`. Données source : RSS feeds fetché via `fetch()` + parsing XML regex. 6 sources définies dans le tableau `SOURCES`. Cache mémoire 15 minutes (`CACHE_TTL`). `fetchArticles(source)` extrait les `<item>` du RSS, décode HTML entities, retourne max 4 articles par source. Articles ouverts via `expo-web-browser` (`WebBrowser.openBrowserAsync`) — in-app browser, pas de WebView ni Linking.openURL. Toolbar color = background, controls color = gold.

D11_ACTUS_SOURCES: 6 sources au total :
- Gratuites (index 0-1) : "L'Or et l'Argent" (FR), "AuCOFFRE Académie" (FR)
- Premium (index 2-5) : "Goldbroker" (EN), "SilverSeek" (EN), "CMI Gold & Silver" (EN), "BullionStar" (EN)
Lock géré par `usePremium().isSourceLocked(index)`. Sources lockées : `fetchArticles` retourne un tableau vide (Promise.resolve), pas de fetch réseau. Filtre `visibleSources` exclut les sources lockées + erreurs + vides.

D12_PREMIUM_NUDGE: affiché APRÈS toutes les sources visibles, conditionnel `!isPremium` (L271-284). Card `premiumNudge` : fond card, borderRadius 12, border `rgba(201,168,76,0.3)` 1px, padding 16, alignItems center. Titre : **"4+ sources disponibles en Premium"** (gold, 13px, fontWeight 700). Sous-titre : "Accédez à des sources FR et internationales" (subtext, 11px). Cliquable → `showPaywall()`.

D13_SPACING: `apprendre.tsx` : `scrollContent: { padding: 20, paddingBottom: 40 }`. headerRow marginBottom 20. tabBar marginBottom 20, gap 8. Sous-composants : `indicateurs-panel` card marginBottom 12. `metal-converter` card marginBottom 16. `metal-guide` card marginBottom 12. `actualites-panel` sourceBlock marginBottom 20, premiumNudge marginTop 16.

D14_TAB_COMPONENT: custom `TouchableOpacity` dans un `View` flex row. 4 boutons `flex: 1`, paddingVertical 10, borderRadius 8, border 1px. Inactif : fond transparent, border `OrTrackColors.border`, texte subtext 13px 600. Actif : border gold, fond `rgba(201,168,76,0.12)`, texte gold 13px 700. Gap 8 entre les boutons.

D15_NAVIGATION: les articles Actus utilisent `expo-web-browser` : `WebBrowser.openBrowserAsync(url, { toolbarColor, controlsColor })`. Ouvre un navigateur in-app (Chrome Custom Tab sur Android, SFSafariViewController sur iOS). Pas de WebView, pas de Linking.openURL. Aucune autre navigation dans l'écran Apprendre (pas de router.push/navigate).
