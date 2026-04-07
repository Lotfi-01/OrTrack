import {
  computeSparklinePoints,
  buildLinePath,
  buildAreaPath,
  findClosestPoint,
  SparklinePoint,
} from '../sparkline-path';

// ── computeSparklinePoints ──────────────────────────────────────────────

describe('computeSparklinePoints', () => {
  const makeData = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      primePct: i * 2,
    }));

  test('data.length < 7 → null', () => {
    expect(computeSparklinePoints(makeData(6), 80, 24)).toBeNull();
  });

  test('data.length === 7 → returns 7 points', () => {
    const pts = computeSparklinePoints(makeData(7), 80, 24);
    expect(pts).not.toBeNull();
    expect(pts).toHaveLength(7);
  });

  test('first point x === 0', () => {
    const pts = computeSparklinePoints(makeData(10), 100, 40)!;
    expect(pts[0]!.x).toBe(0);
  });

  test('last point x === width', () => {
    const pts = computeSparklinePoints(makeData(10), 100, 40)!;
    expect(pts[pts.length - 1]!.x).toBe(100);
  });

  test('min value → y close to height - paddingY', () => {
    const data = [
      { date: '2025-01-01', primePct: 0 },
      { date: '2025-01-02', primePct: 5 },
      { date: '2025-01-03', primePct: 10 },
      { date: '2025-01-04', primePct: 15 },
      { date: '2025-01-05', primePct: 20 },
      { date: '2025-01-06', primePct: 25 },
      { date: '2025-01-07', primePct: 30 },
    ];
    const pts = computeSparklinePoints(data, 80, 24, 2)!;
    // Min value (0) → y should be close to height - pad = 22
    expect(pts[0]!.y).toBeCloseTo(22, 0);
  });

  test('max value → y close to paddingY', () => {
    const data = [
      { date: '2025-01-01', primePct: 0 },
      { date: '2025-01-02', primePct: 5 },
      { date: '2025-01-03', primePct: 10 },
      { date: '2025-01-04', primePct: 15 },
      { date: '2025-01-05', primePct: 20 },
      { date: '2025-01-06', primePct: 25 },
      { date: '2025-01-07', primePct: 30 },
    ];
    const pts = computeSparklinePoints(data, 80, 24, 2)!;
    // Max value (30) → y should be close to pad = 2
    expect(pts[6]!.y).toBeCloseTo(2, 0);
  });

  test('all identical values → no division by zero', () => {
    const data = Array.from({ length: 7 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      primePct: 5,
    }));
    const pts = computeSparklinePoints(data, 80, 24, 2);
    expect(pts).not.toBeNull();
    // All y should be valid numbers (not NaN)
    pts!.forEach(p => expect(Number.isFinite(p.y)).toBe(true));
  });

  test('custom paddingY respected', () => {
    const data = Array.from({ length: 7 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      primePct: i * 10,
    }));
    const pts = computeSparklinePoints(data, 80, 50, 10)!;
    // Max value → y should be close to paddingY = 10
    expect(pts[6]!.y).toBeCloseTo(10, 0);
    // Min value → y should be close to height - paddingY = 40
    expect(pts[0]!.y).toBeCloseTo(40, 0);
  });
});

// ── buildLinePath ────────────────────────────────────────────────────────

describe('buildLinePath', () => {
  test('2 points → M...L...', () => {
    const pts: SparklinePoint[] = [
      { x: 0, y: 10, date: 'a', primePct: 1 },
      { x: 80, y: 5, date: 'b', primePct: 2 },
    ];
    const path = buildLinePath(pts);
    expect(path).toBe('M0.0,10.0 L80.0,5.0');
  });

  test('starts with M, rest with L', () => {
    const pts: SparklinePoint[] = [
      { x: 0, y: 10, date: 'a', primePct: 1 },
      { x: 40, y: 8, date: 'b', primePct: 2 },
      { x: 80, y: 5, date: 'c', primePct: 3 },
    ];
    const path = buildLinePath(pts);
    expect(path.startsWith('M')).toBe(true);
    expect((path.match(/L/g) || []).length).toBe(2); // two L segments
  });

  test('coordinates rounded to 1 decimal', () => {
    const pts: SparklinePoint[] = [
      { x: 1.234, y: 5.678, date: 'a', primePct: 1 },
    ];
    expect(buildLinePath(pts)).toBe('M1.2,5.7');
  });
});

// ── buildAreaPath ────────────────────────────────────────────────────────

describe('buildAreaPath', () => {
  test('contains linePath + closure', () => {
    const pts: SparklinePoint[] = [
      { x: 0, y: 10, date: 'a', primePct: 1 },
      { x: 80, y: 5, date: 'b', primePct: 2 },
    ];
    const path = buildAreaPath(pts, 24);
    expect(path).toContain('M0.0,10.0 L80.0,5.0');
    expect(path).toContain('L80.0,24');
    expect(path).toContain('L0.0,24');
    expect(path.endsWith('Z')).toBe(true);
  });
});

// ── findClosestPoint ─────────────────────────────────────────────────────

describe('findClosestPoint', () => {
  const pts: SparklinePoint[] = [
    { x: 0, y: 10, date: 'a', primePct: 1 },
    { x: 40, y: 8, date: 'b', primePct: 2 },
    { x: 80, y: 5, date: 'c', primePct: 3 },
  ];

  test('touch at 0 → first point', () => {
    expect(findClosestPoint(pts, 0).date).toBe('a');
  });

  test('touch at width → last point', () => {
    expect(findClosestPoint(pts, 80).date).toBe('c');
  });

  test('touch near middle → closest point', () => {
    expect(findClosestPoint(pts, 42).date).toBe('b');
  });

  test('touch between two points → closest', () => {
    expect(findClosestPoint(pts, 55).date).toBe('b'); // 55 is 15 from 40, 25 from 80
  });

  test('exact tie → left point', () => {
    // Touch at exactly 20: distance to x=0 is 20, distance to x=40 is 20
    // Since we use strict < (not <=), the first found (left) wins
    expect(findClosestPoint(pts, 20).date).toBe('a');
  });
});
