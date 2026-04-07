import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OrTrackColors } from '@/constants/theme';
import { RadarProduct, RadarSignal } from '@/utils/radar/types';

const C = OrTrackColors;

function getSignalLabel(signal: RadarSignal | null): string {
  switch (signal) {
    case 'low': return 'Basse vs 90j';
    case 'normal': return 'Normale';
    case 'high': return 'Élevée vs 90j';
    default: return 'En calibrage';
  }
}

function getSignalColor(signal: RadarSignal | null): string {
  switch (signal) {
    case 'low': return C.green;
    case 'normal': return C.gold;
    case 'high': return '#C75B5B';
    default: return '#666666';
  }
}

interface RadarLockedCardProps {
  product: RadarProduct;
  onUnlockPress: () => void;
}

export default function RadarLockedCard({ product, onUnlockPress }: RadarLockedCardProps) {
  const color = getSignalColor(product.signal);

  return (
    <View style={st.card}>
      <View style={st.row1}>
        <Text style={st.name} numberOfLines={1}>{product.label}</Text>
        <View style={[st.badge, { borderColor: color }]}>
          <Text style={[st.badgeText, { color }]}>{getSignalLabel(product.signal)}</Text>
        </View>
      </View>
      <View style={st.placeholder} />
      <TouchableOpacity style={st.cta} onPress={onUnlockPress} activeOpacity={0.7}>
        <Text style={st.ctaText}>{'\uD83D\uDC51 Débloquer \u203A'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  row1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { fontSize: 13, fontWeight: '600', color: C.white, flex: 1, marginRight: 8 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  placeholder: { height: 16, backgroundColor: C.border, borderRadius: 4, opacity: 0.4, marginTop: 6, marginBottom: 6 },
  cta: { alignItems: 'center', marginTop: 6 },
  ctaText: { fontSize: 10, color: C.gold, fontWeight: '600' },
});
