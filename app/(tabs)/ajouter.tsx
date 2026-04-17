import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
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
import { formatEuro, formatG } from '@/utils/format';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { Position } from '@/types/position';
import { usePositions } from '@/hooks/use-positions';
import { parseDate } from '@/utils/tax-helpers';

// ─── LayoutAnimation Android ──────────────────────────────────────────────────

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get('window').width;
const CHIP_WIDTH = (SCREEN_WIDTH - 40 - 8) / 2;

const MAX_CTA_NAME_LENGTH = 20;

/** Tronque au dernier espace avant la limite pour éviter une coupure en plein mot. */
const truncateName = (s: string, max: number = MAX_CTA_NAME_LENGTH): string => {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(' ', max);
  return (cut > 0 ? s.slice(0, cut) : s.slice(0, max)) + '\u2026';
};

type Product = {
  label: string;
  weightG: number | null;
  popular?: boolean;
  category: 'piece' | 'lingot' | 'autre';
};

const PRODUCTS: Record<MetalType, Product[]> = {
  or: [
    { label: 'Napoléon 20F', weightG: 5.81, popular: true, category: 'piece' },
    { label: 'Souverain', weightG: 7.32, category: 'piece' },
    { label: 'Krugerrand 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Maple Leaf 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Philharmonique 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Buffalo Américain 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Panda de Chine 30g', weightG: 30, category: 'piece' },
    { label: 'Britannia 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Kangourou 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Lingot 10g', weightG: 10, category: 'lingot' },
    { label: 'Lingot 100g', weightG: 100, category: 'lingot' },
    { label: 'Lingot 1kg', weightG: 1000, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  argent: [
    { label: 'Maple Leaf 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Philharmonique 1oz', weightG: 31.10, category: 'piece' },
    { label: 'American Eagle 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Britannia 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Panda 30g', weightG: 30, category: 'piece' },
    { label: 'Kangourou 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Krugerrand 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Lingot 100g', weightG: 100, category: 'lingot' },
    { label: 'Lingot 1kg', weightG: 1000, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  platine: [
    { label: 'Maple Leaf 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'American Eagle 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Britannia 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Philharmonique 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Kangourou 1oz', weightG: 31.10, category: 'piece' },
    // Entrée générique conservée pour rétrocompatibilité des positions legacy stockées avec label='Pièce 1oz'
    { label: 'Pièce 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Lingot 100g', weightG: 100, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  palladium: [
    { label: 'Maple Leaf 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'American Eagle 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Cook Islands 1oz', weightG: 31.10, category: 'piece' },
    // Entrée générique conservée pour rétrocompatibilité des positions legacy stockées avec label='Pièce 1oz'
    { label: 'Pièce 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
};

const metalEntries = Object.entries(METAL_CONFIG) as [MetalType, typeof METAL_CONFIG[MetalType]][];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0;
}

function formatPriceDisplay(val: string): string {
  const num = parseFloat(val.replace(',', '.'));
  return !isNaN(num) && num > 0 ? formatEuro(num) : val.replace(/\./g, ',');
}

function autoFormatDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  if (digits.length > 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

function formatDateDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
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
  const { prices, currencySymbol, refresh } = useSpotPrices();
  const { canAddPosition, showPaywall } = usePremium();
  const { positions, reloadPositions, addPosition, updatePosition } = usePositions();

  useFocusEffect(
    useCallback(() => {
      refresh();
      setIsPriceFocused(false);
    }, [refresh])
  );

  // ── States ──────────────────────────────────────────────────────────────

  const scrollRef = useRef<ScrollView>(null);

  const spotInfoCardYRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justTappedContinue = useRef(false);

  const [metal, setMetal] = useState<MetalType>('or');
  const [product, setProduct] = useState<Product | null>(null);
  const [customWeight, setCustomWeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [note, setNote] = useState('');
  const [showAllPieces, setShowAllPieces] = useState(false);
  const [showAllBars, setShowAllBars] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isStep2Active, setIsStep2Active] = useState(false);
  const [coinSearch, setCoinSearch] = useState('');
  const [isPriceFocused, setIsPriceFocused] = useState(false);
  const priceLocalRef = useRef(purchasePrice);
  const [priceKey, setPriceKey] = useState(0);
  const [priceDisplay, setPriceDisplay] = useState('');

  const dateRef = useRef(purchaseDate);
  dateRef.current = purchaseDate;

  // ── Focus effect : réarme le guard de sauvegarde à chaque retour d'écran
  // (le composant ne se démonte pas entre navigations Expo Router tabs)
  useFocusEffect(
    useCallback(() => {
      savingRef.current = false;
      setSaving(false);
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
          setIsPriceFocused(false);
          return;
        }
        if (!existing) return;
        setMetal(existing.metal);
        const matchedProduct = PRODUCTS[existing.metal].find(p => p.label === existing.product) ?? null;
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
        setIsPriceFocused(false);
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
        setIsPriceFocused(false);

        if (!canAddPosition(positions.length)) {
          showPaywall();
        }
      }
    }, [isEditMode, editId, staleEditId, positions, canAddPosition, showPaywall])
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
    setIsPriceFocused(false);
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

  // ── Grille pièces — scission en 2 useMemo (correction 8) ─────────────

  const allCoinsForMetal = useMemo(() => {
    const coins = PRODUCTS[metal].filter(p => p.category === 'piece');
    return [...coins].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
  }, [metal]);

  const visiblePieces = useMemo(() => {
    let coins = allCoinsForMetal;
    // Filter by search when expanded and search is non-empty
    if (showAllPieces && coinSearch.trim()) {
      coins = coins.filter(c =>
        c.label.toLowerCase().includes(coinSearch.trim().toLowerCase())
      );
    }
    if (!showAllPieces) {
      const top4 = coins.slice(0, 4);
      if (product && product.category === 'piece' && !top4.some(p => p.label === product.label)) {
        const selected = coins.find(p => p.label === product.label);
        if (selected) top4.push(selected);
      }
      return top4;
    }
    return coins;
  }, [allCoinsForMetal, showAllPieces, coinSearch, product]);

  const showExpandPiecesButton = allCoinsForMetal.length > 4;
  const hasPopularPieces = allCoinsForMetal.some(p => p.popular);

  const visibleLingots = useMemo(() => {
    const allLingots = PRODUCTS[metal].filter(p => p.category === 'lingot' || p.category === 'autre');
    if (showAllBars) return allLingots;
    const top4 = allLingots.slice(0, 4);
    if (product && (product.category === 'lingot' || product.category === 'autre') && !top4.some(p => p.label === product.label)) {
      const selected = allLingots.find(p => p.label === product.label);
      if (selected) top4.push(selected);
    }
    return top4;
  }, [metal, showAllBars, product]);

  const totalLingots = PRODUCTS[metal].filter(p => p.category === 'lingot' || p.category === 'autre').length;

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

  const handleProductSelect = useCallback((p: Product) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    setProduct(p);
    setCustomWeight('');
    setIsPriceFocused(false);

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
    setIsPriceFocused(false);

    if (!dateRef.current) {
      setPurchaseDate(formatDateDMY(new Date()));
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  }, [metal, prices]);

  // ── "Continuer" handler ───────────────────────────────────────────────

  const handleContinue = useCallback(() => {
    setIsPriceFocused(false);
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
      const newPosition: Position = {
        id: effectiveEditMode ? editId! : Date.now().toString(36) + Math.random().toString(36).slice(2),
        metal,
        product: product!.label,
        weightG: effectiveWeightG,
        quantity: qty,
        purchasePrice: price,
        purchaseDate: purchaseDate.trim(),
        createdAt: new Date().toISOString(),
        note: note.trim() || undefined,
        spotAtPurchase: estimatedValue ?? undefined,
      };

      if (effectiveEditMode) {
        const existing = positions.find(p => p.id === editId);
        await updatePosition({ ...newPosition, id: editId!, createdAt: existing?.createdAt ?? newPosition.createdAt });
      } else {
        if (!canAddPosition(positions.length)) {
          savingRef.current = false;
          setSaving(false);
          showPaywall();
          return;
        }
        await addPosition(newPosition);
      }

      setCustomWeight('');
      setQuantity('1');
      setPurchasePrice(''); setPriceDisplay(''); setPriceKey(k => k + 1);
      setPurchaseDate('');
      setNote('');
      setIsPriceFocused(false);
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
    } catch {
      savingRef.current = false;
      setSaving(false);
      Alert.alert('Erreur', 'Impossible de sauvegarder la position.');
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

  // ── Render chip helper ────────────────────────────────────────────────

  const renderChip = (p: Product, compact = false) => {
    const active = product?.label === p.label;
    return (
      <TouchableOpacity
        key={p.label}
        onPress={() => handleProductSelect(p)}
        activeOpacity={0.75}
        style={[
          styles.productChip,
          compact && styles.productChipCompact,
          active && styles.productChipActive,
        ]}>
        {active && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={14} color={OrTrackColors.white} />
          </View>
        )}
        {p.popular && (
          <View style={[styles.popularBadge, compact && styles.popularBadgeCompact]}>
            <Text style={[styles.popularBadgeText, compact && { fontSize: 8 }]}>
              Populaire
            </Text>
          </View>
        )}
        <Text
          numberOfLines={2}
          ellipsizeMode="tail"
          style={[
            styles.productChipLabel,
            compact && styles.productChipLabelCompact,
            active && styles.productChipLabelActive,
            active && { paddingRight: 32 },
          ]}>
          {p.category === 'autre' ? 'Autre lingot' : p.label}
        </Text>
        {p.weightG !== null && (
          <Text style={[
            styles.productChipWeight,
            active && styles.productChipWeightActive,
          ]}>
            {p.weightG >= 1000
              ? `${p.weightG / 1000} kg`
              : p.weightG % 1 === 0
              ? `${p.weightG} g`
              : `${p.weightG.toFixed(2).replace('.', ',')} g`}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  // ── Indicateurs pour boutons expand ────────────────────────────────────

  const selectedNonPopularPiece = PRODUCTS[metal].some(
    p => p.category === 'piece' && !p.popular && p.label === product?.label
  );
  const selectedInLingots = PRODUCTS[metal].some(
    p => (p.category === 'lingot' || p.category === 'autre') && p.label === product?.label
  );

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
              : 'Choisissez votre produit, puis renseignez votre achat'}
          </Text>
          {!effectiveEditMode && !isStep2Active && (
            <Text style={styles.progressIndicator}>
              Étape 1 · Choisissez votre produit
            </Text>
          )}

          {/* ── Sélection métal ─────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Métal</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}>
              {metalEntries.map(([key, cfg]) => {
                const active = metal === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => handleMetalChange(key)}
                    activeOpacity={0.75}
                    style={[
                      styles.metalPill,
                      active
                        ? { backgroundColor: cfg.chipBorder, borderColor: cfg.chipBorder }
                        : { backgroundColor: OrTrackColors.card, borderColor: OrTrackColors.border },
                    ]}>
                    <Text style={[
                      styles.metalPillText,
                      active
                        ? { color: OrTrackColors.background, fontWeight: '700' }
                        : { color: OrTrackColors.white, fontWeight: '600' },
                    ]}>
                      {cfg.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.spotInline}>
              {spotEur !== null
                ? `Cours spot : ${formatEuro(spotEur)} ${currencySymbol}/oz`
                : 'Cours spot : —'}
            </Text>
          </View>

          {/* ── Sélection produit (correction 3 — "CHOISISSEZ UN PRODUIT") ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choisissez un produit</Text>

            {/* Pièces */}
            {allCoinsForMetal.length > 0 && (
              <>
                {/* Mini-header "POPULAIRES" (correction 5) */}
                {hasPopularPieces && coinSearch.trim() === '' && (
                  <Text style={styles.popularSectionHeader}>POPULAIRES</Text>
                )}

                {/* Search field when expanded (correction 9) */}
                {showAllPieces && (
                  <TextInput
                    placeholder="Rechercher une pièce..."
                    placeholderTextColor={OrTrackColors.textDim}
                    value={coinSearch}
                    onChangeText={setCoinSearch}
                    autoFocus={false}
                    accessibilityLabel="Rechercher une pièce"
                    style={styles.searchInput}
                  />
                )}

                {/* No results message */}
                {showAllPieces && coinSearch.trim() !== '' && visiblePieces.length === 0 && (
                  <Text style={styles.noResultText}>Aucun produit trouvé</Text>
                )}

                <View style={styles.productGrid}>
                  {visiblePieces.map(p => renderChip(p, showAllPieces))}
                </View>
                {showExpandPiecesButton && (
                  <TouchableOpacity
                    onPress={toggleShowAllPieces}
                    activeOpacity={0.7}
                    style={styles.expandButton}>
                    <Text numberOfLines={1} style={styles.expandButtonText}>
                      {showAllPieces ? 'Réduire la liste' : 'Voir plus de pièces'}
                      {!showAllPieces && selectedNonPopularPiece && product
                        ? ` · ${truncateName(product.label)} ✓`
                        : ''}
                    </Text>
                    <Ionicons
                      name={showAllPieces ? 'chevron-up' : 'chevron-forward'}
                      size={14}
                      color={OrTrackColors.gold}
                    />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Lingots */}
            {totalLingots > 0 && (
              <>
                {allCoinsForMetal.length > 0 && (
                  <>
                    <View style={styles.lingotsSeparator} />
                    <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Lingots</Text>
                  </>
                )}
                <View style={styles.productGrid}>
                  {visibleLingots.map(p => renderChip(p))}
                </View>
                {totalLingots > 4 && (
                  <TouchableOpacity
                    onPress={toggleShowAllBars}
                    activeOpacity={0.7}
                    style={styles.expandButton}>
                    <Text numberOfLines={1} style={styles.expandButtonText}>
                      {showAllBars ? 'Réduire la liste' : 'Voir plus de lingots'}
                      {!showAllBars && selectedInLingots && product
                        ? ` · ${truncateName(product.label)} ✓`
                        : ''}
                    </Text>
                    <Ionicons
                      name={showAllBars ? 'chevron-up' : 'chevron-forward'}
                      size={14}
                      color={OrTrackColors.gold}
                    />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

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
                <View
                  collapsable={false}
                  onLayout={(e) => { spotInfoCardYRef.current = e.nativeEvent.layout.y; }}>
                  <View style={styles.separator} />
                  <View style={styles.spotInfoCard}>
                    <View style={styles.spotInfoRow}>
                      <Text style={styles.spotInfoLabel}>Cours actuel</Text>
                      <Text style={styles.spotInfoValue}>
                        {formatEuro(spotEur)} {currencySymbol}/oz
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.spotInfoLabel}>Produit sélectionné</Text>
                      <Text style={[styles.spotInfoValue, { marginTop: 2 }]}>
                        {product.label} · {formatG(effectiveWeightG)}
                      </Text>
                    </View>
                    <View style={styles.spotInfoRow}>
                      <Text style={styles.spotInfoLabel}>Valeur unitaire estimée</Text>
                      <Text style={[styles.spotInfoValue, { color: OrTrackColors.gold }]}>
                        {formatEuro((effectiveWeightG / OZ_TO_G) * spotEur)} {currencySymbol}
                      </Text>
                    </View>

                  </View>
                </View>
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
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.input}
                          keyboardType="decimal-pad"
                          placeholder="Quantité"
                          placeholderTextColor={OrTrackColors.tabIconDefault}
                          value={quantity}
                          onChangeText={setQuantity}
                        />
                        <Text style={styles.inputSuffix}>pièce(s)</Text>
                      </View>
                    </View>

                    <View style={styles.field}>
                      <View style={styles.fieldLabelRow}>
                        <Text style={[styles.fieldLabel, highlightedField === 'price' && { color: OrTrackColors.gold }]}>Prix d’achat unitaire</Text>
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
                              setIsPriceFocused(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.quickFillBtn}>Cours spot</Text>
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
                          onFocus={() => setIsPriceFocused(true)}
                          onBlur={() => {
                            let n = priceLocalRef.current;
                            n = n.replace(/[\s\u00A0]/g, '');
                            n = n.replace(/,/g, '.');
                            n = n.replace(/[^0-9.]/g, '');
                            const dot = n.indexOf('.');
                            if (dot !== -1) { n = n.slice(0, dot + 1) + n.slice(dot + 1).replace(/\./g, ''); }
                            const parts = n.split('.');
                            if (parts.length === 2 && parts[1].length > 2) { n = parts[0] + '.' + parts[1].slice(0, 2); }
                            if (n !== purchasePrice) setPurchasePrice(n);
                            const num = parseFloat(n);
                            const formatted = !isNaN(num) && num > 0 ? formatEuro(num) : n.replace(/\./g, ',');
                            setPriceDisplay(formatted);
                            setPriceKey(k => k + 1);
                            setIsPriceFocused(false);
                          }}
                          onChangeText={(text) => {
                            priceLocalRef.current = text;
                          }}
                        />
                        <Text style={styles.inputSuffix}>{currencySymbol}</Text>
                      </View>
                      {priceAnalysis.showPriceReference && (
                        <Text style={styles.priceRef}>
                          Cours actuel : {estimatedValue!.toFixed(2)} €
                        </Text>
                      )}
                    </View>

                    <View style={styles.field}>
                      <View style={styles.fieldLabelRow}>
                        <Text style={[styles.fieldLabel, highlightedField === 'date' && { color: OrTrackColors.gold }]}>Date d’achat</Text>
                        <View style={styles.dateShortcuts}>
                          <TouchableOpacity
                            onPress={() => {
                              const yesterday = new Date();
                              yesterday.setDate(yesterday.getDate() - 1);
                              setPurchaseDate(formatDateDMY(yesterday));
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.quickFillBtn}>Hier</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setPurchaseDate(formatDateDMY(new Date()))}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.quickFillBtn}>Aujourd’hui</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        placeholder="JJ/MM/AAAA"
                        placeholderTextColor={OrTrackColors.tabIconDefault}
                        value={purchaseDate}
                        onChangeText={(t) => setPurchaseDate(autoFormatDate(t))}
                        maxLength={10}
                      />
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Note (optionnel)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Ajoutez un contexte si utile"
                        multiline={false}
                        placeholderTextColor={OrTrackColors.tabIconDefault}
                        value={note}
                        onChangeText={setNote}
                        maxLength={120}
                      />
                    </View>

                  </View>
                </View>
              )}

              {/* Estimation temps réel */}
              {isStep2Active && currentValue !== null && (
                <View style={styles.estimationCard}>
                  <Text style={styles.estimationTitle}>Estimation actuelle</Text>

                  <View style={styles.estimationRow}>
                    <Text style={styles.estimationLabel}>Valeur de marché</Text>
                    <Text style={styles.estimationValue}>{formatEuro(currentValue)} €</Text>
                  </View>

                  {gainLoss !== null && (() => {
                    const rounded = Math.round(gainLoss * 100) / 100;
                    const display = rounded === 0 ? 0 : rounded;
                    return (
                      <View style={styles.estimationRow}>
                        <Text style={styles.estimationLabel}>Plus/moins-value</Text>
                        <Text style={[
                          styles.estimationGainLoss,
                          display === 0
                            ? { color: OrTrackColors.subtext }
                            : display > 0 ? styles.positive : styles.negative,
                        ]}>
                          {display === 0
                            ? '0,00 €'
                            : `${display > 0 ? '+' : ''}${formatEuro(display)} €`}
                        </Text>
                      </View>
                    );
                  })()}

                  {spotEur !== null && (
                    <>
                      <Text style={styles.estimationHint}>
                        Cours spot : {formatEuro(spotEur)} {'\u20AC'}/oz {'\u00B7'} {formatG(effectiveWeightG)} par unité
                      </Text>
                      <Text style={styles.estimationDisclaimer}>
                        Estimation basée sur le cours spot {'\u00B7'} Hors prime revendeur
                      </Text>
                    </>
                  )}
                </View>
              )}

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

  // Metal pills
  metalPill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  metalPillText: {
    fontSize: 14,
  },

  // Spot inline
  spotInline: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    marginTop: 6,
    marginBottom: 4,
  },

  // Popular section header (correction 5)
  popularSectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: OrTrackColors.subtext,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },

  // Search input (correction 9)
  searchInput: {
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    borderRadius: 8,
    color: OrTrackColors.white,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  noResultText: {
    color: OrTrackColors.subtext,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Check badge
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: OrTrackColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Expand buttons
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 8,
  },
  expandButtonText: {
    fontSize: 13,
    color: OrTrackColors.gold,
    fontWeight: '600',
    flex: 1,
  },

  // Product chips (grid)
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  productChip: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
    width: CHIP_WIDTH,
    minHeight: 72,
    overflow: 'hidden',
  },
  productChipActive: {
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
    backgroundColor: '#C9A84C14',
  },
  productChipLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: OrTrackColors.white,
    textAlign: 'center',
  },
  productChipLabelActive: {
    color: OrTrackColors.gold,
    fontWeight: '700',
  },
  productChipWeight: {
    fontSize: 10,
    color: OrTrackColors.label,
    marginTop: 2,
  },
  productChipWeightActive: {
    color: 'rgba(201,168,76,0.5)',
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: OrTrackColors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  popularBadge: {
    backgroundColor: 'rgba(201, 168, 76, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  popularBadgeText: {
    fontSize: 9,
    color: OrTrackColors.gold,
    fontWeight: '600',
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

  // Lingots separator (correction 4)
  lingotsSeparator: {
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
    marginTop: 12,
    marginBottom: 12,
  },

  // Compact cards (correction 5)
  productChipCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 60,
  },
  productChipLabelCompact: {
    fontSize: 10,
  },
  popularBadgeCompact: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    marginBottom: 2,
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

  // Separator
  separator: {
    height: 1,
    backgroundColor: OrTrackColors.border,
    marginBottom: 8,
  },

  // Inputs
  fieldGroup: { gap: 14 },
  field: { gap: 6 },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateShortcuts: {
    flexDirection: 'row',
    gap: 12,
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

  // Spot info card
  spotInfoCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)',
    padding: 14,
    marginBottom: 24,
    gap: 8,
  },
  spotInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spotInfoLabel: {
    fontSize: 12,
    color: OrTrackColors.subtext,
  },
  spotInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.white,
  },

  // Estimation card
  estimationCard: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9A84C40',
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  estimationTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  estimationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  estimationLabel: {
    fontSize: 13,
    color: OrTrackColors.subtext,
  },
  estimationValue: {
    fontSize: 20,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  estimationGainLoss: {
    fontSize: 15,
    fontWeight: '700',
  },
  positive: { color: '#4CAF50' },
  negative: { color: '#E07070' },
  estimationHint: {
    fontSize: 11,
    color: OrTrackColors.tabIconDefault,
    marginTop: 2,
  },
  estimationDisclaimer: {
    fontSize: 10,
    color: OrTrackColors.textDim,
    marginTop: 4,
    fontStyle: 'italic',
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
