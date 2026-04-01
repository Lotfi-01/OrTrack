import { router } from 'expo-router';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { OZ_TO_G } from '@/constants/metals';
import { OrTrackColors } from '@/constants/theme';
import { formatEuro } from '@/utils/format';
import { useSpotPrices } from '@/hooks/use-spot-prices';

type MetalKey = 'gold' | 'silver' | 'platinum' | 'palladium' | 'copper';
type Mode = 'weightToEur' | 'eurToWeight';
type Unit = 'g' | 'oz' | 'kg';

const METALS: { key: MetalKey; label: string; symbol: string; color: string }[] = [
  { key: 'gold', label: 'Or', symbol: 'XAU', color: '#C9A84C' },
  { key: 'silver', label: 'Argent', symbol: 'XAG', color: '#A8A8B8' },
  { key: 'platinum', label: 'Platine', symbol: 'XPT', color: '#E0E0E0' },
  { key: 'palladium', label: 'Palladium', symbol: 'XPD', color: '#CBA135' },
  { key: 'copper', label: 'Cuivre', symbol: 'XCU', color: '#B87333' },
];

const PRESETS: { label: string; value: string; unit: Unit }[] = [
  { label: '1 g', value: '1', unit: 'g' },
  { label: '10 g', value: '10', unit: 'g' },
  { label: '1 oz', value: '1', unit: 'oz' },
  { label: '100 g', value: '100', unit: 'g' },
];

function toNum(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0;
}

const DisclaimerFooter = () => (
  <Text style={styles.disclaimer}>
    Données à titre indicatif. Pas un conseil d'investissement.
  </Text>
);

