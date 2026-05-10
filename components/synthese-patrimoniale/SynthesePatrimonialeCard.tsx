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
        {`Vue datée · Positions détaillées · Partage natif`}
      </Text>

      <View style={st.docPreview}>
        <View style={st.docHeaderRow}>
          <View style={st.docAccent} />
          <View style={st.docBadge}>
            <Text style={st.docBadgeText}>PDF</Text>
          </View>
        </View>
        <View style={st.docModulesRow}>
          <View style={st.docModule} />
          <View style={st.docModule} />
          <View style={st.docModule} />
        </View>
        <Text style={st.docFooter}>Document indicatif</Text>
      </View>

      {!hasPositions ? (
        <Text style={st.empty}>{`Ajoutez d’abord vos positions.`}</Text>
      ) : null}

      <Text style={st.cta}>{'Générer ma synthèse →'}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginTop: 16,
    gap: 4,
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
  subtitle: { color: C.textDim, fontSize: 11, lineHeight: 16, marginTop: 1 },
  benefits: { color: C.trustSecondary, fontSize: 10, marginTop: 1 },
  docPreview: {
    marginTop: 7,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.divider,
    backgroundColor: C.background,
  },
  docHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  docAccent: {
    width: 36,
    height: 2,
    backgroundColor: C.gold,
    borderRadius: 1,
  },
  docBadge: {
    backgroundColor: C.goldBadge,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.openBorder,
  },
  docBadgeText: {
    color: C.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  docModulesRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginTop: 10,
  },
  docModule: {
    width: 28,
    height: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.divider,
    backgroundColor: 'transparent',
  },
  docFooter: {
    color: C.textMuted,
    fontSize: 10,
    marginTop: 8,
    letterSpacing: 0.3,
  },
  empty: { color: C.textDim, fontSize: 10, marginTop: 4, fontStyle: 'italic' },
  cta: { color: C.gold, fontSize: 12, fontWeight: '700', marginTop: 6, alignSelf: 'flex-start' },
});
