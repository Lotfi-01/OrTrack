/**
 * Formate un pourcentage en français : 4.8 → "+4,8 %"
 * NE PAS utiliser formatEuro pour les pourcentages.
 */
export function formatPct(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1).replace('.', ',')} %`;
}

/**
 * Formate une date en "il y a X" relatif.
 * "2026-03-27" → "à l'instant" / "3h" / "hier" / "2j"
 */
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString + 'T12:00:00');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffH = Math.floor(diffMs / 3600000);

  if (diffH < 1) return 'à l\'instant';
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'hier';
  return `${diffD}j`;
}
