import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

// Presentational only: the parent owns purchaseDate state, setPurchaseDate,
// the auto-format wrapper, the validation pipeline, isDateValid, canSave,
// and the analytics-onFocus callback. Every shortcut onPress is built by
// the parent and forwarded byte-equivalent through this component.

export type DateShortcut = {
  label: string;
  onPress: () => void;
};

type DateFieldCommonProps = {
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  shortcuts?: readonly DateShortcut[];
  label?: string;
  placeholder?: string;
  isHighlighted?: boolean;
};

type DateFieldControlledProps = DateFieldCommonProps & {
  value: string;
  defaultValue?: never;
};

type DateFieldUncontrolledProps = DateFieldCommonProps & {
  value?: never;
  defaultValue: string;
};

export type DateFieldProps =
  | DateFieldControlledProps
  | DateFieldUncontrolledProps;

export function DateField(props: DateFieldProps) {
  const {
    onChangeText,
    onFocus,
    shortcuts,
    label,
    placeholder,
    isHighlighted,
  } = props;

  const valueOrDefault =
    props.value !== undefined
      ? { value: props.value }
      : { defaultValue: props.defaultValue };

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
        {shortcuts && shortcuts.length > 0 && (
          <View style={styles.dateShortcuts}>
            {shortcuts.map(shortcut => (
              <TouchableOpacity
                key={shortcut.label}
                onPress={shortcut.onPress}
                activeOpacity={0.7}
              >
                <Text style={styles.quickFillBtn}>{shortcut.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor={OrTrackColors.tabIconDefault}
        {...valueOrDefault}
        onChangeText={onChangeText}
        onFocus={onFocus}
        maxLength={10}
      />
    </View>
  );
}

// Five of the six entries below are byte-identical duplicates of shared
// styles that still live in the parent screen because they are also used
// by the price, quantity and note fields. dateShortcuts is the one entry
// that is exclusive to this field and was moved out of the parent's
// StyleSheet into here. Per the refactor spec, shared styles stay at the
// call site and are duplicated here so the component is self-contained.
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
  dateShortcuts: {
    flexDirection: 'row',
    gap: 12,
  },
  quickFillBtn: {
    fontSize: 14,
    color: OrTrackColors.gold,
    fontWeight: '600',
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
});
