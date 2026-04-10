import {
  formatEuro,
  formatPct,
  formatG,
  formatQty,
  formatTimeFR,
  formatDateFR,
  formatLongDateFR,
  formatInt,
  formatShortDateFR,
  formatMonthShortFR,
  stripMetalFromName,
  getDisplayPositionName,
  formatGain,
  formatPctSigned,
} from '../format';

// ─── formatEuro ─────────────────────────────────────────────────────────────

describe('formatEuro', () => {
  it('formate un entier', () => {
    expect(formatEuro(1000)).toBe('1\u202F000,00');
  });

  it('formate un décimal', () => {
    expect(formatEuro(1234.56)).toBe('1\u202F234,56');
  });

  it('formate 0', () => {
    expect(formatEuro(0)).toBe('0,00');
  });

  it('formate un grand nombre', () => {
    expect(formatEuro(1000000)).toBe('1\u202F000\u202F000,00');
  });

  it('arrondit à 2 décimales', () => {
    expect(formatEuro(1234.567)).toBe('1\u202F234,57');
  });

  it('formate un nombre négatif', () => {
    expect(formatEuro(-500)).toBe('-500,00');
  });
});

// ─── formatPct ──────────────────────────────────────────────────────────────

describe('formatPct', () => {
  it('formate avec 1 décimale par défaut', () => {
    expect(formatPct(12.345)).toBe('12,3 %');
  });

  it('formate avec 2 décimales', () => {
    expect(formatPct(12.345, 2)).toBe('12,35 %');
  });

  it('formate 0', () => {
    expect(formatPct(0)).toBe('0,0 %');
  });

  it('formate un négatif', () => {
    expect(formatPct(-5.5)).toBe('-5,5 %');
  });
});

// ─── formatG ────────────────────────────────────────────────────────────────

describe('formatG', () => {
  it('formate un entier en grammes', () => {
    expect(formatG(100)).toBe('100 g');
  });

  it('formate un décimal en grammes avec 2 décimales', () => {
    expect(formatG(31.10)).toBe('31,10 g');
  });

  it('convertit en kg au-dessus de 1000g', () => {
    expect(formatG(1000)).toBe('1 kg');
  });

  it('convertit 1500g en kg', () => {
    expect(formatG(1500)).toBe('1,5 kg');
  });

  it('formate 0,50g avec 2 décimales', () => {
    expect(formatG(0.5)).toBe('0,50 g');
  });
});

// ─── formatQty ──────────────────────────────────────────────────────────────

describe('formatQty', () => {
  it('formate un entier sans décimale', () => {
    expect(formatQty(5)).toBe('5');
  });

  it('formate un décimal avec 2 décimales', () => {
    expect(formatQty(2.5)).toBe('2,50');
  });
});

// ─── formatInt ──────────────────────────────────────────────────────────────

describe('formatInt', () => {
  it('formate avec séparateur de milliers', () => {
    expect(formatInt(1234)).toBe('1\u202F234');
  });

  it('arrondit', () => {
    expect(formatInt(1234.7)).toBe('1\u202F235');
  });

  it('formate 0', () => {
    expect(formatInt(0)).toBe('0');
  });
});

// ─── formatTimeFR ───────────────────────────────────────────────────────────

describe('formatTimeFR', () => {
  it('formate avec zéros', () => {
    const d = new Date(2024, 0, 1, 9, 5);
    expect(formatTimeFR(d)).toBe('09:05');
  });

  it('formate sans zéros', () => {
    const d = new Date(2024, 0, 1, 14, 30);
    expect(formatTimeFR(d)).toBe('14:30');
  });
});

// ─── formatDateFR ───────────────────────────────────────────────────────────

describe('formatDateFR', () => {
  it('formate une date en français', () => {
    const d = new Date(2024, 2, 15);
    expect(formatDateFR(d)).toBe('15 mars 2024');
  });
});

// ─── formatShortDateFR ──────────────────────────────────────────────────────

describe('formatShortDateFR', () => {
  it('formate JJ/MM', () => {
    const d = new Date(2024, 2, 5);
    expect(formatShortDateFR(d)).toBe('05/03');
  });
});

// ─── formatMonthShortFR ─────────────────────────────────────────────────────

describe('formatMonthShortFR', () => {
  it('retourne le mois court en français', () => {
    expect(formatMonthShortFR(new Date(2024, 0, 1))).toBe('janv.');
    expect(formatMonthShortFR(new Date(2024, 2, 1))).toBe('mars');
    expect(formatMonthShortFR(new Date(2024, 11, 1))).toBe('déc.');
  });
});

