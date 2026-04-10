import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { OrTrackColors } from '@/constants/theme';

const C = OrTrackColors;

type PortfolioStatsTeaserProps = {
  subtitleText: string;
  onPress: () => void;
};

export default function PortfolioStatsTeaser({ subtitleText, onPress }: PortfolioStatsTeaserProps) {
  return (
    <TouchableOpacity style={st.statsTeaser} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name="bar-chart-outline" size={18} color={C.gold} />
      <View style={{ flex: 1 }}>
        <Text style={st.statsTeaserTitle}>Statistiques</Text>
        <Text style={st.statsTeaserSub}>{subtitleText}</Text>
      </View>
      {/* BYPASS PREMIUM - A RETIRER : badge PREMIUM masque en v1 */}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  statsTeaser: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  statsTeaserTitle: { color: C.white, fontSize: 13, fontWeight: '600' },
  statsTeaserSub: { color: C.textDim, fontSize: 10, marginTop: 1 },
  premiumBadgeLg: { backgroundColor: C.goldDim, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8 },
  premiumBadgeLgText: { color: C.gold, fontSize: 9, fontWeight: '700' },
});
