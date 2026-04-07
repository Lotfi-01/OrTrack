import { useRef, useState } from 'react';
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OrTrackColors } from '@/constants/theme';
import { formatPct, MOIS_FR } from '@/utils/format';
import { RadarProduct, RadarSignal } from '@/utils/radar/types';
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

function formatDateFr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MOIS_FR[m! - 1]} ${y}`;
}

interface RadarDetailSheetProps {
  product: RadarProduct;
  visible: boolean;
  onClose: () => void;
  onFirstTouch?: () => void;
}

export default function RadarDetailSheet({ product, visible, onClose, onFirstTouch }: RadarDetailSheetProps) {
  const color = getSignalColor(product.signal);
  const hasTrackedTouch = useRef(false);
  const [touchPoint, setTouchPoint] = useState<{ date: string; primePct: number } | null>(null);

  const canShowChart = product.currentPrimePct !== null && product.dataQuality === 'ok' && product.history;

  const handleTouch = (point: { date: string; primePct: number } | null) => {
    setTouchPoint(point);
    if (point && !hasTrackedTouch.current) {
      hasTrackedTouch.current = true;
      onFirstTouch?.();
    }
  };

  const handleClose = () => {
    hasTrackedTouch.current = false;
    setTouchPoint(null);
    onClose();
  };

  const degradedText = product.currentPrimePct === null
    ? 'Dernière donnée indisponible'
    : product.dataQuality === 'missing' ? 'Aucune donnée disponible'
    : product.dataQuality === 'gaps' ? 'Données insuffisantes \u2014 série incomplète'
    : product.dataQuality === 'insufficient_history' ? 'En calibrage \u2014 moins de 7 jours de données'
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={st.overlay}>
        <View style={st.sheet}>
          <View style={st.dragBar} />
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={st.headerRow}>
              <Text style={st.name} numberOfLines={1}>{product.label}</Text>
              <View style={[st.badge, { borderColor: color }]}>
                <Text style={[st.badgeText, { color }]}>{getSignalLabel(product.signal)}</Text>
              </View>
            </View>

            {/* Metrics */}
            <View style={st.metricsRow}>
              <View>
                <Text style={st.metricLabel}>Prime actuelle</Text>
                <Text style={[st.metricValue, { color }]}>
                  {product.currentPrimePct !== null ? formatPct(product.currentPrimePct, 1) : '\u2014'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={st.metricLabel}>Percentile</Text>
                <Text style={st.metricValue}>
                  {product.percentile !== null ? `${product.percentile}/100` : '\u2014'}
                </Text>
              </View>
            </View>

            {/* Range 90j */}
            {canShowChart && (
              <View style={st.rangeRow}>
                <View>
                  <Text style={st.rangeLabel}>Plus bas 90j</Text>
                  <Text style={st.rangeValue}>{product.minPrimePct !== null ? formatPct(product.minPrimePct, 1) : '\u2014'}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={st.rangeLabel}>Moy 90j</Text>
                  <Text style={st.rangeValue}>{product.avgPrimePct !== null ? formatPct(product.avgPrimePct, 1) : '\u2014'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.rangeLabel}>Plus haut 90j</Text>
                  <Text style={st.rangeValue}>{product.maxPrimePct !== null ? formatPct(product.maxPrimePct, 1) : '\u2014'}</Text>
                </View>
              </View>
            )}

            {/* Sparkline interactive */}
            {canShowChart && product.history ? (
              <View style={st.sparklineWrap}>
                <PrimeSparkline
                  data={product.history}
                  width={SCREEN_W - 48}
                  height={60}
                  signal={product.signal}
                  interactive
                  onTouch={handleTouch}
                />
              </View>
            ) : degradedText ? (
              <Text style={st.degraded}>{degradedText}</Text>
            ) : null}

            {/* Touch point info */}
            {touchPoint && product.currentPrimePct !== null && (
              <View style={st.touchBlock}>
                <Text style={st.touchDate}>{formatDateFr(touchPoint.date)}</Text>
                <Text style={st.touchPrime}>Prime à cette date : {formatPct(touchPoint.primePct, 1)}</Text>
                <Text style={st.touchDelta}>
                  Évolution depuis ce point : {(product.currentPrimePct - touchPoint.primePct) >= 0 ? '+' : ''}{(product.currentPrimePct - touchPoint.primePct).toFixed(1).replace('.', ',')} pp
                </Text>
              </View>
            )}

            {/* Section suivi prime — ajoutée par Prompt 5 */}

            <Text style={st.microcopy}>Compare la prime actuelle à son niveau des 90 derniers jours</Text>

            <TouchableOpacity style={st.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={st.closeBtnText}>Fermer</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  dragBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  name: { fontSize: 16, fontWeight: '700', color: C.white, flex: 1, marginRight: 8 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  metricLabel: { fontSize: 11, color: C.textDim, marginBottom: 2 },
  metricValue: { fontSize: 16, fontWeight: '700', color: C.white },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  rangeLabel: { fontSize: 10, color: C.textDim, marginBottom: 2 },
  rangeValue: { fontSize: 12, fontWeight: '600', color: C.textDim },
  sparklineWrap: { marginVertical: 12 },
  degraded: { fontSize: 12, color: C.textMuted, fontStyle: 'italic', marginVertical: 12, textAlign: 'center' },
  touchBlock: { backgroundColor: C.background, borderRadius: 8, padding: 8, marginBottom: 12 },
  touchDate: { fontSize: 11, color: C.textDim, marginBottom: 2 },
  touchPrime: { fontSize: 12, color: C.white, fontWeight: '500' },
  touchDelta: { fontSize: 11, color: C.textDim, marginTop: 2 },
  microcopy: { fontSize: 10, color: C.textMuted, textAlign: 'center', marginTop: 16, marginBottom: 12 },
  closeBtn: { alignItems: 'center', paddingVertical: 12 },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: C.gold },
});
