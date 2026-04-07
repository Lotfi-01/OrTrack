import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Path, Line as SvgLine } from 'react-native-svg';

import { RadarSignal } from '@/utils/radar/types';
import { OrTrackColors } from '@/constants/theme';
import {
  computeSparklinePoints,
  buildLinePath,
  buildAreaPath,
  findClosestPoint,
  SparklinePoint,
} from '@/utils/radar/sparkline-path';

interface PrimeSparklineProps {
  data: { date: string; primePct: number }[];
  width: number;
  height: number;
  signal: RadarSignal | null;
  interactive?: boolean;
  onTouch?: (point: { date: string; primePct: number } | null) => void;
}

function getSignalColor(signal: RadarSignal | null): string {
  switch (signal) {
    case 'low': return OrTrackColors.green;
    case 'normal': return OrTrackColors.gold;
    case 'high': return '#C75B5B';
    default: return '#666666';
  }
}

export default function PrimeSparkline({
  data,
  width,
  height,
  signal,
  interactive = false,
  onTouch,
}: PrimeSparklineProps) {
  const color = getSignalColor(signal);
  const gradIdRef = useRef(`spark-${Math.random().toString(36).slice(2, 7)}`);
  const gradId = gradIdRef.current;
  const pointsRef = useRef<SparklinePoint[] | null>(null);

  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const points = useMemo(() => {
    const pts = computeSparklinePoints(data, width, height);
    pointsRef.current = pts;
    return pts;
  }, [data, width, height]);

  const linePath = useMemo(() => (points ? buildLinePath(points) : ''), [points]);
  const areaPath = useMemo(() => (points ? buildAreaPath(points, height) : ''), [points, height]);

  const handleTouch = useCallback((touchX: number) => {
    const pts = pointsRef.current;
    if (!pts || pts.length === 0) return;
    const closest = findClosestPoint(pts, touchX);
    const idx = pts.indexOf(closest);
    setActiveIdx(idx);
    onTouch?.({ date: closest.date, primePct: closest.primePct });
  }, [onTouch]);

  const handleRelease = useCallback(() => {
    setActiveIdx(null);
    onTouch?.(null);
  }, [onTouch]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => handleTouch(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => handleTouch(evt.nativeEvent.locationX),
      onPanResponderRelease: () => handleRelease(),
      onPanResponderTerminate: () => handleRelease(),
    }),
  ).current;

  if (!points) return null;

  const strokeWidth = interactive ? 2 : 1.5;
  const highlightIdx = activeIdx ?? points.length - 1;
  const highlightPt = points[highlightIdx]!;
  const dotRadius = interactive ? 3 : 2.5;

  return (
    <View {...(interactive ? panResponder.panHandlers : {})}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.15" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill={`url(#${gradId})`} />
        <Path d={linePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        {interactive && activeIdx !== null && (
          <SvgLine
            x1={highlightPt.x}
            y1={0}
            x2={highlightPt.x}
            y2={height}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3"
            opacity={0.5}
          />
        )}
        <Circle cx={highlightPt.x} cy={highlightPt.y} r={dotRadius} fill={color} />
      </Svg>
    </View>
  );
}
