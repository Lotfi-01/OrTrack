import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Line as SvgLine, G, Text as SvgText } from 'react-native-svg';

import { OrTrackColors } from '@/constants/theme';
import { loadPriceHistory, type PricePoint } from '@/hooks/use-metal-history';

type Metal = 'gold' | 'silver' | 'platinum' | 'palladium' | 'copper';
type Period = '1J' | '1S' | '1M' | 'MAX';

const PERIODS: { key: Period; label: string; ms: number | null }[] = [
  { key: '1J', label: '1J', ms: 24 * 60 * 60 * 1000 },
  { key: '1S', label: '1S', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '1M', label: '1M', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: 'MAX', label: 'MAX', ms: null },
];

const LINE_COLORS: Record<Metal, string> = {
  gold: OrTrackColors.gold,
  silver: '#A8A8B8',
  platinum: '#E0E0E0',
  palladium: '#CBA135',
  copper: '#B87333',
};

const TITLES: Record<Metal, string> = {
  gold: 'Historique Or (XAU)',
  silver: 'Historique Argent (XAG)',
  platinum: 'Historique Platine (XPT)',
  palladium: 'Historique Palladium (XPD)',
  copper: 'Historique Cuivre (XCU)',
};

const CHART_HEIGHT = 180;
const PADDING = { top: 10, bottom: 30, left: 55, right: 12 };

