import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { OrTrackColors } from '@/constants/theme';

const C = OrTrackColors;

type PortfolioEmptyStateProps = {
  isFilterActive: boolean;
  metalName?: string | null;
  onAdd: () => void;
  onClearFilter: () => void;
};

export default function PortfolioEmptyState({ isFilterActive, metalName, onAdd, onClearFilter }: PortfolioEmptyStateProps) {
  if (isFilterActive) {
    return (
      <View style={st.emptyState}>
        <Ionicons name="briefcase-outline" size={40} color={C.textMuted} style={{ marginBottom: 12 }} />
        <Text style={st.emptyTitle}>Aucune position en {metalName?.toLowerCase()}</Text>
        <TouchableOpacity onPress={onClearFilter}>
          <Text style={st.emptyAction}>{'Tout afficher →'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onAdd}>
          <Text style={st.emptyAction}>{'Ajouter une position →'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={st.emptyState}>
      <Ionicons name="briefcase-outline" size={40} color={C.textMuted} style={{ marginBottom: 12 }} />
      <Text style={st.emptyTitle}>Aucune position</Text>
      <Text style={st.emptyText}>Ajoutez votre premier achat pour suivre votre portefeuille.</Text>
      <TouchableOpacity onPress={onAdd}>
        <Text style={st.emptyAction}>{'Ajouter une position →'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { color: C.textDim, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  emptyText: { color: C.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20, marginBottom: 8 },
  emptyAction: { color: C.gold, fontSize: 13, fontWeight: '600', marginTop: 14 },
});