// ─── stripMetalFromName ─────────────────────────────────────────────────────

describe('stripMetalFromName', () => {
  it('retire "Argent" au milieu du nom', () => {
    expect(stripMetalFromName('Philharmonique Argent 1oz')).toBe('Philharmonique 1oz');
  });

  it('retire "Platine" au milieu du nom', () => {
    expect(stripMetalFromName('Lingot Platine 100g')).toBe('Lingot 100g');
  });

  it('retire "Or" au milieu du nom', () => {
    expect(stripMetalFromName('Lingot Or 250g')).toBe('Lingot 250g');
  });

  it('retire "Palladium" au milieu du nom', () => {
    expect(stripMetalFromName('Lingot Palladium 100g')).toBe('Lingot 100g');
  });

  it('laisse inchangé un nom déjà propre', () => {
    expect(stripMetalFromName('Krugerrand 1oz')).toBe('Krugerrand 1oz');
    expect(stripMetalFromName('Philharmonique 1oz')).toBe('Philharmonique 1oz');
  });

  it('ne corrompt pas "Kangourou" (contient "ou" pas "or")', () => {
    expect(stripMetalFromName('Kangourou 1oz')).toBe('Kangourou 1oz');
  });

  it('ne corrompt pas "Souverain"', () => {
    expect(stripMetalFromName('Souverain')).toBe('Souverain');
  });

  it('est idempotent', () => {
    const once = stripMetalFromName('Maple Leaf Argent 1oz');
    const twice = stripMetalFromName(once);
    expect(once).toBe('Maple Leaf 1oz');
    expect(twice).toBe('Maple Leaf 1oz');
  });

  it('normalise les doubles espaces après suppression', () => {
    // "Lingot  Argent  1kg" (double espaces) → "Lingot 1kg"
    expect(stripMetalFromName('Lingot Argent  1kg')).toBe('Lingot 1kg');
  });

  it('retourne "" pour undefined', () => {
    expect(stripMetalFromName(undefined)).toBe('');
  });

  it('retourne "" pour null', () => {
    expect(stripMetalFromName(null)).toBe('');
  });

  it('retourne "" pour chaîne vide', () => {
    expect(stripMetalFromName('')).toBe('');
  });

  it('retourne "" pour chaîne d\u2019espaces', () => {
    expect(stripMetalFromName('   ')).toBe('');
  });

  it('ne matche pas en mode insensible à la casse', () => {
    // "argent" minuscule ne doit PAS être retiré (pas de flag i)
    expect(stripMetalFromName('Lingot argent 100g')).toBe('Lingot argent 100g');
  });

  it('retire le mot métal en début de chaîne', () => {
    expect(stripMetalFromName('Argent 1oz')).toBe('1oz');
  });

  it('retire le mot métal en fin de chaîne', () => {
    expect(stripMetalFromName('Lingot Argent')).toBe('Lingot');
  });

  it('retire au plus un seul mot métal (premier trouvé)', () => {
    // Cas rare mais documenté : deux mots métal → seul le premier (selon l'ordre de METAL_DISPLAY_WORDS) est retiré
    // 'Or' est vérifié avant 'Argent', donc 'Or' est retiré.
    expect(stripMetalFromName('Or Argent 1oz')).toBe('Argent 1oz');
  });
});

// ─── getDisplayPositionName ─────────────────────────────────────────────────

