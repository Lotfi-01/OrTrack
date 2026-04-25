import { StyleSheet, Text, TextInput, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

// Presentational only: the parent owns note state, setNote, the save-time
// trim that turns an empty string into undefined, and any analytics. The
// note field has no onFocus analytics trigger today, no highlight state,
// and no shortcuts, so the component surface is intentionally minimal.

type NoteFieldCommonProps = {
  onChangeText: (value: string) => void;
  label?: string;
  placeholder?: string;
};

type NoteFieldControlledProps = NoteFieldCommonProps & {
  value: string;
  defaultValue?: never;
};

type NoteFieldUncontrolledProps = NoteFieldCommonProps & {
  value?: never;
  defaultValue: string;
};

export type NoteFieldProps =
  | NoteFieldControlledProps
  | NoteFieldUncontrolledProps;

export function NoteField(props: NoteFieldProps) {
  const { onChangeText, label, placeholder } = props;

  const valueOrDefault =
    props.value !== undefined
      ? { value: props.value }
      : { defaultValue: props.defaultValue };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        multiline={false}
        placeholderTextColor={OrTrackColors.tabIconDefault}
        {...valueOrDefault}
        onChangeText={onChangeText}
        maxLength={120}
      />
    </View>
  );
}

// All three styles are byte-identical duplicates of shared entries that
// still live in the parent screen because the price, quantity and date
// fields continue to consume them. Per the refactor spec, shared styles
// stay at the call site and are duplicated here so the component is
// self-contained.
const styles = StyleSheet.create({
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    color: OrTrackColors.label,
    fontWeight: '500',
    marginLeft: 2,
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
