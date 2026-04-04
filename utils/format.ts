const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const JOURS_FR = [
  'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi',
];
export { MOIS_FR, JOURS_FR };

export function formatEuro(value: number): string {
  const fixed = value.toFixed(2);
  const [int, dec] = fixed.split('.');
  const spaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return `${spaced},${dec}`;
}

export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace('.', ',')} %`;
}

export function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

export function formatG(value: number): string {
  if (value >= 1000) {
    const kg = (value / 1000).toFixed(3).replace(/\.?0+$/, '').replace('.', ',');
    return `${kg} kg`;
  }
  if (Number.isInteger(value)) return `${value} g`;
  return `${value.toFixed(2).replace('.', ',')} g`;
}

export function formatTimeFR(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDateFR(date: Date): string {
  return `${date.getDate()} ${MOIS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatLongDateFR(date: Date): string {
  return `${JOURS_FR[date.getDay()]} ${date.getDate()} ${MOIS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatInt(value: number): string {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
}

const MOIS_COURT_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];
export { MOIS_COURT_FR };

export function formatShortDateFR(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthShortFR(date: Date): string {
  return MOIS_COURT_FR[date.getMonth()];
}

export function formatDateShortFR(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MOIS_COURT_FR[date.getMonth()]} ${date.getFullYear()}`;
}

/** Percentage with sign and adaptive decimals: >=100% → 0 dec, >=1% → 1 dec, <1% → 2 dec */
export function formatPctSigned(pct: number): string {
  if (pct === 0) return '0 %';
  const abs = Math.abs(pct);
  const sign = pct >= 0 ? '+' : '';
  if (abs >= 100) return `${sign}${Math.round(pct)} %`;
  if (abs >= 1) return `${sign}${pct.toFixed(1).replace('.', ',')} %`;
  return `${sign}${pct.toFixed(2).replace('.', ',')} %`;
}

export function truncName(name: string, max = 20): string {
  if (name.length <= max) return name;
  const cut = name.lastIndexOf(' ', max);
  return (cut > 0 ? name.slice(0, cut) : name.slice(0, max)) + '\u2026';
}
