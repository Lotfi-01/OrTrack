import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type MetalType, METAL_CONFIG, getSpot, OZ_TO_G } from '@/constants/metals';
import { PRODUCTS, type Product } from '@/constants/products';
import { SILVER_MVP_PRODUCTS, getSilverMvpProductById, type SilverMvpProduct } from '@/constants/silver-products';
import { formatEuro, formatG } from '@/utils/format';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { useSharedSpotPrices } from '@/contexts/spot-prices-context';
import { Position } from '@/types/position';
import { usePositions } from '@/hooks/use-positions';
import { parseDate } from '@/utils/tax-helpers';
import { computeSilverBreakdown } from '@/utils/silver-breakdown';
import { computeSilverMvpPremiumWarning } from '@/utils/silver-premium';
import {
  autoFormatDate,
  formatDateDMY,
  formatPriceDisplay,
  toNum,
  truncateName,
} from '@/utils/ajouter-form';
import { DateField } from '@/components/add-position/DateField';
import { EstimationCard } from '@/components/add-position/EstimationCard';
import { MetalSelector, type MetalOption } from '@/components/add-position/MetalSelector';
import { NoteField } from '@/components/add-position/NoteField';
import { ProductSelector } from '@/components/add-position/ProductSelector';
import { QuantityField } from '@/components/add-position/QuantityField';
import { SpotInfoCard } from '@/components/add-position/SpotInfoCard';
import { buildEstimationDisplayModel } from '@/utils/add-position/estimation-display';
import { usePriceField } from '@/hooks/add-position/usePriceField';
import { trackEvent } from '@/services/analytics';

// ─── LayoutAnimation Android ──────────────────────────────────────────────────

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Pre-built metal options for the MetalSelector. Built once at module load
// from METAL_CONFIG so the order matches the catalog and never changes.
const METAL_OPTIONS: readonly MetalOption[] = (
  Object.entries(METAL_CONFIG) as [MetalType, typeof METAL_CONFIG[MetalType]][]
).map(([key, cfg]) => ({ key, label: cfg.name, accentColor: cfg.chipBorder }));

type SelectableProduct = Product | SilverMvpProduct;

function isSilverMvpProduct(product: SelectableProduct | null): product is SilverMvpProduct {
  return product !== null && 'id' in product && product.metal === 'argent';
}

// ─── Ordre / whitelist / alias or — UI-only, écran Ajouter uniquement ────────
// Ordre validé marché France pour la grille Or de l'écran Ajouter. Les pièces
// non listées ici (s'il en existe au catalogue) sont rendues après, dans leur
// ordre de catalogue.
const GOLD_PRIORITY_ORDER: readonly string[] = [
  'Napoléon 20F',
  'Krugerrand 1oz',
  'Souverain',
  'Maple Leaf 1oz',
  '20F Suisse Vreneli',
  'American Gold Eagle 1oz',
  'Philharmonique 1oz',
  'Britannia 1oz',
  '50 Pesos mexicain',
  'Kangourou 1oz',
  'Buffalo Américain 1oz',
  'Panda de Chine 30g',
];

// UI-only, écran Ajouter uniquement : les badges "Populaire" sur la grille Or
// sont pilotés par cette whitelist locale, pas par le champ `popular` global
// du catalogue. Ne pas propager à d'autres écrans.
const POPULAR_GOLD_COINS_ON_ADD: readonly string[] = [
  'Napoléon 20F',
  'Souverain',
];

const SILVER_POPULAR_BADGE_PRODUCT_IDS: readonly string[] = [
  'silver-maple-leaf-1oz',
  'american-silver-eagle-1oz',
];

const SILVER_SINGLE_LINE_PRODUCT_IDS: readonly string[] = [
  'american-silver-eagle-1oz',
  'vienna-philharmonic-silver-1oz',
];

const PRODUCT_SECTION_TITLE_BY_METAL: Record<MetalType, string> = {
  or: 'PIÈCES D’OR',
  argent: 'PIÈCES D’ARGENT',
  platine: 'PIÈCES DE PLATINE',
  palladium: 'PIÈCES DE PALLADIUM',
};

const SILVER_PREMIUM_WARNING_DISPLAY_THRESHOLD_PCT = 0.1;

// Alias de recherche locaux à la grille Or. Utilisés en complément du match
// substring sur le label normalisé (casse + accents).
const COIN_ALIASES: Record<string, readonly string[]> = {
  '20F Suisse Vreneli': ['20 francs suisse'],
  'Panda de Chine 30g': ['panda chine', 'panda 30g'],
};

