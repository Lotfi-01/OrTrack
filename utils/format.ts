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
