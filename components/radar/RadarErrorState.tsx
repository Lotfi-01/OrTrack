import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OrTrackColors } from '@/constants/theme';

const C = OrTrackColors;

interface RadarErrorStateProps {
  onRetry: () => void;
  isRetrying: boolean;
  subtitle?: string;
}

export default function RadarErrorState({ onRetry, isRetrying, subtitle }: RadarErrorStateProps) {
  return (
    <View style={st.card}>
      <View style={st.row}>
        <Text style={st.title}>Prime marché</Text>
        <TouchableOpacity
          style={[st.retryBtn, isRetrying && { opacity: 0.5 }]}
          onPress={onRetry}
          disabled={isRetrying}
          activeOpacity={0.7}
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color={C.gold} />
          ) : (
            <Text style={st.retryText}>Réessayer</Text>
          )}
        </TouchableOpacity>
      </View>
      <Text style={st.subtitle}>{subtitle ?? 'Indisponible'}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 13, fontWeight: '600', color: C.white },
  subtitle: { fontSize: 11, color: C.textDim, opacity: 0.7, marginTop: 2 },
  retryBtn: { borderWidth: 0.5, borderColor: C.gold, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 12, minHeight: 24, justifyContent: 'center' },
  retryText: { fontSize: 11, fontWeight: '600', color: C.gold },
});
