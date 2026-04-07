import { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OrTrackColors } from '@/constants/theme';
import { RadarProduct, RadarMetal } from '@/utils/radar/types';
import { buildComparisonModel, ComparisonModel } from '@/utils/radar/radar-comparison';

const C = OrTrackColors;

interface RadarComparisonBlockProps {
  products: RadarProduct[];
  metal: RadarMetal | undefined;
  isPremium: boolean;
  onUnlockPress: () => void;
  onVisible?: (groupLabel: string) => void;
}

export default function RadarComparisonBlock({ products, metal, isPremium, onUnlockPress, onVisible }: RadarComparisonBlockProps) {
  if (!isPremium) {
    return (
      <View style={st.card}>
        <Text style={st.lockBenefit}>Repérez le produit avec la prime la plus basse</Text>
        <TouchableOpacity style={st.lockCta} onPress={onUnlockPress} activeOpacity={0.7}>
          <Text style={st.lockCtaText}>{'\uD83D\uDC51 Débloquer la comparaison \u203A'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const metals: RadarMetal[] = metal ? [metal] : ['gold', 'silver', 'platinum', 'palladium'];
  const categories: ('piece' | 'lingot')[] = ['piece', 'lingot'];

  const models: ComparisonModel[] = [];
  for (const m of metals) {
    for (const cat of categories) {
      const model = buildComparisonModel(products, m, cat);
      if (model) models.push(model);
    }
  }

  if (models.length === 0) return null;

  return (
    <View>
      <Text style={st.sectionTitle}>COMPARAISON</Text>
      {models.map(model => (
        <ComparisonGroup key={model.groupLabel} model={model} onVisible={onVisible} />
      ))}
    </View>
  );
}

function ComparisonGroup({ model, onVisible }: { model: ComparisonModel; onVisible?: (label: string) => void }) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current && onVisible) {
      tracked.current = true;
      onVisible(model.groupLabel);
    }
  }, [model.groupLabel, onVisible]);

  const lowestPctId = model.products[0]?.productId;

  return (
    <View style={st.card}>
      <Text style={st.groupTitle}>Comparaison {model.groupLabel}</Text>
      {model.products.map(p => {
        const isLowest = p.productId === lowestPctId;
        const barColor = isLowest ? C.green : C.gold;
        return (
          <View key={p.productId} style={st.barRow}>
            <Text style={st.barLabel} numberOfLines={1}>{p.label}</Text>
            <View style={st.barTrack}>
              <View style={[st.barFill, { width: `${Math.max(2, p.percentile)}%`, backgroundColor: barColor }]} />
            </View>
            <Text style={st.barPct}>P{p.percentile}</Text>
          </View>
        );
      })}
      <Text style={st.sentence}>{model.sentence}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  card: { backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  groupTitle: { fontSize: 12, fontWeight: '600', color: C.white, marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  barLabel: { fontSize: 11, color: C.textDim, width: 90 },
  barTrack: { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barPct: { fontSize: 10, fontWeight: '600', color: C.textDim, width: 30, textAlign: 'right' },
  sentence: { fontSize: 11, color: C.textDim, marginTop: 8, fontStyle: 'italic' },
  lockBenefit: { fontSize: 11, color: C.textDim, textAlign: 'center', marginBottom: 8 },
  lockCta: { alignItems: 'center', paddingVertical: 8 },
  lockCtaText: { fontSize: 12, color: C.gold, fontWeight: '600' },
});
