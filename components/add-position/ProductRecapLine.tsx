import { StyleSheet, Text, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

type ProductRecapLineProps = {
  label: string;
  weightLabel: string;
};

export function ProductRecapLine({ label, weightLabel }: ProductRecapLineProps) {
  return (
    <View>
      <Text style={styles.miniRecapText}>
        {label} · {weightLabel}
      </Text>
      <View style={styles.miniRecapSeparator} />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