describe('getDisplayPositionName', () => {
  it('injecte "Platine" dans "Lingot 100g"', () => {
    expect(getDisplayPositionName({ metal: 'platine', product: 'Lingot 100g' })).toBe('Lingot Platine 100g');
  });

  it('injecte "Or" dans "Krugerrand 1oz"', () => {
    expect(getDisplayPositionName({ metal: 'or', product: 'Krugerrand 1oz' })).toBe('Krugerrand Or 1oz');
  });

  it('injecte "Argent" dans "Philharmonique 1oz"', () => {
    expect(getDisplayPositionName({ metal: 'argent', product: 'Philharmonique 1oz' })).toBe('Philharmonique Argent 1oz');
  });

  it('injecte "Palladium" dans "Lingot 50g"', () => {
    expect(getDisplayPositionName({ metal: 'palladium', product: 'Lingot 50g' })).toBe('Lingot Palladium 50g');
  });

  it('laisse inchangé un nom qui contient déjà le métal attendu', () => {
    expect(getDisplayPositionName({ metal: 'argent', product: 'Lingot Argent 1kg' })).toBe('Lingot Argent 1kg');
  });

  it('laisse inchangé un nom qui contient déjà "Platine"', () => {
    expect(getDisplayPositionName({ metal: 'platine', product: 'Lingot Platine 100g' })).toBe('Lingot Platine 100g');
  });

  it('laisse inchangé un nom qui contient un AUTRE mot métal (protection contre duplication)', () => {
    // Données incohérentes : position.metal = 'or' mais product contient "Argent"
    // On ne touche rien pour éviter "Lingot Or Argent 100g"
    expect(getDisplayPositionName({ metal: 'or', product: 'Lingot Argent 100g' })).toBe('Lingot Argent 100g');
  });

  it('est idempotent', () => {
    const pos = { metal: 'or' as const, product: 'Krugerrand 1oz' };
    const once = getDisplayPositionName(pos);
    const twice = getDisplayPositionName({ metal: 'or', product: once });
    expect(once).toBe('Krugerrand Or 1oz');
    expect(twice).toBe('Krugerrand Or 1oz');
  });

  it('append le métal pour un nom d\u2019un seul mot', () => {
    expect(getDisplayPositionName({ metal: 'or', product: 'Souverain' })).toBe('Souverain Or');
  });

  it('ne corrompt pas "Kangourou" (contient "ou" pas "or")', () => {
    expect(getDisplayPositionName({ metal: 'argent', product: 'Kangourou 1oz' })).toBe('Kangourou Argent 1oz');
  });

  it('retourne "" pour undefined', () => {
    expect(getDisplayPositionName({ metal: 'or', product: undefined })).toBe('');
  });

  it('retourne "" pour null', () => {
    expect(getDisplayPositionName({ metal: 'or', product: null })).toBe('');
  });

  it('retourne "" pour chaîne vide', () => {
    expect(getDisplayPositionName({ metal: 'or', product: '' })).toBe('');
  });

  it('retourne "" pour chaîne d\u2019espaces', () => {
    expect(getDisplayPositionName({ metal: 'or', product: '   ' })).toBe('');
  });

  it('ne matche pas en mode insensible à la casse', () => {
    // "argent" minuscule ≠ "Argent" → injecte quand même
    expect(getDisplayPositionName({ metal: 'argent', product: 'Lingot argent 100g' })).toBe('Lingot Argent argent 100g');
  });
});

// ─── formatGain ─────────────────────────────────────────────────────────────

describe('formatGain', () => {
  it('formate un gain positif avec signe +', () => {
    expect(formatGain(39.40)).toEqual({ text: '+39,40', state: 'positive' });
  });

  it('formate une perte avec signe -', () => {
    expect(formatGain(-154.70)).toEqual({ text: '-154,70', state: 'negative' });
  });

  it('formate zéro sans signe', () => {
    expect(formatGain(0)).toEqual({ text: '0,00', state: 'zero' });
  });

  it('traite les valeurs < 0,005 comme neutres (positif)', () => {
    expect(formatGain(0.004)).toEqual({ text: '0,00', state: 'zero' });
  });

  it('traite les valeurs > -0,005 comme neutres (négatif)', () => {
    expect(formatGain(-0.004)).toEqual({ text: '0,00', state: 'zero' });
  });

  it('traite 0,005 comme positif non-neutre', () => {
    expect(formatGain(0.005).state).toBe('positive');
  });

  it('formate les grands montants avec séparateur', () => {
    expect(formatGain(12345.67)).toEqual({ text: '+12\u202F345,67', state: 'positive' });
  });
});

// ─── formatPctSigned — tolerance zero ───────────────────────────────────────

describe('formatPctSigned tolerance', () => {
  it('renvoie "0 %" pour zéro strict', () => {
    expect(formatPctSigned(0)).toBe('0 %');
  });

  it('renvoie "0 %" pour une valeur < 0,005 (résidu flottant)', () => {
    expect(formatPctSigned(0.004)).toBe('0 %');
    expect(formatPctSigned(-0.003)).toBe('0 %');
  });

  it('garde le signe au-dessus du seuil', () => {
    expect(formatPctSigned(0.5)).toBe('+0,50 %');
    expect(formatPctSigned(-0.5)).toBe('-0,50 %');
  });
});
