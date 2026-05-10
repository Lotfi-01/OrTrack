import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

const C = OrTrackColors;

export type SynthesePrivacyMode = 'complete' | 'masked';

type SynthesePrivacyChoiceProps = {
  value: SynthesePrivacyMode;
  onChange: (value: SynthesePrivacyMode) => void;
};

type Option = {
  value: SynthesePrivacyMode;
  label: string;
  sublabel: string;
};

const OPTIONS: Option[] = [
  {
    value: 'complete',
    label: 'Synthèse complète',
    sublabel: 'Inclut les montants de votre portefeuille.',
  },
  {
    value: 'masked',
    label: 'Synthèse masquée',
    sublabel: 'Masque les montants et les détails sensibles.',
  },
];

export default function SynthesePrivacyChoice({
  value,
  onChange,
}: SynthesePrivacyChoiceProps) {
  return (
    <View style={st.container}>
      {OPTIONS.map(opt => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[st.row, active && st.rowActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            accessibilityHint={opt.sublabel}
          >
            <View style={[st.dot, active && st.dotActive]}>
              {active ? <View style={st.dotInner} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.label, active && st.labelActive]}>{opt.label}</Text>
              <Text style={st.sublabel}>{opt.sublabel}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  container: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  rowActive: { borderColor: C.gold, backgroundColor: C.cardOpen },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: C.gold },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.gold },
  label: { color: C.white, fontSize: 13, fontWeight: '500' },
  labelActive: { fontWeight: '700' },
  sublabel: { color: C.textDim, fontSize: 11, marginTop: 2, lineHeight: 15 },
});
