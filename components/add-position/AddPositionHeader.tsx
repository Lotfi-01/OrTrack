import { StyleSheet, Text } from 'react-native';

import { OrTrackColors } from '@/constants/theme';

type AddPositionHeaderProps = {
  title: string;
  subtitle: string;
};

export function AddPositionHeader({ title, subtitle }: AddPositionHeaderProps) {
  return (
    <>
      <Text style={styles.headerTitle}>{title}</Text>
      <Text style={styles.headerSubtitle}>{subtitle}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: OrTrackColors.white,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: OrTrackColors.subtext,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 8,
  },
});
