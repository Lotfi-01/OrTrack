import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

// Presentational only. Every value, label, callback, condition string and
// shortcut behaviour is computed by the parent and forwarded as a prop.
// The component does not own state, refs, callbacks, or derivations.

export type PriceFieldShortcut = {
  label: string;
  onPress: () => void;
};

export type PriceFieldProps = {
  label: string;
  isHighlighted?: boolean;
  shortcut: PriceFieldShortcut | null;
  inputKey: string;
  keyboardType: Extract<TextInputProps['keyboardType'], 'numeric' | 'decimal-pad'>;
  defaultValue: string;
  onFocus: NonNullable<TextInputProps['onFocus']>;
  onBlur: NonNullable<TextInputProps['onBlur']>;
  onChangeText: NonNullable<TextInputProps['onChangeText']>;
  currencySymbol: string;
  priceReferenceText: string | null;
  silverGapCopy: string | null;
};

export function PriceField({
  label,
  isHighlighted,
  shortcut,
  inputKey,
  keyboardType,
  defaultValue,
  onFocus,
  onBlur,
  onChangeText,
  currencySymbol,
  priceReferenceText,
  silverGapCopy,
}: PriceFieldProps) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text
          style={[
            styles.fieldLabel,
            isHighlighted && { color: OrTrackColors.gold },
          ]}
        >
          {label}
        </Text>
        {shortcut && (
          <TouchableOpacity onPress={shortcut.onPress} activeOpacity={0.7}>
            <Text style={styles.quickFillBtn}>{shortcut.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.inputWrapper}>
        <TextInput
          key={inputKey}
          style={styles.input}
          keyboardType={keyboardType}
          placeholder="Ex : 1 700"
          placeholderTextColor={OrTrackColors.tabIconDefault}
          defaultValue={defaultValue}
          onFocus={onFocus}
          onBlur={onBlur}
          onChangeText={onChangeText}
        />
        <Text style={styles.inputSuffix}>{currencySymbol}</Text>
      </View>
      {priceReferenceText && (
        <Text style={styles.priceRef}>{priceReferenceText}</Text>
      )}
      {silverGapCopy && (
        <Text style={styles.priceRef}>{silverGapCopy}</Text>
      )}
    </View>
  );
}

// Three of the eight entries below are exclusive to this field after the
// other field components were extracted, so they were moved out of the
// parent screen's StyleSheet: fieldLabelRow, quickFillBtn, priceRef. The
// other five are byte-identical duplicates of shared entries that still
// live in the parent screen because they remain consumed by other inputs.
const styles = StyleSheet.create({
  field: { gap: 6 },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 13,
    color: OrTrackColors.label,
    fontWeight: '500',
    marginLeft: 2,
  },
  quickFillBtn: {
    fontSize: 14,
    color: OrTrackColors.gold,
    fontWeight: '600',
  },
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
  priceRef: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    marginTop: 4,
    marginLeft: 2,
  },
});
