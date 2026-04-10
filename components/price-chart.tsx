import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Path, Line as SvgLine, G, Text as SvgText } from 'react-native-svg';

import { Ionicons } from '@expo/vector-icons';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { loadPriceHistory, type PricePoint, type HistoryPeriod, LONG_TERM_PERIODS } from '@/hooks/use-metal-history';
import { formatEuro, formatShortDateFR, formatMonthShortFR } from '@/utils/format';

type Metal = 'gold' | 'silver' | 'platinum' | 'palladium';
type Period = HistoryPeriod;

const PERIODS: { key: HistoryPeriod; label: string }[] = [
  { key: '1S', label: '1S' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '1A', label: '1A' },
  { key: '5A', label: '5A' },
  { key: '10A', label: '10A' },
  { key: '20A', label: '20A' },
];

const LINE_COLORS: Record<Metal, string> = {
  gold: OrTrackColors.gold,
  silver: '#A8A8B8',
  platinum: '#E0E0E0',
  palladium: '#CBA135',
};

const TITLES: Record<Metal, string> = {
  gold: 'Or (XAU)',
  silver: 'Argent (XAG)',
  platinum: 'Platine (XPT)',
  palladium: 'Palladium (XPD)',
};

const CHART_HEIGHT = 220;
const PADDING = { top: 10, bottom: 40, left: 55, right: 20 };

function formatLabel(ts: number, period: Period): string {
  const d = new Date(ts);
  if (period === '1S' || period === '1M' || period === '3M') {
    return formatShortDateFR(d);
  }
  if (period === '1A') {
    const month = formatMonthShortFR(d);
    const year = d.getFullYear().toString().slice(-2);
    return `${month} ${year}`;
  }
  // 5A, 10A, 20A → année uniquement
  return d.getFullYear().toString();
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

function formatDateFR(timestamp: number): string {
  const date = new Date(timestamp);
  const jour = date.getDate();
  const mois = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ][date.getMonth()];
  const annee = date.getFullYear();
  return `${jour} ${mois} ${annee}`;
}

