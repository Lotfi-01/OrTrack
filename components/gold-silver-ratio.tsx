import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';
import { useSpotPrices } from '@/hooks/use-spot-prices';

export function GoldSilverRatio() {
  const { prices, loading } = useSpotPrices();

  if (loading || prices.gold === null || prices.silver === null) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="large" color={OrTrackColors.gold} />
      </View>
    );
  }

  const ratio = prices.gold / prices.silver;

  let interpretation: string;
  let dotColor: string;
  if (ratio > 80) {
    interpretation = 'Argent historiquement sous-évalué';
    dotColor = '#4CAF50';
  } else if (ratio >= 60) {
    interpretation = 'Ratio dans la moyenne historique';
    dotColor = OrTrackColors.subtext;
  } else {
    interpretation = 'Or relativement sous-évalué';
    dotColor = OrTrackColors.gold;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.ratio}>{ratio.toFixed(1)}</Text>

      <View style={styles.interpRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.interpText}>{interpretation}</Text>
      </View>

      <Text style={styles.average}>Moyenne historique : ~65</Text>

      <Text style={styles.explanation}>
        Nombre d&#39;onces d&#39;argent nécessaires pour acheter 1 once d&#39;or. Plus le
        ratio est élevé, plus l&#39;argent est bon marché relativement à l&#39;or.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
  },
  ratio: {
    fontSize: 48,
    fontWeight: '700',
    color: OrTrackColors.white,
    marginBottom: 8,
  },
  interpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  interpText: {
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  average: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    marginBottom: 16,
  },
  explanation: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    lineHeight: 20,
    textAlign: 'center',
  },
});
