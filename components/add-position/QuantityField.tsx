import { StyleSheet, Text, TextInput, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

// Presentational only: the parent owns the `quantity` state, the
// `setQuantity` setter, the `qty = toNum(quantity)` derivation, validation,
// canSave, and the analytics-onFocus callback. This component renders the
// input + unit suffix block and emits no logic of its own.
//
// The outer field wrapper and the gold-highlightable label remain in the
// parent screen, because the label highlight depends on parent-owned
// `highlightedField` state and the prop surface here intentionally stays
// minimal (`value`, `onChangeText`, `onFocus`).

export type QuantityFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
};

export function QuantityField({ value, onChangeText, onFocus }: QuantityFieldProps) {
  return (
    <View style={styles.inputWrapper}>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="Quantité"
        placeholderTextColor={OrTrackColors.tabIconDefault}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
      />
      <Text style={styles.inputSuffix}>pièce(s)</Text>
    </View>
  );
}

// All three styles are byte-identical duplicates of the corresponding
// entries in the parent screen's `StyleSheet`. The originals stay at the
// call site because they are still used by the price, date and note
// fields. Per the refactor spec, shared styles are kept at the call site
// and locally duplicated here so this component is self-contained.
const styles = StyleSheet.create({
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingRight: 48,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    fontSize: 16,
    color: OrTrackColors.white,
  },
  inputSuffix: {
    position: 'absolute',
    right: 14,
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.subtext,
  },
});