function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function matchesCoinQuery(coin: SelectableProduct, query: string): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  if (normalizeSearch(coin.label).includes(q)) return true;
  const aliases = COIN_ALIASES[coin.label];
  if (aliases) {
    for (const a of aliases) {
      if (normalizeSearch(a).includes(q)) return true;
    }
  }
  return false;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function AjouterScreen() {
  const { editId, editTs } = useLocalSearchParams<{ editId?: string; editTs?: string }>();
  const isEditMode = editId != null && editId !== '' && editId !== 'undefined';
  const [staleEditId, setStaleEditId] = useState<string | null>(null);
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const activeEditIdRef = useRef<string | null>(null);
  const lastHandledEditKeyRef = useRef<string | null>(null);
  const effectiveEditMode =
    activeEditId != null &&
    activeEditId === editId &&
    activeEditId !== staleEditId;
  const { prices, currencySymbol, refresh } = useSharedSpotPrices();
  const { canAddPosition, showPaywall } = usePremium();
  const { positions, reloadPositions, addPosition, updatePosition } = usePositions();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // ── States ──────────────────────────────────────────────────────────────

  const scrollRef = useRef<ScrollView>(null);

  const spotInfoCardYRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justTappedContinue = useRef(false);

  // Funnel analytics: add_position_started fires once when the user first
  // engages with the form (product pick, focus on a field). The flag resets
  // every time the screen receives focus so it fires once per add session.
  const hasStartedAddPositionRef = useRef(false);

  const fireAddPositionStartedOnce = useCallback(() => {
    if (hasStartedAddPositionRef.current) return;
    hasStartedAddPositionRef.current = true;
    void trackEvent('add_position_started', {
      source: 'tab',
    });
  }, []);

  const [metal, setMetal] = useState<MetalType>('or');
  const [product, setProduct] = useState<SelectableProduct | null>(null);
  const [customWeight, setCustomWeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const {
    purchasePrice,
    setPurchasePrice,
    priceDisplay,
    setPriceDisplay,
    priceKey,
    setPriceKey,
    priceLocalRef,
    commitPurchasePriceInput,
  } = usePriceField(formatEuro);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [note, setNote] = useState('');
  const [showAllPieces, setShowAllPieces] = useState(false);
  const [showAllBars, setShowAllBars] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isStep2Active, setIsStep2Active] = useState(false);
  const [coinSearch, setCoinSearch] = useState('');

  const dateRef = useRef(purchaseDate);
  dateRef.current = purchaseDate;

  // ── Focus effect : réarme le guard de sauvegarde à chaque retour d'écran
  // (le composant ne se démonte pas entre navigations Expo Router tabs)
  useFocusEffect(
    useCallback(() => {
      savingRef.current = false;
      setSaving(false);
      // Reset the funnel "started" flag at every re-focus so a fresh add
      // session can fire add_position_started exactly once.
      hasStartedAddPositionRef.current = false;
      return () => {};
    }, [])
  );

  // ── Focus effect : edit session resolution ──────────────────────────────

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const editTsMs = Number(editTs);

      const currentEditKey =
        isEditMode && Number.isFinite(editTsMs) && editTsMs > 0
          ? `${editId}:${editTsMs}`
          : null;

      const isNewFreshEdit =
        currentEditKey != null &&
        now - editTsMs >= 0 &&
        now - editTsMs < 10000 &&
        currentEditKey !== lastHandledEditKeyRef.current;

      let nextActiveEditId = activeEditIdRef.current;

      if (isNewFreshEdit) {
        lastHandledEditKeyRef.current = currentEditKey;
        nextActiveEditId = editId!;
      } else if (!isEditMode || editId === staleEditId) {
        nextActiveEditId = null;
      }

      if (nextActiveEditId !== activeEditIdRef.current) {
        activeEditIdRef.current = nextActiveEditId;
        setActiveEditId(nextActiveEditId);
      }

      return () => {
        activeEditIdRef.current = null;
        setActiveEditId(null);
      };
    }, [isEditMode, editId, editTs, staleEditId]),
  );

  // ── Focus effect : load or reset ────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      reloadPositions();
    }, [reloadPositions])
  );

  useFocusEffect(
    useCallback(() => {
      const localEffectiveEdit =
        activeEditIdRef.current != null &&
        activeEditIdRef.current === editId &&
        activeEditIdRef.current !== staleEditId;

      if (localEffectiveEdit) {
        const existing = positions.find(p => p.id === editId);
        if (positions.length > 0 && !existing) {
          setStaleEditId(editId!);
          setMetal('or');
          setProduct(null);
          setCustomWeight('');
          setQuantity('1');
          setPurchasePrice(''); setPriceDisplay(''); setPriceKey(k => k + 1);
          setPurchaseDate('');
          setNote('');
          setShowAllPieces(false);
          setShowAllBars(false);
          setConfirmed(false);
          setIsStep2Active(false);
          setCoinSearch('');
          return;
        }
        if (!existing) return;
        setMetal(existing.metal);
        const matchedSilverProduct = existing.metal === 'argent'
          ? getSilverMvpProductById(existing.productId)
          : null;
        const matchedProduct = matchedSilverProduct ?? PRODUCTS[existing.metal].find(p => p.label === existing.product) ?? null;
        if (matchedProduct) {
          setProduct(matchedProduct);
          if (matchedProduct.weightG === null) {
            setCustomWeight(String(existing.weightG));
          }
        } else {
          const autre = PRODUCTS[existing.metal].find(p => p.category === 'autre') ?? null;
          setProduct(autre);
          setCustomWeight(String(existing.weightG));
        }
        setQuantity(String(existing.quantity));
        const epv = typeof existing.purchasePrice === 'number'
          ? existing.purchasePrice.toFixed(2)
          : String(existing.purchasePrice).replace(/[\s\u00A0]/g, '').replace(/,/g, '.');
        setPurchasePrice(epv); setPriceDisplay(formatPriceDisplay(epv)); setPriceKey(k => k + 1);
        setPurchaseDate(existing.purchaseDate);
        setNote(existing.note ?? '');
        setShowAllPieces(false);
        setShowAllBars(false);
        setConfirmed(false);
        setIsStep2Active(true);
        setCoinSearch('');
      } else {
        setMetal('or');
        setProduct(null);
        setCustomWeight('');
        setQuantity('1');
        setPurchasePrice(''); setPriceDisplay(''); setPriceKey(k => k + 1);
        setPurchaseDate('');
        setNote('');
        setShowAllPieces(false);
        setShowAllBars(false);
        setConfirmed(false);
        setIsStep2Active(false);
        setCoinSearch('');

        // Ne pas ouvrir le paywall pendant un save en cours : quand une création
        // réussit, `positions` change et ce useFocusEffect ré-exécute avec le
        // nouveau quota atteint (ex: 5/5 après avoir légitimement ajouté la 5e).
        // Le paywall s'ouvrirait alors à tort avant la redirection. `savingRef`
        // est true durant toute la fenêtre save+confirmation et est réarmé à
        // chaque re-focus de l'écran (useFocusEffect ligne 102-107).
        if (!canAddPosition(positions.length) && !savingRef.current) {
          showPaywall();
        }
      }
    }, [editId, staleEditId, positions, canAddPosition, showPaywall])
  );

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // ── Métal → reset produit + replie grille ──────────────────────────────

  const handleMetalChange = useCallback((m: MetalType) => {
    setMetal(m);
    setProduct(null);
    setCustomWeight('');
    setPurchasePrice(''); setPriceDisplay(''); setPriceKey(k => k + 1);
    setShowAllPieces(false);
    setShowAllBars(false);
    setIsStep2Active(false);
    setCoinSearch('');
  }, []);

  // ── Calculs temps réel ────────────────────────────────────────────────

  const effectiveWeightG = product?.weightG ?? toNum(customWeight);
  const qty = toNum(quantity);
  const price = toNum(purchasePrice);
  const spotEur = getSpot(metal, prices);

  const estimatedValue = useMemo(() => {
    if (spotEur === null || effectiveWeightG <= 0) return null;
    const val = (effectiveWeightG / OZ_TO_G) * spotEur;
    return val > 0 && !isNaN(val) ? val : null;
  }, [spotEur, effectiveWeightG]);

  const currentValue = useMemo(() =>
    spotEur !== null && effectiveWeightG > 0 && qty > 0
      ? qty * (effectiveWeightG / OZ_TO_G) * spotEur
      : null,
    [spotEur, effectiveWeightG, qty]
  );

  const gainLoss = useMemo(() =>
    currentValue !== null && price > 0
      ? currentValue - qty * price
      : null,
    [currentValue, price, qty]
  );

  const priceAnalysis = useMemo(() => {
    const numeric = parseFloat(purchasePrice.replace(',', '.'));
    const spotValid = estimatedValue !== null && estimatedValue > 0;
    const matches = spotValid && !isNaN(numeric)
      && Math.abs(numeric - estimatedValue!) <= estimatedValue! * 0.005;
    const showRef = spotValid && purchasePrice.trim() !== '' && !isNaN(numeric) && !matches;
    return { priceMatchesSpot: matches, showPriceReference: showRef };
  }, [purchasePrice, estimatedValue]);

  const selectedSilverMvpProduct = isSilverMvpProduct(product) ? product : null;
  const isSilverCreationFlow = !effectiveEditMode && metal === 'argent';

  const silverBreakdown = useMemo(() => {
    if (!isSilverCreationFlow || selectedSilverMvpProduct === null || price <= 0 || qty <= 0) return null;
    try {
      return computeSilverBreakdown({
        unitPriceTTC: price,
        quantity: qty,
        vatRate: selectedSilverMvpProduct.vatRate,
      });
    } catch {
      return null;
    }
  }, [isSilverCreationFlow, selectedSilverMvpProduct, price, qty]);

  const silverPremiumWarning = useMemo(() => {
    if (!isSilverCreationFlow || selectedSilverMvpProduct === null || price <= 0) return null;
    return computeSilverMvpPremiumWarning({
      productId: selectedSilverMvpProduct.id,
      unitPriceTTC: price,
      spotEur,
    });
  }, [isSilverCreationFlow, selectedSilverMvpProduct, price, spotEur]);
  const displayedSilverPremiumWarning =
    silverPremiumWarning !== null &&
    Math.abs(silverPremiumWarning.premiumPct) >= SILVER_PREMIUM_WARNING_DISPLAY_THRESHOLD_PCT
      ? silverPremiumWarning
      : null;

  const silverGapCopy = selectedSilverMvpProduct === null
    ? null
    : selectedSilverMvpProduct.vatRate !== null
      ? `Prix TTC : la TVA (${Math.round(selectedSilverMvpProduct.vatRate * 100)} %) peut contribuer à l’écart au spot.`
      : 'Prix TTC : TVA/fiscalité à confirmer, ne lisez pas l’écart au spot comme une prime seule.';

  // ── Grille pièces — scission en 2 useMemo (correction 8) ─────────────

  const allCoinsForMetal = useMemo(() => {
    if (metal === 'argent' && !effectiveEditMode) {
      return SILVER_MVP_PRODUCTS.map(product => ({
        ...product,
        popular: SILVER_POPULAR_BADGE_PRODUCT_IDS.includes(product.id),
      }));
    }
    const coins = PRODUCTS[metal].filter(p => p.category === 'piece');
    if (metal !== 'or') {
      // Autres métaux : comportement historique (tri popular-first).
      return [...coins].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
    }
    // Or : ordre prioritaire explicite + override du champ `popular` par la
    // whitelist locale POPULAR_GOLD_COINS_ON_ADD. Les pièces hors priorité
    // (s'il en existe au catalogue) sont rendues après, dans leur ordre brut.
    const prepared: Product[] = [];
    for (const priorityLabel of GOLD_PRIORITY_ORDER) {
      const p = coins.find(c => c.label === priorityLabel);
      if (p) prepared.push({ ...p, popular: POPULAR_GOLD_COINS_ON_ADD.includes(priorityLabel) });
    }
    for (const p of coins) {
      if (!GOLD_PRIORITY_ORDER.includes(p.label)) {
        prepared.push({ ...p, popular: false });
      }
    }
    return prepared;
  }, [metal, effectiveEditMode]);

  const visiblePieces = useMemo(() => {
    let coins = allCoinsForMetal;
    // Filter by search when expanded and search is non-empty (case + accent insensitive + aliases or).
    if (showAllPieces && coinSearch.trim()) {
      coins = coins.filter(c => matchesCoinQuery(c, coinSearch));
    }
    if (!showAllPieces) {
      const reducedCoins = metal === 'or'
        ? [...coins].sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)))
        : coins;
      const top4 = reducedCoins.slice(0, 4);
      if (product && product.category === 'piece' && !top4.some(p => p.label === product.label)) {
        const selected = reducedCoins.find(p => p.label === product.label);
        if (selected) top4.push(selected);
      }
      return top4;
    }
    return coins;
  }, [allCoinsForMetal, showAllPieces, coinSearch, product, metal]);

  const showExpandPiecesButton = allCoinsForMetal.length > 4;

  const visibleLingots = useMemo(() => {
    if (metal === 'argent' && !effectiveEditMode) return [];
    const allLingots = PRODUCTS[metal].filter(p => p.category === 'lingot' || p.category === 'autre');
    if (showAllBars) return allLingots;
    const top4 = allLingots.slice(0, 4);
    if (product && (product.category === 'lingot' || product.category === 'autre') && !top4.some(p => p.label === product.label)) {
      const selected = allLingots.find(p => p.label === product.label);
      if (selected) top4.push(selected);
    }
    return top4;
  }, [metal, showAllBars, product, effectiveEditMode]);

  const totalLingots = metal === 'argent' && !effectiveEditMode
    ? 0
    : PRODUCTS[metal].filter(p => p.category === 'lingot' || p.category === 'autre').length;

  // ── Toggles ──────────────────────────────────────────────────────────

  const toggleShowAllPieces = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllPieces(prev => {
      if (prev) setCoinSearch(''); // reset search on collapse
      return !prev;
    });
  }, []);

  const toggleShowAllBars = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllBars(prev => !prev);
  }, []);

  // ── Sélection produit ─────────────────────────────────────────────────

  const handleProductSelect = useCallback((p: SelectableProduct) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    fireAddPositionStartedOnce();

    setProduct(p);
    setCustomWeight('');

    const w = p.weightG ?? 0;
    const spot = getSpot(metal, prices);
    if (spot !== null && w > 0) {
      const unitVal = (w / OZ_TO_G) * spot;
      if (unitVal > 0 && !isNaN(unitVal)) {
        const pv = unitVal.toFixed(2);
        setPurchasePrice(pv); setPriceDisplay(formatPriceDisplay(pv)); setPriceKey(k => k + 1);
      } else {
        setPurchasePrice(''); setPriceDisplay(''); setPriceKey(k => k + 1);
      }
    } else {
      setPurchasePrice(''); setPriceDisplay(''); setPriceKey(k => k + 1);
    }

    if (!dateRef.current) {
      setPurchaseDate(formatDateDMY(new Date()));
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  }, [metal, prices, fireAddPositionStartedOnce]);

  // ── "Continuer" handler ───────────────────────────────────────────────

  const handleContinue = useCallback(() => {
    setIsStep2Active(true);
    setCoinSearch('');
    justTappedContinue.current = true;
  }, []);

  // ── Validation ────────────────────────────────────────────────────────

  const isDateValid = useMemo(() => {
    const d = parseDate(purchaseDate);
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() <= today.getTime();
  }, [purchaseDate]);

  const canSave = useMemo(() =>
    product !== null &&
    qty > 0 &&
    price > 0 &&
    isDateValid &&
    effectiveWeightG > 0,
    [product, qty, price, isDateValid, effectiveWeightG]
  );

  // ── Help text contextuel ──────────────────────────────────────────────

  const helpText = useMemo(() => {
    if (product === null) return 'Choisissez un produit pour continuer';
    if (!(effectiveWeightG > 0)) return 'Renseignez le poids du produit';
    if (!(qty > 0)) return 'Renseignez la quantité';
    if (!(price > 0)) return 'Renseignez le prix d\u2019achat';
    if (!isDateValid) return 'Renseignez une date d\u2019achat valide';
    return 'Complétez les champs requis';
  }, [product, effectiveWeightG, qty, price, isDateValid]);

  // ── Highlighted field ─────────────────────────────────────────────────

  const highlightedField = useMemo(() => {
    if (!isStep2Active || canSave) return null;
    if (product === null) return null;
    if (!(effectiveWeightG > 0)) return 'weight';
    if (!(qty > 0)) return 'quantity';
    if (!(price > 0)) return 'price';
    if (!isDateValid) return 'date';
    return null;
  }, [isStep2Active, canSave, product, effectiveWeightG, qty, price, isDateValid]);

  // ── CTA config centralisé ─────────────────────────────────────────────

  const ctaConfig = useMemo(() => {
    if (confirmed) {
      return {
        text: effectiveEditMode ? '✓  Position mise à jour !' : '✓  Position ajoutée !',
        disabled: true,
        bgColor: '#2E7D32',
        textColor: '#F5F0E8',
        action: 'none' as const,
      };
    }
    if (saving) {
      return {
        text: 'Enregistrement…',
        disabled: true,
        bgColor: '#C9A84C',
        textColor: '#12110F',
        action: 'none' as const,
      };
    }
    if (!product && !isStep2Active) {
      return {
        text: 'Choisissez un produit',
        disabled: true,
        bgColor: '#2A2620',
        textColor: '#7A7060',
        action: 'none' as const,
      };
    }
    if (product && !isStep2Active) {
      return {
        text: `Continuer avec ${truncateName(product.label)}`,
        disabled: false,
        bgColor: '#C9A84C',
        textColor: '#12110F',
        showChevron: true,
        action: 'scrollToStep2' as const,
      };
    }
    if (!canSave) {
      return {
        text: helpText,
        disabled: true,
        bgColor: '#2A2620',
        textColor: '#7A7060',
        action: 'none' as const,
      };
    }
    return {
      text: effectiveEditMode ? 'Enregistrer les modifications' : 'Ajouter au portefeuille',
      disabled: false,
      bgColor: '#C9A84C',
      textColor: '#12110F',
      action: 'save' as const,
    };
  }, [product, isStep2Active, canSave, effectiveEditMode, helpText, confirmed, saving]);

  // ── Sauvegarde ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!canSave || saving || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Commit le prix saisi avant de construire le payload : sans cela, un
      // tap direct sur le CTA Enregistrer (clavier ouvert, pas de blur) lit
      // un `purchasePrice` stale (ex. valeur préremplie au choix produit).
      const committedPriceStr = commitPurchasePriceInput();
      const committedPrice = toNum(committedPriceStr);
      if (!(committedPrice > 0)) {
        // Le champ est vide ou nul après commit : abort sans persister, le
        // formulaire reverra son `canSave` au prochain rendu.
        savingRef.current = false;
        setSaving(false);
        return;
      }

      const existing = effectiveEditMode ? positions.find(p => p.id === editId) : undefined;
      const selectedSilverProduct = isSilverMvpProduct(product) ? product : null;
      const productId = selectedSilverProduct?.id
        ?? (existing?.productId && existing.product === product!.label ? existing.productId : undefined);

      const newPosition: Position = {
        id: effectiveEditMode ? editId! : Date.now().toString(36) + Math.random().toString(36).slice(2),
        metal,
        product: product!.label,
        weightG: effectiveWeightG,
        quantity: qty,
        purchasePrice: committedPrice,
        purchaseDate: purchaseDate.trim(),
        createdAt: new Date().toISOString(),
        note: note.trim() || undefined,
        spotAtPurchase: estimatedValue ?? undefined,
        productId,
      };

      if (effectiveEditMode) {
        await updatePosition({ ...newPosition, id: editId!, createdAt: existing?.createdAt ?? newPosition.createdAt });
      } else {
        if (!canAddPosition(positions.length)) {
          savingRef.current = false;
          setSaving(false);
          showPaywall();
          return;
        }
        await addPosition(newPosition);
        // Funnel analytics: only on a successful CREATION save (not edits).
        // Properties scrubbed of any PII / financial values.
        void trackEvent('add_position_completed', {
          metal,
          product_type: product!.category ?? 'unknown',
          has_purchase_date: purchaseDate.trim().length > 0,
          has_purchase_price: price > 0,
          source: 'tab',
        });
      }

      setCustomWeight('');
      setQuantity('1');
      setPurchasePrice(''); setPriceDisplay(''); setPriceKey(k => k + 1);
      setPurchaseDate('');
      setNote('');
      setShowAllPieces(false);

      setConfirmed(true);
      // Succès : ne PAS remettre savingRef à false — le composant reste verrouillé
      // jusqu'au démontage (navigation après 1400ms). Évite un 3e tap pendant l'animation.
      setTimeout(() => {
        setConfirmed(false);
        if (effectiveEditMode) {
          router.replace('/(tabs)/portefeuille');
        } else {
          router.navigate('/(tabs)/portefeuille');
        }
      }, 1400);
    } catch (error) {
      savingRef.current = false;
      setSaving(false);
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de sauvegarder la position.');
    }
  };

  // ── CTA handler ───────────────────────────────────────────────────────

  const handleCtaPress = useCallback(() => {
    if (ctaConfig.action === 'scrollToStep2') {
      handleContinue();
    } else if (ctaConfig.action === 'save') {
      handleSave();
    }
  }, [ctaConfig.action, handleContinue, handleSave]);

  // ── Indicateurs pour boutons expand ────────────────────────────────────

  // Utilise la liste préparée (popular surchargé pour Or via whitelist locale).
  const selectedNonPopularPiece = allCoinsForMetal.some(
    p => !p.popular && p.label === product?.label
  );
  const selectedInLingots = PRODUCTS[metal].some(
    p => (p.category === 'lingot' || p.category === 'autre') && p.label === product?.label
  );

  // Suffixes pré-calculés ici pour garder ProductSelector purement présentationnel
  // (pas de transform de produit ni d'import de truncateName côté composant).
  const piecesExpandSuffix = !showAllPieces && selectedNonPopularPiece && product
    ? ` · ${truncateName(product.label)} ✓`
    : '';
  const barsExpandSuffix = !showAllBars && selectedInLingots && product
    ? ` · ${truncateName(product.label)} ✓`
    : '';

  // ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* ── Titre + sous-titre (corrections 1, 4) ─────────────────── */}
          <Text style={styles.headerTitle}>
            {effectiveEditMode ? 'Modifier la position' : 'Ajouter une position'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {effectiveEditMode
              ? 'Modifiez les détails de votre position'
              : 'Choisissez votre produit, renseignez l’achat'}
          </Text>
          {!effectiveEditMode && !isStep2Active && (
            <Text style={styles.progressIndicator}>
              Étape 1 · Choisissez votre produit
            </Text>
          )}

          <MetalSelector
            options={METAL_OPTIONS}
            selected={metal}
            spotInlineLabel={
              spotEur !== null
                ? `Cours spot : ${formatEuro(spotEur)} ${currencySymbol}/oz`
                : 'Cours spot : —'
            }
            onSelect={handleMetalChange}
          />

          <ProductSelector
            metal={metal}
            selectedProduct={product}
            coinSearch={coinSearch}
            visiblePieces={visiblePieces}
            visibleLingots={visibleLingots}
            totalLingots={totalLingots}
            hasCoinsCatalog={allCoinsForMetal.length > 0}
            showAllPieces={showAllPieces}
            showAllBars={showAllBars}
            showExpandPiecesButton={showExpandPiecesButton}
            isSilverCreationFlow={isSilverCreationFlow}
            singleLineLabelIds={SILVER_SINGLE_LINE_PRODUCT_IDS}
            coinsSectionTitle={PRODUCT_SECTION_TITLE_BY_METAL[metal]}
            piecesExpandSuffix={piecesExpandSuffix}
            barsExpandSuffix={barsExpandSuffix}
            onSearchChange={setCoinSearch}
            onProductSelect={handleProductSelect}
            onToggleShowAllPieces={toggleShowAllPieces}
            onToggleShowAllBars={toggleShowAllBars}
          />

          {/* Feedback sélection sous la grille */}
          {product !== null && !isStep2Active && estimatedValue !== null && (
            <Text style={styles.selectionFeedback}>
              {'✓ '}{product.label} · {product.weightG !== null ? formatG(product.weightG) : formatG(toNum(customWeight))} · ~{formatEuro(estimatedValue)} €
            </Text>
          )}

          {/* ── Contenu étape 2 (conditionnel sur product) ─────────── */}
          {product !== null && (
            <>
              {/* Poids personnalisé (Autre) */}
              {product.weightG === null && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Poids unitaire</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="Ex : 7,78"
                      placeholderTextColor={OrTrackColors.tabIconDefault}
                      value={customWeight}
                      onChangeText={setCustomWeight}
                    />
                    <Text style={styles.inputSuffix}>g</Text>
                  </View>
                </View>
              )}

              {/* Cours actuel du produit */}
              {spotEur !== null && effectiveWeightG > 0 && (
                <SpotInfoCard
                  spotPriceLabel={`${formatEuro(spotEur)} ${currencySymbol}/oz`}
                  productLineLabel={`${product.label} · ${formatG(effectiveWeightG)}`}
                  estimatedValueTitle={metal === 'argent' ? 'Valeur métal unitaire estimée' : 'Valeur unitaire estimée'}
                  estimatedValueLabel={`${formatEuro((effectiveWeightG / OZ_TO_G) * spotEur)} ${currencySymbol}`}
                  onLayout={(e) => { spotInfoCardYRef.current = e.nativeEvent.layout.y; }}
                />
              )}

              {/* ── Stepper étape 2 + Formulaire ── */}
              {isStep2Active && (
                <View
                  style={styles.section}
                  onLayout={(e) => {
                    if (justTappedContinue.current) {
                      const y = e.nativeEvent.layout.y;
                      InteractionManager.runAfterInteractions(() => {
                        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
                      });
                      justTappedContinue.current = false;
                    }
                  }}
                >
                  <Text style={styles.progressIndicator}>
                    Étape 2 · Détails de l’achat
                  </Text>
                  <Text style={styles.sectionTitle}>Détails de l’achat</Text>
                  {product && (
                    <View>
                      <Text style={styles.miniRecapText}>
                        {product.label} · {product.weightG !== null ? formatG(product.weightG) : formatG(toNum(customWeight))}
                      </Text>
                      <View style={styles.miniRecapSeparator} />
                    </View>
                  )}
                  <View style={styles.fieldGroup}>

                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, highlightedField === 'quantity' && { color: OrTrackColors.gold }]}>Quantité</Text>
                      <QuantityField
                        value={quantity}
                        onChangeText={setQuantity}
                        onFocus={fireAddPositionStartedOnce}
                      />
                    </View>

                    <View style={styles.field}>
                      <View style={styles.fieldLabelRow}>
                        <Text style={[styles.fieldLabel, highlightedField === 'price' && { color: OrTrackColors.gold }]}>
                          {metal === 'argent' ? 'Prix payé TTC' : 'Prix d’achat unitaire'}
                        </Text>
                        {/* Correction 7 — Raccourci "Cours du jour" */}
                        {estimatedValue !== null && estimatedValue > 0 && (
                          <TouchableOpacity
                            onPress={() => {
                              // NOTE: estimatedValue is computed from spot price at load time.
                              // If the user stays on screen for a long time, this value may be stale.
                              // Consider refreshing on "Cours du jour" tap in a future version.
                              const spotVal = estimatedValue!.toFixed(2);
                              const spotFr = spotVal.replace('.', ',');
                              setPurchasePrice(spotVal);
                              setPriceDisplay(formatPriceDisplay(spotVal));
                              priceLocalRef.current = spotFr;
                              setPriceKey(k => k + 1);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.quickFillBtn}>{metal === 'argent' ? 'Valeur métal' : 'Cours spot'}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          key={`price-${priceKey}`}
                          style={styles.input}
                          keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                          placeholder="Ex : 1 700"
                          placeholderTextColor={OrTrackColors.tabIconDefault}
                          defaultValue={priceDisplay}
                          onFocus={fireAddPositionStartedOnce}
                          onBlur={commitPurchasePriceInput}
                          onChangeText={(text) => {
                            priceLocalRef.current = text;
                          }}
                        />
                        <Text style={styles.inputSuffix}>{currencySymbol}</Text>
                      </View>
                      {priceAnalysis.showPriceReference && (
                        <Text style={styles.priceRef}>
                          {metal === 'argent' ? 'Valeur métal actuelle' : 'Cours actuel'} : {estimatedValue!.toFixed(2)} €
                        </Text>
                      )}
                      {isSilverCreationFlow && silverGapCopy && (
                        <Text style={styles.priceRef}>{silverGapCopy}</Text>
                      )}
                    </View>

                    <DateField
                      label="Date d’achat"
                      placeholder="JJ/MM/AAAA"
                      isHighlighted={highlightedField === 'date'}
                      value={purchaseDate}
                      onChangeText={(t) => setPurchaseDate(autoFormatDate(t))}
                      onFocus={fireAddPositionStartedOnce}
                      shortcuts={[
                        {
                          label: 'Hier',
                          onPress: () => {
                            const yesterday = new Date();
                            yesterday.setDate(yesterday.getDate() - 1);
                            setPurchaseDate(formatDateDMY(yesterday));
                          },
                        },
                        {
                          label: 'Aujourd’hui',
                          onPress: () => setPurchaseDate(formatDateDMY(new Date())),
                        },
                      ]}
                    />

                    <NoteField
                      label="Note (optionnel)"
                      placeholder="Ajoutez un contexte si utile"
                      value={note}
                      onChangeText={setNote}
                    />

                  </View>
                </View>
              )}

              {/* Estimation temps réel */}
              {isStep2Active && currentValue !== null && (() => {
                const roundedGainLossValue = gainLoss !== null
                  ? Math.round(gainLoss * 100) / 100
                  : null;
                const absoluteGainLossLabel = roundedGainLossValue !== null
                  ? formatEuro(Math.abs(roundedGainLossValue))
                  : undefined;
                const estimationModel = buildEstimationDisplayModel({
                  estimatedValueLabel: `${formatEuro(currentValue)} €`,
                  roundedGainLossValue,
                  absoluteGainLossLabel,
                  spotPriceLabel: spotEur !== null ? `${formatEuro(spotEur)} €/oz` : undefined,
                  unitLabel: formatG(effectiveWeightG),
                  disclaimerVariant: spotEur !== null
                    ? (metal === 'argent' ? 'silver' : 'standard')
                    : undefined,
                });

                return (
                  <EstimationCard
                    title={estimationModel.title}
                    estimatedValueLabel={estimationModel.estimatedValueLabel}
                    gainLossLabel={estimationModel.gainLossLabel}
                    gainLossTone={estimationModel.gainLossTone}
                    helperText={estimationModel.helperText}
                    disclaimerText={estimationModel.disclaimerText}
                  >
                    {isSilverCreationFlow && silverBreakdown && (
                      <View style={styles.silverBreakdownBlock}>
                        <Text style={styles.estimationDisclaimer}>
                          Prix payé TTC : {formatEuro(silverBreakdown.totalPaidTTC)} €
                        </Text>
                        {Number.isFinite(silverBreakdown.estimatedVatImpact) && (
                          <Text style={styles.estimationDisclaimer}>
                            TVA estimée : {formatEuro(silverBreakdown.estimatedVatImpact!)} €
                          </Text>
                        )}
                      </View>
                    )}
                    {displayedSilverPremiumWarning && (
                      <Text style={styles.silverWarning}>
                        Prix payé différent du spot actuel. L’écart peut inclure TVA, prime, marge ou frais.
                      </Text>
                    )}
                  </EstimationCard>
                );
              })()}

              {/* Spacer */}
              <View style={{ height: 110 }} />
            </>
          )}

        </ScrollView>

        {/* ── CTA sticky ─────────────────────────────────────────────── */}
        <View style={styles.stickyCtaContainer}>
          <Pressable
            style={[
              styles.ctaButton,
              { backgroundColor: ctaConfig.bgColor },
            ]}
            onPress={handleCtaPress}
            disabled={ctaConfig.disabled}
            accessibilityLabel={ctaConfig.text}
            accessibilityState={{ disabled: ctaConfig.disabled }}
          >
            <View style={styles.ctaButtonInner}>
              <Text numberOfLines={1} style={[styles.ctaText, { color: ctaConfig.textColor }]}>
                {ctaConfig.text}
              </Text>
              {ctaConfig.showChevron && (
                <Ionicons name="chevron-forward" size={18} color={ctaConfig.textColor} />
              )}
            </View>
          </Pressable>
          {isStep2Active && !effectiveEditMode && (
            <Text style={styles.ctaReassurance}>Modifiable à tout moment</Text>
          )}
        </View>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OrTrackColors.background,
  },
  flex: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 20,
  },

  // Header
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: OrTrackColors.white,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: OrTrackColors.subtext,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 8,
  },

  // Sections
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // Mini-récap produit (correction 3)
  miniRecapText: {
    color: OrTrackColors.white,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 12,
  },
  miniRecapSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: OrTrackColors.border,
    marginBottom: 16,
  },

  // Selection feedback (correction 8)
  selectionFeedback: {
    color: 'rgba(245, 240, 232, 0.6)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },

  // Inputs
  fieldGroup: { gap: 14 },
  field: { gap: 6 },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickFillBtn: {
    fontSize: 14,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 13,
    color: OrTrackColors.label,
    fontWeight: '500',
    marginLeft: 2,
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingRight: 48,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    fontSize: 16,
    color: OrTrackColors.white,
  },
  inputSuffix: {
    position: 'absolute',
    right: 14,
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.subtext,
  },

  // Price reference
  priceRef: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 4,
    marginLeft: 2,
  },
  priceRefUnavailable: {
    fontSize: 13,
    color: OrTrackColors.subtext,
  },

  // estimationDisclaimer kept here because the silver-breakdown children
  // (TVA + premium warning) rendered by ajouter.tsx and passed into
  // EstimationCard via `children` still need it. EstimationCard has its own
  // byte-identical duplicate for the card's own disclaimer line.
  estimationDisclaimer: {
    fontSize: 10,
    color: '#B3A692',
    marginTop: 4,
    fontStyle: 'italic',
  },
  silverBreakdownBlock: {
    marginTop: 2,
    gap: 2,
  },
  silverWarning: {
    fontSize: 10,
    color: '#E0A84F',
    marginTop: 4,
    lineHeight: 14,
  },

  // Sticky CTA
  stickyCtaContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: OrTrackColors.background,
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
  },
  ctaButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
  },
  ctaReassurance: {
    color: OrTrackColors.subtext,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  progressIndicator: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginBottom: 12,
  },
});
