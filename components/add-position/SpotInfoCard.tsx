import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

// Presentational only: every label and value is built by the parent before
// being passed in. This component performs no formatting, no euro
// conversion, no spot computation, and no silver / TVA / prime decisions.
export type SpotInfoCardProps = {
  spotPriceLabel: string;
  productLineLabel: string;
  estimatedValueTitle: string;
  estimatedValueLabel: string;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function SpotInfoCard({
  spotPriceLabel,
  productLineLabel,
  estimatedValueTitle,
  estimatedValueLabel,
  onLayout,
}: SpotInfoCardProps) {
  return (
    <View collapsable={false} onLayout={onLayout}>
      <View style={styles.separator} />
      <View style={styles.spotInfoCard}>
        <View style={styles.spotInfoRow}>
          <Text style={styles.spotInfoLabel}>Cours actuel</Text>
          <Text style={styles.spotInfoValue}>{spotPriceLabel}</Text>
        </View>
        <View>
          <Text style={styles.spotInfoLabel}>Produit sélectionné</Text>
          <Text style={[styles.spotInfoValue, { marginTop: 2 }]}>
            {productLineLabel}
          </Text>
        </View>
        <View style={styles.spotInfoRow}>
          <Text style={styles.spotInfoLabel}>{estimatedValueTitle}</Text>
          <Text style={[styles.spotInfoValue, { color: OrTrackColors.gold }]}>
            {estimatedValueLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

// All styles below are exclusive to the spot-info card block and were moved
// out of ajouter.tsx. No shared style needed duplication.
const styles = StyleSheet.create({
  separator: {
    height: 1,
    backgroundColor: OrTrackColors.border,
    marginBottom: 8,
  },
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
});
