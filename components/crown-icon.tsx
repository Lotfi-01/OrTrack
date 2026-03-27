import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { OrTrackColors } from '@/constants/theme';

export function CrownIcon({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 8l4 12h12l4-12-5 4-5-8-5 8-5-4z" fill={OrTrackColors.gold} opacity={0.9} />
      <Path d="M6 20h12v2H6z" fill={OrTrackColors.gold} opacity={0.7} />
    </Svg>
  );
}
