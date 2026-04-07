import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OrTrackColors } from '@/constants/theme';
import { formatPct } from '@/utils/format';
import { RadarProduct, RadarSignal } from '@/utils/radar/types';
import { downsample } from '@/hooks/use-radar-products';
import PrimeSparkline from '@/components/radar/PrimeSparkline';

const C = OrTrackColors;
const SCREEN_W = Dimensions.get('window').width;

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

interface RadarProductCardProps {
  product: RadarProduct;
  onDetailPress: (product: RadarProduct) => void;
  isPremium: boolean;
}

export default function RadarProductCard({ product, onDetailPress, isPremium }: RadarProductCardProps) {
  const color = getSignalColor(product.signal);
  const noCurrentData = product.currentPrimePct === null;

  return (
    <View style={st.card}>
      <View style={st.row1}>
        <Text style={st.name} numberOfLines={1}>{product.label}</Text>
        <View style={[st.badge, { borderColor: color }]}>
          <Text style={[st.badgeText, { color }]}>{getSignalLabel(product.signal)}</Text>
        </View>
      </View>

      <View style={st.row2}>
        <Text style={st.primeLabel}>Prime : </Text>
        <Text style={st.primeValue}>{noCurrentData ? '\u2014' : formatPct(product.currentPrimePct!, 1)}</Text>
        {!noCurrentData && product.avgPrimePct !== null && (
          <>
            <Text style={st.sep}>{' \u00B7 '}</Text>
            <Text style={st.avg}>Moy 90j : {formatPct(product.avgPrimePct, 1)}</Text>
          </>
        )}
      </View>

      {noCurrentData ? (
        <Text style={st.degraded}>Dernière donnée indisponible</Text>
      ) : product.history ? (
        <PrimeSparkline
          data={downsample(product.history, 20)}
          width={SCREEN_W - 80}
          height={28}
          signal={product.signal}
        />
      ) : (
        <Text style={st.degraded}>
          {product.dataQuality === 'missing' ? 'Aucune donnée disponible'
            : product.dataQuality === 'gaps' ? 'Données insuffisantes \u2014 série incomplète'
            : product.dataQuality === 'insufficient_history' ? 'En calibrage \u2014 moins de 7 jours de données'
            : '\u2014'}
        </Text>
      )}

      {isPremium && (
        <TouchableOpacity style={st.detailCta} onPress={() => onDetailPress(product)} activeOpacity={0.7}>
          <Text style={st.detailCtaText}>{'\u203A détail'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  row1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { fontSize: 13, fontWeight: '600', color: C.white, flex: 1, marginRight: 8 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  row2: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  primeLabel: { fontSize: 11, color: C.textDim },
  primeValue: { fontSize: 12, fontWeight: '600', color: C.white },
  sep: { fontSize: 11, color: C.textDim },
  avg: { fontSize: 11, color: C.textDim },
  degraded: { fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginVertical: 4 },
  detailCta: { alignItems: 'flex-end', marginTop: 4 },
  detailCtaText: { fontSize: 11, color: C.gold, fontWeight: '600' },
});
