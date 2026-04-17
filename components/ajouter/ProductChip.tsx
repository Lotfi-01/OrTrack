import { Ionicons } from '@expo/vector-icons';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';
import type { Product } from '@/constants/products';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHIP_WIDTH = (SCREEN_WIDTH - 40 - 8) / 2;

type ProductChipProps = {
  product: Product;
  active: boolean;
  compact?: boolean;
  onPress: (product: Product) => void;
};

function formatWeightLabel(weightG: number): string {
  if (weightG >= 1000) return `${weightG / 1000} kg`;
  if (weightG % 1 === 0) return `${weightG} g`;
  return `${weightG.toFixed(2).replace('.', ',')} g`;
}

export function ProductChip({ product, active, compact = false, onPress }: ProductChipProps) {
  return (
    <TouchableOpacity
      onPress={() => onPress(product)}
      activeOpacity={0.75}
      style={[
        styles.productChip,
        compact && styles.productChipCompact,
        active && styles.productChipActive,
      ]}>
      {active && (
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark" size={14} color={OrTrackColors.white} />
        </View>
      )}
      {product.popular && (
        <View style={[styles.popularBadge, compact && styles.popularBadgeCompact]}>
          <Text style={[styles.popularBadgeText, compact && { fontSize: 8 }]}>
            Populaire
          </Text>
        </View>
      )}
      <Text
        numberOfLines={2}
        ellipsizeMode="tail"
        style={[
          styles.productChipLabel,
          compact && styles.productChipLabelCompact,
          active && styles.productChipLabelActive,
          active && { paddingRight: 32 },
        ]}>
        {product.category === 'autre' ? 'Autre lingot' : product.label}
      </Text>
      {product.weightG !== null && (
        <Text style={[styles.productChipWeight, active && styles.productChipWeightActive]}>
          {formatWeightLabel(product.weightG)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  productChip: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    alignItems: 'center',
    width: CHIP_WIDTH,
    minHeight: 72,
    overflow: 'hidden',
  },
  productChipCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 60,
  },
  productChipActive: {
    borderWidth: 1,
    borderColor: OrTrackColors.gold,
    backgroundColor: '#C9A84C14',
  },
  productChipLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: OrTrackColors.white,
    textAlign: 'center',
  },
  productChipLabelCompact: {
    fontSize: 10,
  },
  productChipLabelActive: {
    color: OrTrackColors.gold,
    fontWeight: '700',
  },
  productChipWeight: {
    fontSize: 10,
    color: OrTrackColors.label,
    marginTop: 2,
  },
  productChipWeightActive: {
    color: 'rgba(201,168,76,0.5)',
  },
  popularBadge: {
    backgroundColor: 'rgba(201, 168, 76, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  popularBadgeCompact: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    marginBottom: 2,
  },
  popularBadgeText: {
    fontSize: 9,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: OrTrackColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
