import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

// Presentational only: every label and value is built by the parent.
// EstimationCard performs no calculation, no formatting, no euro
// conversion, and no silver / TVA / prime decision.
//
// Tone for the gain/loss line is chosen by the parent. The card maps the
// tone to a fixed local color so styling stays co-located with the visual.

export type EstimationCardTone = 'positive' | 'negative' | 'neutral';

export type EstimationCardProps = {
  title: string;
  estimatedValueLabel: string;
  gainLossLabel?: string;
  gainLossTone: EstimationCardTone;
  helperText?: string;
  disclaimerText?: string;
  children?: ReactNode;
};

export function EstimationCard({
  title,
  estimatedValueLabel,
  gainLossLabel,
  gainLossTone,
  helperText,
  disclaimerText,
  children,
}: EstimationCardProps) {
  return (
    <View style={styles.estimationCard}>
      <Text style={styles.estimationTitle}>{title}</Text>

      <View style={styles.estimationRow}>
        <Text style={styles.estimationLabel}>Valeur de marché</Text>
        <Text style={styles.estimationValue}>{estimatedValueLabel}</Text>
      </View>

      {gainLossLabel !== undefined && (
        <View style={styles.estimationRow}>
          <Text style={styles.estimationLabel}>Plus/moins-value</Text>
          <Text style={[
            styles.estimationGainLoss,
            gainLossTone === 'neutral'
              ? { color: OrTrackColors.subtext }
              : gainLossTone === 'positive'
                ? styles.positive
                : styles.negative,
          ]}>
            {gainLossLabel}
          </Text>
        </View>
      )}

      {helperText !== undefined && (
        <Text style={styles.estimationHint}>{helperText}</Text>
      )}
      {disclaimerText !== undefined && (
        <Text style={styles.estimationDisclaimer}>{disclaimerText}</Text>
      )}

      {children}
    </View>
  );
}

// All styles below are exclusive to the estimation card body and were moved
// out of ajouter.tsx — except `estimationDisclaimer`, which is duplicated
// here because the parent still needs it to style the silver-breakdown
// children rendered in `ajouter.tsx`'s scope and passed in via `children`.
// Both copies are byte-for-byte identical so visual output is unchanged.
const styles = StyleSheet.create({
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
    color: '#B3A692',
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
    color: '#B3A692',
    marginTop: 2,
  },
  estimationDisclaimer: {
    fontSize: 10,
    color: '#B3A692',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
