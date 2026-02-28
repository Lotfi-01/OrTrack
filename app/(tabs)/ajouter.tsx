import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

// ─── Types ────────────────────────────────────────────────────────────────────

type MetalType = 'or' | 'argent';

export type Position = {
  id: string;
  metal: MetalType;
  product: string;
  weightG: number;      // grammes par unité
  quantity: number;
  purchasePrice: number; // € par unité
  purchaseDate: string;  // JJ/MM/AAAA
  createdAt: string;     // ISO
};

// ─── Constantes ───────────────────────────────────────────────────────────────

export const STORAGE_KEY = '@ortrack:positions';
const OZ_TO_G = 31.10435;

type Product = { label: string; weightG: number | null };

const PRODUCTS: Record<MetalType, Product[]> = {
  or: [
    { label: 'Napoléon 20F', weightG: 5.81 },
    { label: 'Souverain', weightG: 7.32 },
    { label: 'Krugerrand 1oz', weightG: 31.10 },
    { label: 'Maple Leaf 1oz', weightG: 31.10 },
    { label: 'Philharmonique 1oz', weightG: 31.10 },
    { label: 'Lingot 10g', weightG: 10 },
    { label: 'Lingot 100g', weightG: 100 },
    { label: 'Lingot 1kg', weightG: 1000 },
    { label: 'Autre', weightG: null },
  ],
  argent: [
    { label: 'Maple Leaf Argent 1oz', weightG: 31.10 },
    { label: 'Philharmonique Argent 1oz', weightG: 31.10 },
    { label: 'Lingot Argent 100g', weightG: 100 },
    { label: 'Lingot Argent 1kg', weightG: 1000 },
    { label: 'Autre', weightG: null },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const { prices } = useSpotPrices();

  const [metal, setMetal] = useState<MetalType>('or');
  const [product, setProduct] = useState<Product>(PRODUCTS.or[0]);
  const [customWeight, setCustomWeight] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // ── Métal → reset produit ──────────────────────────────────────────────────

  const handleMetalChange = (m: MetalType) => {
    setMetal(m);
    setProduct(PRODUCTS[m][0]);
    setCustomWeight('');
  };

  // ── Calculs temps réel ────────────────────────────────────────────────────

  const effectiveWeightG = product.weightG ?? toNum(customWeight);
  const qty = toNum(quantity);
  const price = toNum(purchasePrice);
  const spotEur = metal === 'or' ? prices.gold : prices.silver;

  const currentValue =
    spotEur !== null && effectiveWeightG > 0 && qty > 0
      ? qty * (effectiveWeightG / OZ_TO_G) * spotEur
      : null;

  const gainLoss =
    currentValue !== null && price > 0
      ? currentValue - qty * price
      : null;

  // ── Validation ────────────────────────────────────────────────────────────

  const canSave =
    qty > 0 &&
    price > 0 &&
    purchaseDate.length === 10 &&
    effectiveWeightG > 0;

  // ── Sauvegarde ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const positions: Position[] = raw ? JSON.parse(raw) : [];

      positions.push({
        id: Date.now().toString(),
        metal,
        product: product.label,
        weightG: effectiveWeightG,
        quantity: qty,
        purchasePrice: price,
        purchaseDate: purchaseDate.trim(),
        createdAt: new Date().toISOString(),
      });

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(positions));

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

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* En-tête */}
          <View style={styles.header}>
            <Text style={styles.title}>Ajouter une position</Text>
            <Text style={styles.subtitle}>Enregistrez un achat de métal précieux</Text>
          </View>

          {/* ── Sélection métal ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Métal</Text>
            <View style={styles.metalRow}>
              {(['or', 'argent'] as MetalType[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => handleMetalChange(m)}
                  activeOpacity={0.75}
                  style={[styles.metalButton, metal === m && styles.metalButtonActive]}>
                  <Text style={[styles.metalSymbol, metal === m && styles.metalTextActive]}>
                    {m === 'or' ? 'XAU' : 'XAG'}
                  </Text>
                  <Text style={[styles.metalLabel, metal === m && styles.metalTextActive]}>
                    {m === 'or' ? 'Or' : 'Argent'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Sélection produit ───────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Produit</Text>
            <View style={styles.productGrid}>
              {PRODUCTS[metal].map((p) => {
                const active = product.label === p.label;
                return (
                  <TouchableOpacity
                    key={p.label}
                    onPress={() => { setProduct(p); setCustomWeight(''); }}
                    activeOpacity={0.75}
                    style={[styles.productChip, active && styles.productChipActive]}>
                    <Text style={[styles.productChipLabel, active && styles.productChipLabelActive]}>
                      {p.label}
                    </Text>
                    {p.weightG !== null && (
                      <Text style={[styles.productChipWeight, active && styles.productChipWeightActive]}>
                        {p.weightG >= 1000 ? `${p.weightG / 1000} kg` : `${p.weightG} g`}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Poids personnalisé (Autre) ──────────────────────────────── */}
          {product.weightG === null && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Poids unitaire</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  keyboardType="decimal-pad"
                  placeholder="Ex : 7,78"
                  placeholderTextColor={OrTrackColors.tabIconDefault}
                  value={customWeight}
                  onChangeText={setCustomWeight}
                />
                <View style={styles.inputUnit}>
                  <Text style={styles.inputUnitText}>g</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Formulaire ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Détails de l'achat</Text>
            <View style={styles.fieldGroup}>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Quantité</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor={OrTrackColors.tabIconDefault}
                    value={quantity}
                    onChangeText={setQuantity}
                  />
                  <View style={styles.inputUnit}>
                    <Text style={styles.inputUnitText}>pcs</Text>
                  </View>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Prix d'achat unitaire</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor={OrTrackColors.tabIconDefault}
                    value={purchasePrice}
                    onChangeText={setPurchasePrice}
                  />
                  <View style={styles.inputUnit}>
                    <Text style={styles.inputUnitText}>€</Text>
                  </View>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Date d'achat</Text>
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

            </View>
          </View>

          {/* ── Estimation temps réel ───────────────────────────────────── */}
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

          {/* ── Bouton submit ───────────────────────────────────────────── */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              !canSave && styles.submitButtonDisabled,
              confirmed && styles.submitButtonConfirmed,
            ]}
            onPress={handleSave}
            disabled={!canSave || saving || confirmed}
            activeOpacity={0.8}>
            <Text style={[styles.submitText, !canSave && styles.submitTextDisabled]}>
              {confirmed
                ? '✓  Position ajoutée !'
                : saving
                ? 'Enregistrement…'
                : 'Ajouter à mon portefeuille'}
            </Text>
          </TouchableOpacity>

        </ScrollView>
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
    paddingBottom: 48,
  },

  // Header
  header: { marginBottom: 28 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: OrTrackColors.white,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: OrTrackColors.subtext,
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

  // Metal toggle
  metalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: OrTrackColors.card,
    borderWidth: 1.5,
    borderColor: OrTrackColors.border,
  },
  metalButtonActive: {
    backgroundColor: OrTrackColors.gold,
    borderColor: OrTrackColors.gold,
  },
  metalSymbol: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: OrTrackColors.subtext,
    marginBottom: 4,
  },
  metalLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  metalTextActive: {
    color: OrTrackColors.background,
  },

  // Product chips
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  productChip: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
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
    color: '#8A6E30',
  },

  // Inputs
  fieldGroup: { gap: 14 },
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    fontWeight: '500',
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  input: {
    flex: 1,
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    fontSize: 16,
    color: OrTrackColors.white,
  },
  inputFlex: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  inputUnit: {
    backgroundColor: OrTrackColors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    borderLeftWidth: 0,
    justifyContent: 'center',
  },
  inputUnitText: {
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.subtext,
  },

  // Estimation card
  estimationCard: {
    backgroundColor: '#12122A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A2E0A',
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

  // Submit button
  submitButton: {
    backgroundColor: OrTrackColors.gold,
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  submitButtonConfirmed: {
    backgroundColor: '#2E7D32',
    borderWidth: 0,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: OrTrackColors.background,
  },
  submitTextDisabled: {
    color: OrTrackColors.tabIconDefault,
  },
});
