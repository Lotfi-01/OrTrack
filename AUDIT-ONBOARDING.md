# AUDIT ONBOARDING — Résultats

I1_FILE: `app/onboarding.tsx` — composant unique `OnboardingScreen`. Pas de sous-composant. Fonction helper `completeOnboarding()` au top level.

I2_SLIDES_DATA: OUI — tableau `SLIDES: Slide[]` (L35-74). Chaque élément :
```typescript
type Slide = {
  id: number;
  emoji?: string;              // ex: '🏅', '💰'
  icon?: keyof typeof Ionicons.glyphMap;  // ex: 'stats-chart-outline', 'calculator-outline'
  iconColor?: string;          // ex: '#C9A84C'
  title: string;               // titre multi-ligne (\n)
  subtitle: string;            // sous-titre multi-ligne (\n)
  isFirst: boolean;            // true = affiche le logo "ORTRACK" au-dessus du titre
  proofCardLabel: string;      // label de l'encart gold (ex: "🥇 Or — cours actuel")
  proofCardValue?: string;     // non utilisé dans les données (le prix live est géré séparément)
  proofCardText?: string;      // texte de l'encart (ex: "1 Napoléon · 6,45g · valorisé en temps réel")
  isLivePrice?: boolean;       // true = l'encart affiche le cours de l'or en direct
};
```

I3_SLIDE_COUNT: 4 slides :
1. "Votre or vaut combien aujourd'hui ?" — emoji 🏅, encart cours or LIVE, logo ORTRACK
2. "Ne manquez plus jamais une opportunité" — icon stats-chart-outline, encart alertes
3. "Sachez exactement ce que vous possédez" — emoji 💰, encart exemple suivi
4. "Simulation fiscale incluse" — icon calculator-outline, encart droit français

I4_ICONS: rendues dans `<View style={styles.emojiContainer}>` (140x140 cercle, fond doré 12%, border doré 30%, shadow gold). Contenu :
- Si `slide.emoji` → `<Text style={styles.emoji}>{slide.emoji}</Text>` (fontSize 64)
- Sinon → `<Ionicons name={slide.icon!} size={64} color={slide.iconColor} />`
Slides 1 & 3 = emoji, slides 2 & 4 = Ionicons.

I5_ENCARTS: `<View style={styles.proofCard}>` — fond `rgba(201,168,76,0.08)`, border `rgba(201,168,76,0.2)` 1px, borderRadius 12, paddingV 12, paddingH 20, width `screenWidth - 64`. Contenu :
- `proofCardLabel` en gold 13px bold (ex: "🥇 Or — cours actuel")
- Si `isLivePrice` : affiche le cours de l'or live (fetchGoldPrice via metals.dev API), ou "Chargement du cours...", ou "Cours disponible dans l'app"
- Sinon : `proofCardText` en #888 13px (ex: "Soyez notifié dès que le prix cible est atteint")

I6_CTA_SUIVANT: `<TouchableOpacity style={styles.ctaButton}>` — fond gold (#C9A84C), borderRadius 12, padding 16, flexDirection row, gap 8. Texte "Suivant" (black, 16px bold) + Ionicons `arrow-forward` (20px, black). `onPress={goToNext}` qui scroll vers la slide suivante (`scrollRef.current.scrollTo`).

I7_CTA_FINAL: même bouton, texte change à "Accéder à OrTrack" (sans flèche). `onPress={goToNext}` qui appelle `completeOnboarding()` quand `isLastSlide`. Navigation : `router.replace('/(tabs)')`.

I8_PASSER: `<TouchableOpacity onPress={completeOnboarding}>` en haut à droite. Texte "Passer" (#888, 14px). Visible uniquement `!isLastSlide`. Même action que le CTA final : `completeOnboarding()` → AsyncStorage + `router.replace('/(tabs)')`. Contenu dans `skipContainer` (height 44, alignItems flex-end, paddingH 24).

I9_DOTS: custom inline. `<View style={styles.pagination}>` (flexDirection row, gap 8, paddingV 24). Chaque dot : `<View style={styles.dot}>` (height 8, borderRadius 4). Actif : backgroundColor gold (#C9A84C), width 24. Inactif : backgroundColor #2A2A2A, width 8. Pas de lib externe.

I10_SWIPE: `<ScrollView ref={scrollRef} horizontal pagingEnabled>`. Chaque slide = `<View style={{ width: screenWidth }}>`. Scroll détecté via `onMomentumScrollEnd` → calcule `currentIndex` depuis `contentOffset.x / width`. Pas de FlatList, pas de PagerView, pas d'Animated API.

I11_ONBOARDED_FLAG: `AsyncStorage.setItem('@ortrack:onboarding_complete', 'true')` dans `completeOnboarding()` (L76-79). Lu dans `_layout.tsx` ou au démarrage pour rediriger. Clé : `@ortrack:onboarding_complete`.

I12_NAVIGATION: `router.replace('/(tabs)')` dans `completeOnboarding()` (L78). Replace (pas push) → pas de retour possible à l'onboarding. Destination : écran principal (tabs).

I13_SPACING: slide paddingHorizontal 32. emojiContainer marginBottom 32. logo marginBottom 16. title marginBottom 16. proofCard marginTop 24. skipContainer height 44, paddingH 24. ctaContainer paddingH 24, paddingBottom 16. pagination paddingV 24. Pas de padding global sur le ScrollView.
