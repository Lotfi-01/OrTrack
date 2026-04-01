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
