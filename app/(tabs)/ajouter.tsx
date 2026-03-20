import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
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

import { type MetalType, METAL_CONFIG, getSpot } from '@/constants/metals';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── LayoutAnimation Android ──────────────────────────────────────────────────

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type Position = {
  id: string;
  metal: MetalType;
  product: string;
  weightG: number;      // grammes par unité
  quantity: number;
  purchasePrice: number; // € par unité
  purchaseDate: string;  // JJ/MM/AAAA
  createdAt: string;     // ISO
  note?: string;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

export const STORAGE_KEY = '@ortrack:positions';
const OZ_TO_G = 31.10435;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CHIP_WIDTH = (SCREEN_WIDTH - 40 - 8) / 2;
// 40 = padding total (20 gauche + 20 droite)
// 8 = gap entre les 2 colonnes

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
    { label: 'Maple Leaf Argent 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Philharmonique Argent 1oz', weightG: 31.10, category: 'piece' },
    { label: 'American Eagle 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Britannia Argent 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Panda Argent 30g', weightG: 30, category: 'piece' },
    { label: 'Kangourou Argent 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Krugerrand Argent 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Lingot Argent 100g', weightG: 100, category: 'lingot' },
    { label: 'Lingot Argent 1kg', weightG: 1000, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  platine: [
    { label: 'Platine 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Lingot Platine 100g', weightG: 100, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  palladium: [
    { label: 'Palladium 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  cuivre: [
    { label: 'Lingot Cuivre 1kg', weightG: 1000, category: 'lingot' },
    { label: 'Lingot Cuivre 5kg', weightG: 5000, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
};

const metalEntries = Object.entries(METAL_CONFIG) as [MetalType, typeof METAL_CONFIG[MetalType]][];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtG(g: number): string {
  if (g >= 1000) return `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} kg`;
  return `${g % 1 === 0 ? g : g.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
}

function toNum(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0;
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

// ─── Composant ────────────────────────────────────────────────────────────────

export default function AjouterScreen() {
  const { prices, currencySymbol, refresh } = useSpotPrices();
  const { canAddPosition, showPaywall } = usePremium();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
        const list: Position[] = raw ? JSON.parse(raw) : [];
        if (!canAddPosition(list.length)) {
          showPaywall();
        }
      });
    }, [canAddPosition, showPaywall])
  );

  const scrollRef = useRef<ScrollView>(null);
  const formYRef = useRef<number>(0);
  const spotInfoCardYRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [metal, setMetal] = useState<MetalType>('or');
  const [product, setProduct] = useState<Product | null>(null);
  const [customWeight, setCustomWeight] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [note, setNote] = useState('');
  const [showAllPieces, setShowAllPieces] = useState(false);
  const [showAllBars, setShowAllBars] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const dateRef = useRef(purchaseDate);
  dateRef.current = purchaseDate;

  const ctaOpacity = useRef(new Animated.Value(0.4)).current;

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // CTA opacity animation
  useEffect(() => {
    Animated.timing(ctaOpacity, {
      toValue: product ? 1 : 0.4,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [product, ctaOpacity]);

  // ── Métal → reset produit ──────────────────────────────────────────────────

  const handleMetalChange = useCallback((m: MetalType) => {
    setMetal(m);
    setProduct(null);
    setCustomWeight('');
    setPurchasePrice('');
    setShowAllPieces(false);
    setShowAllBars(false);
  }, []);

  // ── Calculs temps réel ────────────────────────────────────────────────────

  const effectiveWeightG = product?.weightG ?? toNum(customWeight);
  const qty = toNum(quantity);
  const price = toNum(purchasePrice);
  const spotEur = getSpot(metal, prices);

  const popularProducts = useMemo(() =>
    PRODUCTS[metal].filter(p => p.popular),
    [metal]
  );

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

  // ── Toggles ──────────────────────────────────────────────────────────────

  const toggleShowAllPieces = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllPieces(prev => !prev);
  }, []);

  const toggleShowAllBars = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllBars(prev => !prev);
  }, []);

  // ── Sélection produit ──────────────────────────────────────────────────

  const handleProductSelect = useCallback((p: Product) => {
    // Animation d'apparition du formulaire
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    // B1. Sélection
    setProduct(p);
    setCustomWeight('');

    // B2. Pré-remplir le prix
    const w = p.weightG ?? 0;
    const spot = getSpot(metal, prices);
    if (spot !== null && w > 0) {
      const unitVal = (w / OZ_TO_G) * spot;
      if (unitVal > 0 && !isNaN(unitVal)) {
        setPurchasePrice(unitVal.toFixed(2));
      } else {
        setPurchasePrice('');
      }
    } else {
      setPurchasePrice('');
    }

    // B3. Pré-remplir la date
    if (!dateRef.current) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      setPurchaseDate(`${dd}/${mm}/${yyyy}`);
    }

    // B4. Cancel double-tap
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    // B5. Collapse + scroll
    if (showAllPieces || showAllBars) {
      scrollTimeoutRef.current = setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowAllPieces(false);
        setShowAllBars(false);
        scrollTimeoutRef.current = setTimeout(() => {
          if (spotInfoCardYRef.current > 0) {
            scrollRef.current?.scrollTo({
              y: spotInfoCardYRef.current - 20,
              animated: true,
            });
          }
        }, 400);
      }, 300);
    } else {
      scrollTimeoutRef.current = setTimeout(() => {
        if (spotInfoCardYRef.current > 0) {
          scrollRef.current?.scrollTo({
            y: spotInfoCardYRef.current - 20,
            animated: true,
          });
        }
      }, 150);
    }
  }, [showAllPieces, showAllBars, metal, prices]);

  // ── Validation ────────────────────────────────────────────────────────────

  const canSave = useMemo(() =>
    product !== null &&
    qty > 0 &&
    price > 0 &&
    purchaseDate.length === 10 &&
    effectiveWeightG > 0,
    [product, qty, price, purchaseDate, effectiveWeightG]
  );

  // ── Sauvegarde ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const positions: Position[] = raw ? JSON.parse(raw) : [];

      if (!canAddPosition(positions.length)) {
        showPaywall();
        return;
      }

      positions.push({
        id: Date.now().toString(),
        metal,
        product: product!.label,
        weightG: effectiveWeightG,
        quantity: qty,
        purchasePrice: price,
        purchaseDate: purchaseDate.trim(),
        createdAt: new Date().toISOString(),
        note: note.trim() || undefined,
      });

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(positions));

      setCustomWeight('');
      setQuantity('');
      setPurchasePrice('');
      setPurchaseDate('');
      setNote('');
      setShowAllPieces(false);

      setConfirmed(true);
      setTimeout(() => {
        setConfirmed(false);
        router.navigate('/(tabs)/portefeuille');
      }, 1400);
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder la position.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render chip helper (grille dépliée) ────────────────────────────────

  const renderChip = (p: Product) => {
    const active = product?.label === p.label;
    return (
      <TouchableOpacity
        key={p.label}
        onPress={() => handleProductSelect(p)}
        activeOpacity={0.75}
        style={[
          styles.productChip,
          active && styles.productChipActive,
        ]}>
        {active && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={14} color={OrTrackColors.white} />
          </View>
        )}
        {p.popular && !active && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>
              ⭐ Populaire
            </Text>
          </View>
        )}
        <Text style={[
          styles.productChipLabel,
          active && styles.productChipLabelActive,
        ]}>
          {p.label}
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

  // ── Indicateurs pour boutons expand ──────────────────────────────────────

  const selectedNonPopularPiece = PRODUCTS[metal].some(
    p => p.category === 'piece' && !p.popular && p.label === product?.label
  );
  const selectedInLingots = PRODUCTS[metal].some(
    p => (p.category === 'lingot' || p.category === 'autre') && p.label === product?.label
  );

  // ─────────────────────────────────────────────────────────────────────────

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

          {/* En-tête */}
          <Text style={styles.headerTitle}>Nouvelle position</Text>

          {/* ── Sélection métal ─────────────────────────────────────────── */}
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
          </View>

          {/* ── Sélection produit ───────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Produit</Text>

            {popularProducts.length >= 2 ? (
              <>
                {/* Chips populaires horizontales */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -20 }}
                  contentContainerStyle={{
                    paddingLeft: 20,
                    paddingRight: 40,
                    gap: 8,
                  }}>
                  {popularProducts.map(p => {
                    const active = product?.label === p.label;
                    return (
                      <TouchableOpacity
                        key={p.label}
                        onPress={() => handleProductSelect(p)}
                        activeOpacity={0.75}
                        accessibilityLabel={`Sélectionner ${p.label}`}
                        style={[
                          styles.popularChip,
                          active && styles.popularChipActive,
                        ]}>
                        <Text style={[
                          styles.popularChipLabel,
                          active && { color: OrTrackColors.gold },
                        ]}>
                          {p.label}
                        </Text>
                        {p.weightG !== null && (
                          <Text style={styles.popularChipWeight}>
                            {fmtG(p.weightG)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Voir toutes les pièces */}
                {PRODUCTS[metal].some(p => p.category === 'piece') && (
                  <>
                    <TouchableOpacity
                      onPress={toggleShowAllPieces}
                      activeOpacity={0.7}
                      style={styles.expandButton}>
                      <Text style={styles.expandButtonText}>
                        Voir toutes les pièces
                        {!showAllPieces && selectedNonPopularPiece
                          ? ` · ${product?.label} ✓`
                          : ''}
                      </Text>
                      <Ionicons
                        name={showAllPieces ? 'chevron-down' : 'chevron-forward'}
                        size={14}
                        color={OrTrackColors.gold}
                      />
                    </TouchableOpacity>
                    {showAllPieces && (
                      <View style={styles.productGrid}>
                        {PRODUCTS[metal]
                          .filter(p => p.category === 'piece')
                          .map(p => renderChip(p))}
                      </View>
                    )}
                  </>
                )}

                {/* Voir tous les lingots */}
                {PRODUCTS[metal].some(p => p.category === 'lingot' || p.category === 'autre') && (
                  <>
                    <TouchableOpacity
                      onPress={toggleShowAllBars}
                      activeOpacity={0.7}
                      style={styles.expandButton}>
                      <Text style={styles.expandButtonText}>
                        Voir tous les lingots
                        {!showAllBars && selectedInLingots
                          ? ` · ${product?.label} ✓`
                          : ''}
                      </Text>
                      <Ionicons
                        name={showAllBars ? 'chevron-down' : 'chevron-forward'}
                        size={14}
                        color={OrTrackColors.gold}
                      />
                    </TouchableOpacity>
                    {showAllBars && (
                      <View style={styles.productGrid}>
                        {PRODUCTS[metal]
                          .filter(p => p.category === 'lingot' || p.category === 'autre')
                          .map(p => renderChip(p))}
                      </View>
                    )}
                  </>
                )}
              </>
            ) : (
              /* Fallback : grille actuelle */
              <>
                {PRODUCTS[metal].some(p => p.category === 'piece') && (
                  <>
                    <View style={styles.categoryHeader}>
                      <Text style={[styles.categoryLabel, { marginBottom: 0 }]}>
                        Pièces
                      </Text>
                      {PRODUCTS[metal].filter(p => p.category === 'piece').length > 4 && (
                        <TouchableOpacity
                          onPress={toggleShowAllPieces}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.categoryToggle}>
                            {showAllPieces ? 'Voir moins' : 'Voir tout'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.productGrid}>
                      {PRODUCTS[metal]
                        .filter(p => p.category === 'piece')
                        .filter((p, i) => showAllPieces || p.popular || i < 4 || p.label === product?.label)
                        .map(p => renderChip(p))}
                    </View>
                  </>
                )}

                {PRODUCTS[metal].some(p => p.category === 'lingot') && (
                  <>
                    <Text style={[styles.categoryLabel, { marginTop: 12 }]}>
                      Lingots
                    </Text>
                    <View style={styles.productGrid}>
                      {PRODUCTS[metal]
                        .filter(p => p.category === 'lingot')
                        .map(p => renderChip(p))}
                    </View>
                  </>
                )}

                {PRODUCTS[metal].some(p => p.category === 'autre') && (
                  <View style={{ marginTop: 8 }}>
                    {PRODUCTS[metal]
                      .filter(p => p.category === 'autre')
                      .map(p => renderChip(p))}
                  </View>
                )}
              </>
            )}
          </View>

          {/* ── Texte incitatif (aucun produit sélectionné) ────────── */}
          {product === null && (
            <Text style={styles.hintText}>Touchez une pièce pour commencer</Text>
          )}

          {/* ── Contenu conditionnel (produit sélectionné) ────────── */}
          {product !== null && (
            <>
              {/* ── Poids personnalisé (Autre) ──────────────────────── */}
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

              {/* ── Cours actuel du produit ──────────────────────── */}
              {spotEur !== null && effectiveWeightG > 0 && (
                <View
                  collapsable={false}
                  onLayout={(e) => { spotInfoCardYRef.current = e.nativeEvent.layout.y; }}>
                  <View style={styles.separator} />
                  <View style={styles.spotInfoCard}>
                    <View style={styles.spotInfoRow}>
                      <Text style={styles.spotInfoLabel}>Cours actuel</Text>
                      <Text style={styles.spotInfoValue}>
                        {fmtEur(spotEur)} {currencySymbol}/oz
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.spotInfoLabel}>Produit sélectionné</Text>
                      <Text style={[styles.spotInfoValue, { marginTop: 2 }]}>
                        {product.label} · {fmtG(effectiveWeightG)}
                      </Text>
                    </View>
                    <View style={styles.spotInfoRow}>
                      <Text style={styles.spotInfoLabel}>Valeur unitaire estimée</Text>
                      <Text style={[styles.spotInfoValue, { color: OrTrackColors.gold }]}>
                        {fmtEur((effectiveWeightG / OZ_TO_G) * spotEur)} {currencySymbol}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* ── Formulaire ──────────────────────────────────────── */}
              <View
                style={styles.section}
                onLayout={(e) => { formYRef.current = e.nativeEvent.layout.y; }}
              >
                <Text style={styles.sectionTitle}>Détails de l'achat</Text>
                <View style={styles.fieldGroup}>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Quantité</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor={OrTrackColors.tabIconDefault}
                        value={quantity}
                        onChangeText={setQuantity}
                      />
                      <Text style={styles.inputSuffix}>pièce(s)</Text>
                    </View>
                  </View>

                  <View style={styles.field}>
                    <View style={styles.fieldLabelRow}>
                      <Text style={styles.fieldLabel}>Prix d'achat unitaire</Text>
                      {!priceAnalysis.priceMatchesSpot && estimatedValue !== null && estimatedValue > 0 ? (
                        <TouchableOpacity
                          onPress={() => setPurchasePrice(estimatedValue!.toFixed(2))}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.quickFillBtn, { fontSize: 13 }]}>Utiliser le cours actuel</Text>
                        </TouchableOpacity>
                      ) : estimatedValue === null || estimatedValue <= 0 ? (
                        <Text style={styles.priceRefUnavailable}>Cours indisponible</Text>
                      ) : null}
                    </View>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        keyboardType="decimal-pad"
                        placeholder="Ex : 1 700"
                        placeholderTextColor={OrTrackColors.tabIconDefault}
                        value={purchasePrice}
                        onChangeText={setPurchasePrice}
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
                      <Text style={styles.fieldLabel}>Date d'achat</Text>
                      <TouchableOpacity
                        onPress={() => {
                          const now = new Date();
                          const dd = String(now.getDate()).padStart(2, '0');
                          const mm = String(now.getMonth() + 1).padStart(2, '0');
                          const yyyy = now.getFullYear();
                          setPurchaseDate(`${dd}/${mm}/${yyyy}`);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickFillBtn}>Aujourd'hui</Text>
                      </TouchableOpacity>
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
                      placeholder="Ex : héritage, cadeau, enchères..."
                      multiline={false}
                      placeholderTextColor={OrTrackColors.tabIconDefault}
                      value={note}
                      onChangeText={setNote}
                      maxLength={120}
                    />
                  </View>

                </View>
              </View>

              {/* ── Estimation temps réel ───────────────────────────── */}
              {currentValue !== null && (
                <View style={styles.estimationCard}>
                  <Text style={styles.estimationTitle}>Estimation actuelle</Text>

                  <View style={styles.estimationRow}>
                    <Text style={styles.estimationLabel}>Valeur de marché</Text>
                    <Text style={styles.estimationValue}>{fmtEur(currentValue)} €</Text>
                  </View>

                  {gainLoss !== null && (
                    <View style={styles.estimationRow}>
                      <Text style={styles.estimationLabel}>Plus/moins-value</Text>
                      <Text style={[
                        styles.estimationGainLoss,
                        gainLoss >= 0 ? styles.positive : styles.negative,
                      ]}>
                        {gainLoss >= 0 ? '+' : ''}{fmtEur(gainLoss)} €
                      </Text>
                    </View>
                  )}

                  {spotEur !== null && (
                    <Text style={styles.estimationHint}>
                      Cours spot : {fmtEur(spotEur)} €/oz · {effectiveWeightG}g par unité
                    </Text>
                  )}
                </View>
              )}

              {/* Spacer pour ne pas masquer le contenu sous le CTA sticky */}
              <View style={{ height: 80 }} />
            </>
          )}

        </ScrollView>

        {/* ── CTA sticky ──────────────────────────────────────────────── */}
        <View style={styles.stickyCtaContainer}>
          <Animated.View style={{ opacity: ctaOpacity }}>
            <Pressable
              style={({ pressed }) => [
                styles.ctaButton,
                pressed && !!product && styles.ctaButtonPressed,
                confirmed && styles.ctaButtonConfirmed,
              ]}
              onPress={handleSave}
              disabled={!product || saving || confirmed}
              accessibilityLabel="Ajouter au portefeuille"
            >
              <Text style={styles.ctaText}>
                {confirmed
                  ? '✓  Position ajoutée !'
                  : saving
                  ? 'Enregistrement…'
                  : 'Ajouter au portefeuille'}
              </Text>
            </Pressable>
          </Animated.View>
          <Text style={styles.ctaReassurance}>Supprimable depuis votre portfolio</Text>
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
    marginBottom: 20,
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

  // Popular chips (horizontal)
  popularChip: {
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
    minWidth: 120,
  },
  popularChipActive: {
    borderWidth: 2,
    borderColor: OrTrackColors.gold,
    backgroundColor: 'rgba(201,168,76,0.15)',
  },
  popularChipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  popularChipWeight: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 2,
  },

  // Check badge (sélection)
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
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
  },
  productChip: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
    width: CHIP_WIDTH,
    minHeight: 72,
  },
  productChipActive: {
    borderColor: OrTrackColors.gold,
    backgroundColor: '#1F1B0A',
  },
  productChipLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: OrTrackColors.white,
  },
  productChipLabelActive: {
    color: OrTrackColors.gold,
    fontWeight: '700',
  },
  productChipWeight: {
    fontSize: 10,
    color: OrTrackColors.tabIconDefault,
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
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryToggle: {
    fontSize: 12,
    color: OrTrackColors.gold,
    fontWeight: '600',
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

  // Hint text (no product selected)
  hintText: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    textAlign: 'center',
    marginTop: 24,
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
  quickFillBtn: {
    fontSize: 12,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 13,
    color: OrTrackColors.subtext,
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
    borderColor: 'rgba(201,168,76,0.2)',
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
    fontSize: 16,
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
    backgroundColor: OrTrackColors.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonPressed: {
    backgroundColor: '#B8982F',
  },
  ctaButtonConfirmed: {
    backgroundColor: '#2E7D32',
  },
  ctaText: {
    color: OrTrackColors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  ctaReassurance: {
    color: OrTrackColors.subtext,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
