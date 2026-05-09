import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

const C = OrTrackColors;

type SynthesePatrimonialeCardProps = {
  hasPositions: boolean;
  onPress: () => void;
};

export default function SynthesePatrimonialeCard({
  hasPositions,
  onPress,
}: SynthesePatrimonialeCardProps) {
  return (
    <TouchableOpacity
      style={st.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Synthèse patrimoniale"
      accessibilityHint="Ouvre l'écran de génération de synthèse patrimoniale"
    >
      <View style={st.headerRow}>
        <Ionicons name="document-text-outline" size={18} color={C.gold} />
        <Text style={st.title}>Synthèse patrimoniale</Text>
        <View style={st.badge}>
          <Text style={st.badgeText}>Premium</Text>
        </View>
      </View>

      <Text style={st.subtitle}>
        Obtenez une trace datée de votre portefeuille.
      </Text>

      <Text style={st.benefits}>
        {`Vue d’ensemble datée · Détail des positions · Partage natif`}
      </Text>

      <View style={st.preview}>
        <View style={st.skeletonLine} />
        <View style={[st.skeletonLine, { width: '70%' }]} />
        <View style={st.placeholderRow}>
          <View style={[st.skeletonLine, { width: '40%' }]} />
          <Text style={st.placeholder}>{'••••••'}</Text>
        </View>
      </View>

      {!hasPositions ? (
        <Text style={st.empty}>{`Ajoutez d’abord vos positions.`}</Text>
      ) : null}

      <Text style={st.cta}>Générer ma synthèse</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginTop: 16,
    gap: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: C.white, fontSize: 13, fontWeight: '600', flex: 1 },
  badge: {
    backgroundColor: C.goldBadge,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.openBorder,
  },
  badgeText: { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  subtitle: { color: C.textDim, fontSize: 11, lineHeight: 16, marginTop: 2 },
  benefits: { color: C.trustSecondary, fontSize: 10, marginTop: 2 },
  preview: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.divider,
    gap: 6,
  },
  skeletonLine: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.border,
    width: '100%',
  },
  placeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  placeholder: { color: C.textMuted, fontSize: 11, letterSpacing: 1 },
  empty: { color: C.textDim, fontSize: 10, marginTop: 6, fontStyle: 'italic' },
  cta: { color: C.gold, fontSize: 12, fontWeight: '700', marginTop: 8, alignSelf: 'flex-start' },
});
