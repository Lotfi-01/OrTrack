import { DataQuality } from './types';
import { getPrimeConfig } from '@/constants/prime-config';

function parseIsoDateUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function countGaps(dates: string[]): number {
  if (dates.length < 2) return 0;
  let gaps = 0;
  for (let i = 1; i < dates.length; i++) {
    const prev = parseIsoDateUtc(dates[i - 1]!);
    const curr = parseIsoDateUtc(dates[i]!);
    const deltaDays = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (deltaDays > 5) gaps++;
  }
  return gaps;
}

export function detectDataQuality(
  validHistory: { date: string; primePct: number }[] | null,
): DataQuality {
  if (!validHistory || validHistory.length === 0) return 'missing';
  const dates = validHistory.map(h => h.date);
  const gapCount = countGaps(dates);
  if (gapCount > 3) return 'gaps';
  if (validHistory.length < 7) return 'insufficient_history';
  return 'ok';
}

export function isValidRadarPoint(
  primePct: number,
  productId: string,
): boolean {
  const config = getPrimeConfig(productId);
  return primePct >= config.minPrimePct && primePct <= config.maxPrimePct;
}
