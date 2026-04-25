import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';
import type { MetalType } from '@/constants/metals';

// Display option for one metal pill. The parent prepares this shape from
// METAL_CONFIG so this component never reads the catalog directly.
export type MetalOption = {
  key: MetalType;
  label: string;
  accentColor: string;
};

export type MetalSelectorProps = {
  options: readonly MetalOption[];
  selected: MetalType;
  spotInlineLabel: string;
  onSelect: (metal: MetalType) => void;
};

export function MetalSelector({
  options,
  selected,
  spotInlineLabel,
  onSelect,
}: MetalSelectorProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Métal</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.metalPillsRow}>
        {options.map(({ key, label, accentColor }) => {
          const active = selected === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onSelect(key)}
              activeOpacity={0.75}
              style={[
                styles.metalPill,
                active
                  ? { backgroundColor: accentColor, borderColor: accentColor }
                  : { backgroundColor: OrTrackColors.card, borderColor: OrTrackColors.border },
              ]}>
              <Text style={[
                styles.metalPillText,
                active
                  ? { color: OrTrackColors.background, fontWeight: '700' }
                  : { color: OrTrackColors.white, fontWeight: '600' },
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.spotInline}>{spotInlineLabel}</Text>
    </View>
  );
}

// `section` and `sectionTitle` are duplicated from ajouter.tsx because they
// are shared by other sections (Choisissez un produit, Poids unitaire,
// Détails de l'achat) and must remain in ajouter.tsx unchanged. Both copies
// are byte-for-byte identical so visual output is unchanged.
// `metalPillsRow`, `metalPill`, `metalPillText`, `spotInline` are exclusive
// to the metal selector block and were moved out of ajouter.tsx.
const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  metalPillsRow: {
    gap: 6,
  },
  metalPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  metalPillText: {
    fontSize: 14,
  },
  spotInline: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    marginTop: 6,
    marginBottom: 4,
  },
});
