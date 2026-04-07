import { RadarSignal } from './types';

export function computePercentile(
  value: number,
  values: number[],
): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return 100;

  const sorted = [...values].sort((a, b) => a - b);
  const lastIndex = sorted.lastIndexOf(value);

  if (lastIndex === -1) {
    const insertionIndex = sorted.filter(v => v < value).length;
    const raw = Math.round((insertionIndex / (sorted.length - 1)) * 100);
    return Math.max(0, Math.min(100, raw));
  }

  return Math.round((lastIndex / (sorted.length - 1)) * 100);
}

export function deriveSignal(
  percentile: number | null,
  dataQualityIsOk: boolean,
): RadarSignal | null {
  if (!dataQualityIsOk || percentile === null) return null;
  if (percentile < 25) return 'low';
  if (percentile > 75) return 'high';
  return 'normal';
}

export function computeAvgMinMax(values: number[]): {
  avg: number | null;
  min: number | null;
  max: number | null;
} {
  if (values.length === 0) return { avg: null, min: null, max: null };
  const sum = values.reduce((s, v) => s + v, 0);
  return {
    avg: Math.round((sum / values.length) * 100) / 100,
    min: values.reduce((a, b) => Math.min(a, b), Infinity),
    max: values.reduce((a, b) => Math.max(a, b), -Infinity),
  };
}
