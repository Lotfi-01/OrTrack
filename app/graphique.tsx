import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PriceChart } from '@/components/price-chart';
import { OrTrackColors } from '@/constants/theme';

type Metal = 'gold' | 'silver' | 'platinum' | 'palladium';

const METAL_LABELS: Record<Metal, string> = {
  gold: 'Or',
  silver: 'Argent',
  platinum: 'Platine',
  palladium: 'Palladium',
};

export default function GraphiqueScreen() {
  const params = useLocalSearchParams<{ metal?: string; currency?: string }>();
  const metal = (params.metal as Metal) || 'gold';
  const currency = params.currency || 'EUR';
  const { height: screenHeight } = useWindowDimensions();
  const chartHeight = screenHeight - 320;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{METAL_LABELS[metal]}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.chartWrapper}>
        <PriceChart metal={metal} currency={currency} compact={false} height={chartHeight} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OrTrackColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 60,
  },
  backText: {
    fontSize: 14,
    color: OrTrackColors.gold,
    fontWeight: '500',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  chartWrapper: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
});
