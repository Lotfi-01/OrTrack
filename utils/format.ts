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
  // Tolérance cohérente avec un affichage 2 décimales : <0,005 % → neutre sans signe
  if (Math.abs(pct) < 0.005) return '0 %';
  const abs = Math.abs(pct);
  const sign = pct >= 0 ? '+' : '';
  if (abs >= 100) return `${sign}${Math.round(pct)} %`;
  if (abs >= 1) return `${sign}${pct.toFixed(1).replace('.', ',')} %`;
  return `${sign}${pct.toFixed(2).replace('.', ',')} %`;
}

// ─── Gain / perte — source de vérité unique ─────────────────────────────────

export type GainState = 'positive' | 'negative' | 'zero';

export type GainDisplay = {
  /** Chaîne formatée avec signe si non-nul ("+123,45" / "-123,45" / "0,00"). Sans symbole de devise. */
  text: string;
  /** État sémantique pour la sélection de couleur. */
  state: GainState;
};

/**
 * Formate une valeur de gain/perte avec le signe et l'état sémantique.
 *
 * - `|value| < 0.005` → neutre : `"0,00"` sans signe, `state: 'zero'`
 *   (tolérance cohérente avec l'affichage 2 décimales et évite `+0,00` / `-0,00`
 *   dus aux résidus flottants).
 * - `value > 0` → `"+<montant>"`, `state: 'positive'`
 * - `value < 0` → `"<montant>"` (le signe `-` vient de `formatEuro`), `state: 'negative'`
 *
 * Utiliser `gainColor(state, colors)` côté rendu pour choisir la couleur.
 */
export function formatGain(value: number): GainDisplay {
  if (Math.abs(value) < 0.005) {
    return { text: formatEuro(0), state: 'zero' };
  }
  if (value > 0) {
    return { text: `+${formatEuro(value)}`, state: 'positive' };
  }
  return { text: formatEuro(value), state: 'negative' };
}

export function truncName(name: string, max = 20): string {
  if (name.length <= max) return name;
  const cut = name.lastIndexOf(' ', max);
  return (cut > 0 ? name.slice(0, cut) : name.slice(0, max)) + '\u2026';
}

/**
 * Mot français du métal utilisé pour l'affichage des noms de positions.
 * Source de vérité unique pour `stripMetalFromName` (compat legacy)
 * et `getDisplayPositionName` (injection du métal dans les titres).
 *
 * Ne PAS réutiliser `METAL_CONFIG.name` qui est une table de labels UI
 * couplée au rendu des chips et pourrait être renommée indépendamment
 * de cette logique d'affichage.
 */
export const METAL_DISPLAY_WORDS: Record<'or' | 'argent' | 'platine' | 'palladium', string> = {
  or: 'Or',
  argent: 'Argent',
  platine: 'Platine',
  palladium: 'Palladium',
};

const METAL_DISPLAY_WORDS_LIST = Object.values(METAL_DISPLAY_WORDS);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Retire au plus un mot de métal isolé d'un nom de position legacy.
 * - Affichage uniquement — n'altère jamais les données persistées.
 * - `undefined | null | "" | "   "` → `""`.
 * - Idempotent, sans flag `i`, sans substring matching.
 * - Un nom sans mot métal isolé est retourné tel quel.
 *
 * ⚠️ Déprécié pour les chemins Accueil / Portefeuille : utiliser
 * `getDisplayPositionName` à la place, qui rend le métal explicite.
 * Conservé pour les autres écrans (Stats, Fiscalité) où le métal
 * est porté par un autre élément visuel.
 */
export const stripMetalFromName = (name?: string | null): string => {
  if (!name || !name.trim()) return '';
  for (const metal of METAL_DISPLAY_WORDS_LIST) {
    const escaped = escapeRegExp(metal);
    const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);
    if (regex.test(name)) {
      return name.replace(regex, '$1').replace(/\s{2,}/g, ' ').trim();
    }
  }
  return name;
};

/**
 * Retourne un nom de position prêt à l'affichage, avec le métal
 * rendu explicite après le premier mot si absent.
 *
 * - Si le nom contient déjà l'un des mots de `METAL_DISPLAY_WORDS`
 *   comme mot isolé → retourné tel quel (pas de duplication).
 * - Sinon → injection du label métal juste après le premier mot.
 * - Si le nom est un mot unique → le métal est ajouté à la fin.
 * - `undefined | null | "" | "   "` → `""`.
 *
 * Exemples :
 *   `{metal: 'platine', product: 'Lingot 100g'}` → "Lingot Platine 100g"
 *   `{metal: 'or',      product: 'Krugerrand 1oz'}` → "Krugerrand Or 1oz"
 *   `{metal: 'argent',  product: 'Lingot Argent 1kg'}` → "Lingot Argent 1kg" (inchangé)
 *   `{metal: 'or',      product: 'Souverain'}` → "Souverain Or"
 */
export const getDisplayPositionName = (
  position: { metal: 'or' | 'argent' | 'platine' | 'palladium'; product?: string | null },
): string => {
  const raw = position.product;
  if (!raw || !raw.trim()) return '';
  const name = raw.trim();

  // Règle stricte : si le nom contient déjà un mot métal isolé, ne rien changer.
  for (const word of METAL_DISPLAY_WORDS_LIST) {
    const escaped = escapeRegExp(word);
    const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);
    if (regex.test(name)) return name;
  }

  const metalWord = METAL_DISPLAY_WORDS[position.metal];
  if (!metalWord) return name;

  // Injection après le premier mot. Si le nom est un mot unique, on append.
  const firstSpaceIdx = name.indexOf(' ');
  if (firstSpaceIdx === -1) {
    return `${name} ${metalWord}`;
  }
  const firstWord = name.slice(0, firstSpaceIdx);
  const rest = name.slice(firstSpaceIdx); // inclut l'espace de tête
  return `${firstWord} ${metalWord}${rest}`;
};
