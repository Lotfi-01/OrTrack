export interface SparklinePoint {
  x: number;
  y: number;
  date: string;
  primePct: number;
}

/**
 * Converts prime data to SVG points.
 * Returns null if data.length < 7.
 */
export function computeSparklinePoints(
  data: { date: string; primePct: number }[],
  width: number,
  height: number,
  paddingY?: number,
): SparklinePoint[] | null {
  if (data.length < 7) return null;

  const pad = paddingY ?? 2;
  const values = data.map(d => d.primePct);
  const minVal = values.reduce((a, b) => Math.min(a, b), Infinity);
  const maxVal = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const range = maxVal - minVal || 1;

  return data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: pad + (height - 2 * pad) - ((d.primePct - minVal) / range) * (height - 2 * pad),
    date: d.date,
    primePct: d.primePct,
  }));
}

export function buildLinePath(points: SparklinePoint[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

export function buildAreaPath(points: SparklinePoint[], height: number): string {
  const line = buildLinePath(points);
  const lastX = points[points.length - 1]!.x.toFixed(1);
  const firstX = points[0]!.x.toFixed(1);
  return `${line} L${lastX},${height} L${firstX},${height} Z`;
}

/**
 * Finds the closest point to a touch X coordinate.
 * On exact tie, returns the left point.
 */
export function findClosestPoint(
  points: SparklinePoint[],
  touchX: number,
): SparklinePoint {
  let closest = points[0]!;
  let minDist = Math.abs(touchX - closest.x);

  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(touchX - points[i]!.x);
    if (dist < minDist) {
      minDist = dist;
      closest = points[i]!;
    }
  }

  return closest;
}
