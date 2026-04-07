import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';
import { formatInt } from '@/utils/format';

type Indicator = {
  label: string;
  value: number | null;
  unit: string;
  low: number;
  high: number;
  lowLabel: string;
  midLabel: string;
  highLabel: string;
  lowSignal: string;
  midSignal: string;
  highSignal: string;
  explanation: string;
  spotLine?: string;
};

function getSignal(ind: Indicator): { label: string; color: string } {
  if (ind.value === null) return { label: 'CHARGEMENT', color: '#888888' };
  if (ind.value < ind.low) return { label: ind.lowSignal, color: '#E07070' };
  if (ind.value > ind.high) return { label: ind.highSignal, color: '#4CAF50' };
  return { label: ind.midSignal, color: '#C9A84C' };
}

function IndicatorCard({ ind }: { ind: Indicator }) {
  const [expanded, setExpanded] = useState(false);
  const signal = getSignal(ind);

  if (ind.value === null) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{ind.label}</Text>
        <ActivityIndicator size="small" color="#C9A84C" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.cardLabel}>{ind.label}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={OrTrackColors.subtext}
        />
      </TouchableOpacity>

      <View style={styles.cardCompact}>
        <Text style={styles.ratioValueCompact}>
          {ind.value.toFixed(2).replace('.', ',')}
        </Text>
        <View style={styles.cardCompactRight}>
          <View
            style={[
              styles.signalBadge,
              {
                backgroundColor: signal.color + '22',
                borderColor: signal.color + '66',
              },
            ]}>
            <View style={[styles.signalDot, { backgroundColor: signal.color }]} />
            <Text style={[styles.signalText, { color: signal.color }]}>
              {signal.label}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.gaugeContainer}>
        <View
          style={[
            styles.gaugeFill,
            {
              backgroundColor: signal.color,
              width: `${Math.min(Math.max(((ind.value - ind.low * 0.7) / (ind.high * 1.3 - ind.low * 0.7)) * 100, 0), 100).toFixed(0)}%` as `${number}%`,
            },
          ]}
        />
      </View>

      <View style={styles.gaugeLabels}>
        <Text style={styles.gaugeLabel}>{String(ind.low).replace('.', ',')}</Text>
        <Text style={styles.gaugeLabel}>{String(ind.high).replace('.', ',')}</Text>
      </View>

      {ind.value < ind.low * 0.7 || ind.value > ind.high * 1.3 ? (
        <View style={styles.outOfRangeBadge}>
          <Text style={styles.outOfRangeText}>Hors fourchette historique</Text>
        </View>
      ) : null}

      {!expanded && (
        <View style={styles.ratioSummaryBlock}>
          <Text style={styles.ratioSummary}>
            {ind.value.toFixed(2).replace('.', ',')}x {ind.unit} {'\u00B7'} Fourchette historique : {String(ind.low).replace('.', ',')}{'\u2013'}{String(ind.high).replace('.', ',')}
          </Text>
          {ind.spotLine && (
            <Text style={styles.ratioSpotLine}>{ind.spotLine}</Text>
          )}
        </View>
      )}

      {expanded && (
        <>
          <Text style={[styles.ratioUnit, { marginBottom: 8 }]}>
            {ind.value.toFixed(2).replace('.', ',')}x {ind.unit}
          </Text>
          <Text style={styles.ratioSummary}>
            Fourchette historique : {String(ind.low).replace('.', ',')}{'\u2013'}{String(ind.high).replace('.', ',')}
          </Text>
          <Text style={styles.explanation}>{ind.explanation}</Text>
        </>
      )}
    </View>
  );
}

function fmtSpot(v: number | null): string {
  if (v === null) return '—';
  return formatInt(v);
}

export function IndicateursPanel() {
  const { prices, loading } = useSpotPrices();

  const ratio1 = prices.gold && prices.silver && prices.silver > 0
    ? prices.gold / prices.silver : null;

  const ratio2 = prices.gold && prices.platinum && prices.platinum > 0
    ? prices.gold / prices.platinum : null;

  const ratio3 = prices.gold && prices.palladium && prices.palladium > 0
    ? prices.gold / prices.palladium : null;

  const indicators: Indicator[] = [
    {
      label: 'Ratio Or / Argent',
      value: ratio1,
      unit: 'onces d\'argent pour 1 once d\'or',
      low: 60, high: 80,
      spotLine: `Or : ${fmtSpot(prices.gold)} €/oz · Argent : ${fmtSpot(prices.silver)} €/oz`,
      lowLabel: 'Or sous-évalué',
      midLabel: 'Zone neutre',
      highLabel: 'Argent sous-évalué',
      lowSignal: 'ATTENTION',
      midSignal: 'NEUTRE',
      highSignal: 'OPPORTUNITÉ',
      explanation: 'Nombre d\'onces d\'argent nécessaires pour acheter 1 once d\'or. Historiquement entre 60 et 80.',
    },
    {
      label: 'Ratio Or / Platine',
      value: ratio2,
      unit: 'fois plus cher que le platine',
      low: 0.8, high: 1.2,
      spotLine: `Or : ${fmtSpot(prices.gold)} €/oz · Platine : ${fmtSpot(prices.platinum)} €/oz`,
      lowLabel: 'Platine cher',
      midLabel: 'Zone neutre',
      highLabel: 'Platine sous-évalué',
      lowSignal: 'ATTENTION',
      midSignal: 'NEUTRE',
      highSignal: 'OPPORTUNITÉ',
      explanation: 'Historiquement l\'or et le platine s\'échangeaient à parité. Un ratio > 1,2 signale le platine comme potentiellement sous-évalué.',
    },
    {
      label: 'Ratio Or / Palladium',
      value: ratio3,
      unit: 'fois plus cher que le palladium',
      low: 0.8, high: 1.5,
      spotLine: `Or : ${fmtSpot(prices.gold)} €/oz · Palladium : ${fmtSpot(prices.palladium)} €/oz`,
      lowLabel: 'Palladium cher',
      midLabel: 'Zone neutre',
      highLabel: 'Palladium sous-évalué',
      lowSignal: 'ATTENTION',
      midSignal: 'NEUTRE',
      highSignal: 'OPPORTUNITÉ',
      explanation: 'Le palladium a dépassé l\'or en 2019-2021. Un ratio élevé peut signaler une opportunité d\'accumulation.',
    },
  ];

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="large" color={OrTrackColors.gold} />
      </View>
    );
  }

  return (
    <View>
      {indicators.map((ind) => (
        <IndicatorCard key={ind.label} ind={ind} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ratioValueCompact: {
    fontSize: 32,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  cardCompactRight: {
    alignItems: 'flex-end',
  },
  cardLabel: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 0,
    textTransform: 'uppercase',
  },
  ratioUnit: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    textAlign: 'center',
    marginBottom: 16,
  },
  gaugeContainer: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A2A3A',
    width: '100%',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: 6,
    borderRadius: 3,
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  gaugeLabel: {
    fontSize: 10,
    color: OrTrackColors.subtext,
  },
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 0,
  },
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  signalText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ratioSummaryBlock: {
    marginTop: 8,
  },
  ratioSummary: {
    fontSize: 11,
    color: OrTrackColors.subtext,
  },
  ratioSpotLine: {
    fontSize: 10,
    color: OrTrackColors.subtext,
    marginTop: 4,
  },
  explanation: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    lineHeight: 20,
    marginTop: 12,
  },
  outOfRangeBadge: {
    backgroundColor: 'rgba(224,112,112,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  outOfRangeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#E07070',
  },
});
