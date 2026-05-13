import { StyleSheet, Text, View } from 'react-native';

import { OrTrackColors } from '@/constants/theme';
import {
  type PointMortSpotResult,
  formatPointMortSpotPrice,
} from '@/utils/point-mort-spot';

const C = OrTrackColors;

type Props = {
  result: PointMortSpotResult;
  spotActuel: number | null;
  currencySymbol: string;
};

export default function PointMortSpotBlock({ result, spotActuel, currencySymbol }: Props) {
  const symbol = currencySymbol && currencySymbol.length > 0 ? currencySymbol : '€';
  const hasSpot = result.hasSpotActuel && spotActuel !== null && Number.isFinite(spotActuel) && spotActuel > 0;

  return (
    <View style={st.container}>
      <View style={st.row}>
        <Text style={st.label}>{'PRIX D’ACHAT / G'}</Text>
        <Text style={st.valueStrong}>{formatPointMortSpotPrice(result.pointMortSpot, symbol)}</Text>
      </View>

      {hasSpot && (
        <View style={st.row}>
          <Text style={st.subLabel}>{'Cours actuel'}</Text>
          <Text style={st.value}>{formatPointMortSpotPrice(spotActuel as number, symbol)}</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  label: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subLabel: {
    color: C.textDim,
    fontSize: 12,
  },
  value: {
    color: C.white,
    fontSize: 12,
    fontWeight: '600',
  },
  valueStrong: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
  },
});