export function PriceChart({ metal, currency = 'EUR', compact = false, height, onFullScreen }: { metal: Metal; currency?: string; compact?: boolean; height?: number; onFullScreen?: () => void }) {
  const gradIdRef = useRef(`grad-${metal}-${Math.random().toString(36).slice(2, 7)}`);
  const gradId = gradIdRef.current;
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const { isPeriodLocked: _isPeriodLocked, showPaywall } = usePremium();
  const isPeriodLocked = (_k: string) => false; // BYPASS PREMIUM - A RETIRER
  const [period, setPeriod] = useState<Period>('1S');
  const [touchIndex, setTouchIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const touchIndexRef = useRef<number | null>(null);
  const chartDataRef = useRef<{ x: number; y: number }[]>([]);
  const chartWidthRef = useRef<number>(340);
  const handleTouchRef = useRef<((x: number) => void) | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setPinnedIndex(null);
        handleTouchRef.current?.(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) =>
        handleTouchRef.current?.(evt.nativeEvent.locationX),
      onPanResponderRelease: () => {
        setPinnedIndex(touchIndexRef.current);
        setTouchIndex(null);
        touchIndexRef.current = null;
      },
      onPanResponderTerminate: () => {
        setPinnedIndex(touchIndexRef.current);
        setTouchIndex(null);
        touchIndexRef.current = null;
      },

    })
  ).current;

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    setPinnedIndex(null);
    touchIndexRef.current = null;
    loadPriceHistory(period, currency, metal).then(data => {
      if (!cancelled) {
        setHistory(data);
        setChartLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [period, currency, metal]);

  const chartData = useMemo(
    () => history.filter((pt) => (pt[metal] ?? 0) > 0).map((pt) => ({ x: pt.timestamp, y: pt[metal] ?? 0 })),
    [history, metal],
  );

  useEffect(() => {
    chartDataRef.current = chartData;
  }, [chartData]);

  const variation = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0]!.y;
    const last = chartData[chartData.length - 1]!.y;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
  }, [chartData]);

  const color = LINE_COLORS[metal];
  const isLongTerm = LONG_TERM_PERIODS.includes(period);
  const currencySymbol = isLongTerm ? '$' : currency === 'USD' ? '$' : currency === 'CHF' ? 'CHF' : '€';
  const title = TITLES[metal];

  // ── SVG layout computation ─────────────────────────────────────────────
  const chartHeight = height ?? (compact ? 200 : 380);
  const plotW = 340 - PADDING.left - PADDING.right;
  const plotH = chartHeight - PADDING.top - PADDING.bottom;

  const handleTouch = useCallback((screenX: number) => {
    const data = chartDataRef.current;
    if (data.length < 2) return;
    const vbX = (screenX / chartWidthRef.current) * 340;
    const plotX = vbX - PADDING.left;
    const ratio = Math.max(0, Math.min(1, plotX / plotW));
    const idx = Math.round(ratio * (data.length - 1));
    setTouchIndex(idx);
    touchIndexRef.current = idx;
  }, [plotW]);

  handleTouchRef.current = handleTouch;

  const { linePath, areaPath, xTicks, yTicks, yMin, yMax, xMin, xMax } = useMemo(() => {
    if (chartData.length < 2) {
      return { linePath: '', areaPath: '', xTicks: [] as number[], yTicks: [] as number[], yMin: 0, yMax: 1, xMin: 0, xMax: 1 };
    }

    const xs = chartData.map((d) => d.x);
    const ys = chartData.map((d) => d.y);
    const xMinVal = xs.reduce((a, b) => a < b ? a : b);
    const xMaxVal = xs.reduce((a, b) => a > b ? a : b);
    const yMinRaw = ys.reduce((a, b) => a < b ? a : b);
    const yMaxRaw = ys.reduce((a, b) => a > b ? a : b);
    const yPad = (yMaxRaw - yMinRaw) * 0.1 || 1;
    const yMinVal = yMinRaw - yPad;
    const yMaxVal = yMaxRaw + yPad;

    const scaleX = (v: number) => PADDING.left + ((v - xMinVal) / (xMaxVal - xMinVal || 1)) * plotW;
    const scaleY = (v: number) => PADDING.top + plotH - ((v - yMinVal) / (yMaxVal - yMinVal || 1)) * plotH;

    // Build paths
    const pts = chartData.map((d) => ({ px: scaleX(d.x), py: scaleY(d.y) }));
    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px.toFixed(2)},${p.py.toFixed(2)}`).join(' ');
    const areaD = lineD + ` L${pts[pts.length - 1]!.px.toFixed(2)},${(PADDING.top + plotH).toFixed(2)} L${pts[0]!.px.toFixed(2)},${(PADDING.top + plotH).toFixed(2)} Z`;

    // X ticks (3 evenly spaced)
    const xTickArr = [
      xMinVal,
      (xMinVal + xMaxVal) / 2,
      xMaxVal,
    ];

    // Y ticks (nice rounded)
    const step = niceStep(yMaxVal - yMinVal, 3);
    const yStart = Math.ceil(yMinVal / step) * step;
    const yTickArr: number[] = [];
    for (let v = yStart; v <= yMaxVal; v += step) {
      yTickArr.push(v);
    }

    return { linePath: lineD, areaPath: areaD, xTicks: xTickArr, yTicks: yTickArr, yMin: yMinVal, yMax: yMaxVal, xMin: xMinVal, xMax: xMaxVal };
  }, [chartData, plotW, plotH, compact]);

  const scaleX = (v: number) => PADDING.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const scaleY = (v: number) => PADDING.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const activeIdx = touchIndex ?? pinnedIndex;
  const safeIdx = (activeIdx !== null && activeIdx >= 0 && activeIdx < chartData.length)
    ? activeIdx : null;
  const displayPoint = safeIdx !== null ? chartData[safeIdx] : null;

  const prixActuel = chartData.length >= 2 ? chartData[chartData.length - 1]!.y : null;

  const variationInfo = displayPoint && prixActuel !== null ? (() => {
    const prixPoint = displayPoint.y;
    if (prixPoint === prixActuel) return null;
    const delta = prixActuel - prixPoint;
    const deltaPct = prixPoint !== 0 ? (delta / prixPoint) * 100 : 0;
    const signe = delta >= 0 ? '+' : '';
    const label = signe +
      formatEuro(delta) +
      ' ' + currencySymbol + ' (' + signe + deltaPct.toFixed(2).replace('.', ',') + ' %)';
    return { label, couleur: delta >= 0 ? '#4CAF50' : '#F44336' };
  })() : null;

  const yActuel = prixActuel !== null ? scaleY(prixActuel) : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.cardLabel}>{title}</Text>
          {variation !== null && (
            <Text style={{ fontSize: 10, color: OrTrackColors.subtext, marginTop: 2 }}>
              {displayPoint ? 'Performance totale sur la période' : 'Performance sur la période'}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {variation !== null && (
            <Text style={[styles.variation, variation >= 0 ? styles.positive : styles.negative]}>
              {variation >= 0 ? '+' : ''}{variation.toFixed(2).replace('.', ',')} %
            </Text>
          )}
          {onFullScreen && (
            <TouchableOpacity
              onPress={onFullScreen}
              style={{ padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="expand-outline" size={22} color="#C8A94E" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLongTerm && (
        <Text style={{ color: '#888', fontSize: 10, marginBottom: 4, textAlign: 'right', opacity: 0.7 }}>
          Cours en USD (source historique)
        </Text>
      )}


      {/* Period selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.periodRow, { marginHorizontal: -16 }]} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.periodBtn,
              period === p.key && styles.periodBtnActive,
              isPeriodLocked(p.key) && styles.periodBtnLocked,
            ]}
            onPress={() => {
              if (isPeriodLocked(p.key)) {
                showPaywall();
                return;
              }
              setPeriod(p.key);
            }}>
            <View style={styles.periodBtnContent}>
              <Text style={[
                styles.periodText,
                period === p.key && styles.periodTextActive,
                isPeriodLocked(p.key) && styles.periodTextLocked,
              ]}>
                {p.label}
              </Text>
              {isPeriodLocked(p.key) && (
                <Text style={styles.lockIcon}>🔒</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tooltip display */}
      <View style={styles.tooltipArea}>
        {displayPoint ? (
          <View style={styles.tooltipCompact}>
            <View style={styles.tooltipLine1}>
              <Text style={styles.tooltipCompactPrice}>
                {formatEuro(displayPoint.y)} {currencySymbol}
              </Text>
              {touchIndex === null && pinnedIndex !== null && (
                <TouchableOpacity onPress={() => setPinnedIndex(null)} style={styles.tooltipClose}>
                  <Text style={styles.tooltipCloseText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.tooltipLine2}>
              <Text style={styles.tooltipCompactDate}>
                {formatDateFR(displayPoint.x)}
              </Text>
            </View>
            {variationInfo && (
              <View style={{ marginTop: 2 }}>
                <Text style={{ fontSize: 9, color: OrTrackColors.subtext }}>Évolution depuis ce point</Text>
                <Text style={[styles.tooltipCompactVariation, { color: variationInfo.couleur }]}>
                  {variationInfo.label}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {/* Chart or empty state */}
      {chartLoading ? (
        <View style={{ height: chartHeight, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={OrTrackColors.gold} />
        </View>
      ) : chartData.length < 2 ? (
        <View style={[styles.emptyState, { height: chartHeight }]}>
          <Text style={styles.emptyText}>Pas encore assez de données</Text>
          <Text style={styles.emptyHint}>Les cours seront enregistrés automatiquement</Text>
        </View>
      ) : (
        <>
          <View
            onLayout={(e) => {
              chartWidthRef.current = e.nativeEvent.layout.width;
            }}
            {...panResponder.panHandlers}
          >
            <Svg width="100%" height={chartHeight} viewBox={`0 0 340 ${chartHeight}`}>
              <Defs>
                <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={color} stopOpacity={0.15} />
                  <Stop offset="100%" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {/* Y grid lines + labels */}
              <G>
                {yTicks.map((t) => {
                  const y = scaleY(t);
                  return (
                    <G key={`y-${t}`}>
                      <SvgLine x1={PADDING.left} y1={y} x2={340 - PADDING.right} y2={y} stroke={OrTrackColors.border} strokeDasharray="4" strokeWidth={1} />
                      <SvgText x={PADDING.left - 6} y={y + 3} textAnchor="end" fontSize={11} fill={OrTrackColors.subtext}>
                        {`${Math.round(t)}${currencySymbol}`}
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
                  <SvgText key={`x-${t}`} x={scaleX(t)} y={PADDING.top + plotH + 16} textAnchor="middle" fontSize={11} fill={OrTrackColors.subtext}>
                    {formatLabel(t, period)}
                  </SvgText>
                ))}
              </G>

              {/* Area fill */}
              <Path d={areaPath} fill={`url(#${gradId})`} />

              {/* Line stroke */}
              <Path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

              {/* Current price horizontal line */}
              {yActuel !== null && (
                <SvgLine
                  x1={0}
                  x2={340}
                  y1={yActuel}
                  y2={yActuel}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={1}
                  strokeDasharray={[4, 4]}
                />
              )}

              {/* Touch crosshair + dot */}
              {safeIdx !== null && (() => {
                const pt = chartData[safeIdx]!;
                const px = scaleX(pt.x);
                const py = scaleY(pt.y);
                return (
                  <G>
                    <SvgLine
                      x1={px} y1={PADDING.top}
                      x2={px} y2={PADDING.top + plotH}
                      stroke={color} strokeWidth={1}
                      strokeDasharray="4" opacity={0.5}
                    />
                    <Circle cx={px} cy={py} r={7}
                      fill={color} opacity={0.2} />
                    <Circle cx={px} cy={py} r={3.5}
                      fill={color} />
                  </G>
                );
              })()}
            </Svg>
          </View>

          {/* Min / Max */}
          {chartData.length >= 2 && (() => {
            const dataMin = chartData.reduce((a, b) => a.y < b.y ? a : b).y;
            const dataMax = chartData.reduce((a, b) => a.y > b.y ? a : b).y;
            return (
              <View style={styles.minMaxRow}>
                <Text style={styles.minMaxMin}>
                  MIN {formatEuro(dataMin)} {currencySymbol}
                </Text>
                <Text style={styles.minMaxMax}>
                  MAX {formatEuro(dataMax)} {currencySymbol}
                </Text>
              </View>
            );
          })()}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    paddingTop: 10,
    paddingBottom: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
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
  periodBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  periodTextLocked: {
    color: OrTrackColors.tabIconDefault,
  },
  periodBtnLocked: {
    borderColor: OrTrackColors.border,
    opacity: 0.6,
  },
  lockIcon: {
    fontSize: 10,
    lineHeight: 12,
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
  tooltipArea: {
    minHeight: 28,
    justifyContent: 'center',
    marginBottom: 8,
  },
  tooltipCompact: {
    marginBottom: 4,
  },
  tooltipLine1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tooltipLine2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 1,
  },
  tooltipCompactPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: OrTrackColors.white,
  },
  tooltipCompactDate: {
    fontSize: 11,
    color: OrTrackColors.subtext,
  },
  tooltipCompactVariation: {
    fontSize: 11,
    fontWeight: '600',
  },
  tooltipClose: {
    padding: 4,
  },
  tooltipCloseText: {
    fontSize: 12,
    color: OrTrackColors.subtext,
    opacity: 0.6,
  },
  minMaxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  minMaxMin: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E07070',
  },
  minMaxMax: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
  },
});