function formatLabel(ts: number, period: Period): string {
  const d = new Date(ts);
  if (period === '1J') {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step: number;
  if (norm <= 1.5) step = 1;
  else if (norm <= 3) step = 2;
  else if (norm <= 7) step = 5;
  else step = 10;
  return step * mag;
}

export function PriceChart({ metal, historyReady }: { metal: Metal; historyReady: boolean }) {
  const gradIdRef = useRef(`grad-${metal}-${Math.random().toString(36).slice(2, 7)}`);
  const gradId = gradIdRef.current;
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [period, setPeriod] = useState<Period>('MAX');

  useEffect(() => {
    if (historyReady) {
      loadPriceHistory().then(setHistory);
    }
  }, [historyReady]);

  useFocusEffect(
    useCallback(() => {
      loadPriceHistory().then(setHistory);
    }, []),
  );

  const filtered = useMemo(() => {
    const p = PERIODS.find((pp) => pp.key === period)!;
    if (p.ms === null) return history;
    const cutoff = Date.now() - p.ms;
    return history.filter((pt) => pt.timestamp >= cutoff);
  }, [history, period]);

  const chartData = useMemo(
    () => filtered.filter((pt) => (pt[metal] ?? 0) > 0).map((pt) => ({ x: pt.timestamp, y: pt[metal] ?? 0 })),
    [filtered, metal],
  );

  const variation = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0]!.y;
    const last = chartData[chartData.length - 1]!.y;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
  }, [chartData]);

  const color = LINE_COLORS[metal];
  const title = TITLES[metal];

  // ── SVG layout computation ─────────────────────────────────────────────
  const plotW = 340 - PADDING.left - PADDING.right;
  const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const { linePath, areaPath, xTicks, yTicks, yMin, yMax, xMin, xMax } = useMemo(() => {
    if (chartData.length < 2) {
      return { linePath: '', areaPath: '', xTicks: [] as number[], yTicks: [] as number[], yMin: 0, yMax: 1, xMin: 0, xMax: 1 };
    }

    const xs = chartData.map((d) => d.x);
    const ys = chartData.map((d) => d.y);
    const xMinVal = Math.min(...xs);
    const xMaxVal = Math.max(...xs);
    const yMinRaw = Math.min(...ys);
    const yMaxRaw = Math.max(...ys);
    const yPad = (yMaxRaw - yMinRaw) * 0.1 || 1;
    const yMinVal = yMinRaw - yPad;
    const yMaxVal = yMaxRaw + yPad;

    const scaleX = (v: number) => PADDING.left + ((v - xMinVal) / (xMaxVal - xMinVal || 1)) * plotW;
    const scaleY = (v: number) => PADDING.top + plotH - ((v - yMinVal) / (yMaxVal - yMinVal || 1)) * plotH;

    // Build paths
    const pts = chartData.map((d) => ({ px: scaleX(d.x), py: scaleY(d.y) }));
    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px.toFixed(2)},${p.py.toFixed(2)}`).join(' ');
    const areaD = lineD + ` L${pts[pts.length - 1]!.px.toFixed(2)},${(PADDING.top + plotH).toFixed(2)} L${pts[0]!.px.toFixed(2)},${(PADDING.top + plotH).toFixed(2)} Z`;

    // X ticks (4 evenly spaced)
    const xTickArr: number[] = [];
    for (let i = 0; i < 4; i++) {
      xTickArr.push(xMinVal + (i / 3) * (xMaxVal - xMinVal));
    }

    // Y ticks (nice rounded)
    const step = niceStep(yMaxVal - yMinVal, 4);
    const yStart = Math.ceil(yMinVal / step) * step;
    const yTickArr: number[] = [];
    for (let v = yStart; v <= yMaxVal; v += step) {
      yTickArr.push(v);
    }

    return { linePath: lineD, areaPath: areaD, xTicks: xTickArr, yTicks: yTickArr, yMin: yMinVal, yMax: yMaxVal, xMin: xMinVal, xMax: xMaxVal };
  }, [chartData, plotW, plotH]);

  const scaleX = (v: number) => PADDING.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const scaleY = (v: number) => PADDING.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.cardLabel}>{title}</Text>
        {variation !== null && (
          <Text style={[styles.variation, variation >= 0 ? styles.positive : styles.negative]}>
            {variation >= 0 ? '+' : ''}{variation.toFixed(2)} %
          </Text>
        )}
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}>
            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart or empty state */}
      {chartData.length < 2 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Pas encore assez de données</Text>
          <Text style={styles.emptyHint}>Les cours seront enregistrés automatiquement</Text>
        </View>
      ) : (
        <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 340 ${CHART_HEIGHT}`}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {/* Y grid lines + labels */}
          <G>
            {yTicks.map((t) => {
              const y = scaleY(t);
              return (
                <G key={`y-${t}`}>
                  <SvgLine x1={PADDING.left} y1={y} x2={340 - PADDING.right} y2={y} stroke={OrTrackColors.border} strokeDasharray="4" strokeWidth={1} />
                  <SvgText x={PADDING.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill={OrTrackColors.subtext}>
                    {`${Math.round(t)}€`}
                  </SvgText>
                </G>
              );
            })}
          </G>

          {/* X axis line */}
          <SvgLine x1={PADDING.left} y1={PADDING.top + plotH} x2={340 - PADDING.right} y2={PADDING.top + plotH} stroke={OrTrackColors.border} strokeWidth={1} />

          {/* X tick labels */}
          <G>
            {xTicks.map((t) => (
              <SvgText key={`x-${t}`} x={scaleX(t)} y={PADDING.top + plotH + 16} textAnchor="middle" fontSize={9} fill={OrTrackColors.subtext}>
                {formatLabel(t, period)}
              </SvgText>
            ))}
          </G>

          {/* Area fill */}
          <Path d={areaPath} fill={`url(#${gradId})`} />

          {/* Line stroke */}
          <Path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11,
    color: OrTrackColors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  variation: {
    fontSize: 13,
    fontWeight: '600',
  },
  positive: { color: '#4CAF50' },
  negative: { color: '#E07070' },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  periodBtnActive: {
    borderColor: OrTrackColors.gold,
    backgroundColor: 'rgba(201, 168, 76, 0.15)',
  },
  periodText: {
    fontSize: 12,
    fontWeight: '500',
    color: OrTrackColors.subtext,
  },
  periodTextActive: {
    color: OrTrackColors.gold,
  },
  emptyState: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: OrTrackColors.subtext,
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 12,
    color: OrTrackColors.tabIconDefault,
  },
});