export function MetalConverter() {
  const { prices } = useSpotPrices();
  const [selectedMetal, setSelectedMetal] = useState<MetalKey>('gold');
  const [mode, setMode] = useState<Mode>('weightToEur');
  const [inputValue, setInputValue] = useState('1');
  const [unit, setUnit] = useState<Unit>('g');

  const spotEur: number | null = prices[selectedMetal] ?? null;
  const num = toNum(inputValue);

  const switchMode = (m: Mode) => {
    setMode(m);
    setInputValue('1');
  };

  const switchMetal = (k: MetalKey) => {
    setSelectedMetal(k);
    setInputValue('');
  };

  // ── Weight → EUR ──────────────────────────────────────────────────────────
  const renderWeightToEur = () => {
    const oz = unit === 'g' ? num / OZ_TO_G : unit === 'kg' ? (num * 1000) / OZ_TO_G : num;
    const eurValue = spotEur !== null ? oz * spotEur : null;
    const inOz = oz;
    const inG = oz * OZ_TO_G;
    const inKg = inG / 1000;

    return (
      <>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="Quantité"
            placeholderTextColor={OrTrackColors.tabIconDefault}
            value={inputValue}
            onChangeText={setInputValue}
          />
          <View style={styles.unitRow}>
            {(['g', 'oz', 'kg'] as Unit[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                onPress={() => setUnit(u)}>
                <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Presets */}
        <View style={styles.presetRow}>
          {PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.label}
              onPress={() => {
                setInputValue(preset.value);
                setUnit(preset.unit);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Preset ${preset.label}`}
              style={styles.presetChip}
            >
              <Text style={styles.presetText}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {spotEur === null ? (
          <Text style={styles.unavailable}>Prix indisponible</Text>
        ) : num > 0 && eurValue !== null ? (
          <View style={styles.resultBlock}>
            <Text style={styles.resultMain}>{formatEuro(eurValue)} €</Text>
            <Text style={styles.resultEquiv}>
              = {inOz.toFixed(4).replace('.', ',')} oz · {inG.toFixed(2).replace('.', ',')} g · {inKg.toFixed(6).replace('.', ',')} kg
            </Text>
          </View>
        ) : null}

        {num > 0 && eurValue !== null && (
          <Text style={styles.spotDisclaimer}>
            Estimation au cours spot, hors prime et fiscalité.
          </Text>
        )}

        {/* CTA — visible when result is positive */}
        {eurValue !== null && eurValue > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/ajouter')}
            accessibilityRole="button"
            accessibilityLabel="Ajouter au portefeuille"
            style={styles.converterCta}
          >
            <Text style={styles.converterCtaText}>Ajouter au portefeuille</Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  // ── EUR → Weight ──────────────────────────────────────────────────────────
  const renderEurToWeight = () => {
    const oz = spotEur !== null && spotEur > 0 ? num / spotEur : null;
    const inG = oz !== null ? oz * OZ_TO_G : null;
    const inKg = inG !== null ? inG / 1000 : null;

    return (
      <>
        <TextInput
          style={[styles.input, { marginBottom: 16 }]}
          keyboardType="decimal-pad"
          placeholder="Montant en €"
          placeholderTextColor={OrTrackColors.tabIconDefault}
          value={inputValue}
          onChangeText={setInputValue}
        />

        {spotEur === null ? (
          <Text style={styles.unavailable}>Prix indisponible</Text>
        ) : num > 0 && oz !== null && inG !== null && inKg !== null ? (
          <View style={styles.resultBlock}>
            <Text style={styles.resultMain}>{oz.toFixed(4).replace('.', ',')} oz</Text>
            <Text style={styles.resultLine}>{inG.toFixed(2).replace('.', ',')} g</Text>
            <Text style={styles.resultLine}>{inKg.toFixed(6).replace('.', ',')} kg</Text>
          </View>
        ) : null}

        {num > 0 && oz !== null && (
          <Text style={styles.spotDisclaimer}>
            Estimation au cours spot, hors prime et fiscalité.
          </Text>
        )}

        {oz !== null && oz > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/ajouter')}
            accessibilityRole="button"
            accessibilityLabel="Ajouter au portefeuille"
            style={styles.converterCta}
          >
            <Text style={styles.converterCtaText}>Ajouter au portefeuille</Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  return (
    <View>
      <View style={styles.card}>
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'weightToEur' && styles.modeBtnActive]}
            onPress={() => switchMode('weightToEur')}>
            <Text style={[styles.modeText, mode === 'weightToEur' && styles.modeTextActive]}>
              Poids → €
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'eurToWeight' && styles.modeBtnActive]}
            onPress={() => switchMode('eurToWeight')}>
            <Text style={[styles.modeText, mode === 'eurToWeight' && styles.modeTextActive]}>
              € → Poids
            </Text>
          </TouchableOpacity>
        </View>

        {/* Metal selector */}
        <View style={styles.metalWrap}>
          {METALS.map((m) => {
            const active = selectedMetal === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[
                  styles.metalBtn,
                  active
                    ? { backgroundColor: m.color }
                    : { backgroundColor: OrTrackColors.card, borderColor: OrTrackColors.border, borderWidth: 1 },
                ]}
                onPress={() => switchMetal(m.key)}>
                <Text
                  style={[
                    styles.metalText,
                    active ? { color: OrTrackColors.background } : { color: OrTrackColors.subtext },
                  ]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content */}
        {mode === 'weightToEur' ? renderWeightToEur() : renderEurToWeight()}

        {/* Copper note */}
        {selectedMetal === 'copper' && (
          <Text style={styles.copperNote}>
            Le cuivre est coté à ~0,35 €/oz, son prix unitaire est naturellement bas.
          </Text>
        )}
      </View>

      <DisclaimerFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
  },
  modeBtnActive: {
    borderColor: OrTrackColors.gold,
    backgroundColor: 'rgba(201, 168, 76, 0.15)',
  },
  modeText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.subtext,
  },
  modeTextActive: {
    color: OrTrackColors.gold,
  },
  metalWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  metalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  metalText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    gap: 10,
    marginBottom: 16,
  },
  input: {
    backgroundColor: OrTrackColors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: OrTrackColors.white,
  },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
  },
  unitBtnActive: {
    borderColor: OrTrackColors.gold,
    backgroundColor: 'rgba(201, 168, 76, 0.15)',
  },
  unitText: {
    fontSize: 13,
    fontWeight: '600',
    color: OrTrackColors.subtext,
  },
  unitTextActive: {
    color: OrTrackColors.gold,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    backgroundColor: OrTrackColors.card,
  },
  presetText: {
    color: OrTrackColors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  unavailable: {
    fontSize: 14,
    color: OrTrackColors.subtext,
    textAlign: 'center',
    marginTop: 8,
  },
  resultBlock: {
    alignItems: 'center',
    marginTop: 4,
  },
  resultMain: {
    fontSize: 32,
    fontWeight: '700',
    color: OrTrackColors.white,
    marginBottom: 6,
  },
  resultEquiv: {
    fontSize: 13,
    color: OrTrackColors.subtext,
  },
  resultLine: {
    fontSize: 16,
    fontWeight: '600',
    color: OrTrackColors.subtext,
    marginTop: 2,
  },
  spotDisclaimer: {
    color: OrTrackColors.subtext,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  converterCta: {
    paddingVertical: 14,
    marginTop: 16,
    alignItems: 'center',
  },
  converterCtaText: {
    color: OrTrackColors.gold,
    fontSize: 14,
    fontWeight: '500',
  },
  copperNote: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  disclaimer: {
    color: OrTrackColors.subtext,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
});
