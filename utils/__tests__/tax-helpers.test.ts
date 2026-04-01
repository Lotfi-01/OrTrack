import { computeTax, parseDate, todayStr, calcYearsHeld } from '../tax-helpers';

// ─── parseDate ──────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parse une date JJ/MM/AAAA valide', () => {
    const d = parseDate('15/03/2024');
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(15);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getFullYear()).toBe(2024);
  });

  it('retourne null pour une date invalide (31 février)', () => {
    expect(parseDate('31/02/2026')).toBeNull();
  });

  it('retourne null pour une date invalide (30 février)', () => {
    expect(parseDate('30/02/2026')).toBeNull();
  });

  it("accepte le 29 février d'une année bissextile", () => {
    expect(parseDate('29/02/2024')).not.toBeNull();
  });

  it("rejette le 29 février d'une année non bissextile", () => {
    expect(parseDate('29/02/2025')).toBeNull();
  });

  it('retourne null pour un format incomplet', () => {
    expect(parseDate('15/03')).toBeNull();
    expect(parseDate('2024')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('retourne null pour des valeurs non numériques', () => {
    expect(parseDate('ab/cd/efgh')).toBeNull();
  });

  it('retourne null pour le mois 13', () => {
    expect(parseDate('15/13/2024')).toBeNull();
  });

  it('retourne null pour le jour 0', () => {
    expect(parseDate('00/03/2024')).toBeNull();
  });
});

// ─── todayStr ───────────────────────────────────────────────────────────────

describe('todayStr', () => {
  it('retourne une chaîne au format JJ/MM/AAAA', () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('est parsable par parseDate', () => {
    expect(parseDate(todayStr())).not.toBeNull();
  });
});

// ─── calcYearsHeld ──────────────────────────────────────────────────────────

describe('calcYearsHeld', () => {
  it('retourne 0 pour une détention < 1 an', () => {
    const from = new Date(2024, 0, 1);
    const to = new Date(2024, 6, 1);
    expect(calcYearsHeld(from, to)).toBe(0);
  });

  it('retourne 1 pour une détention de 1 an exact', () => {
    const from = new Date(2023, 0, 1);
    const to = new Date(2024, 0, 2);
    expect(calcYearsHeld(from, to)).toBe(1);
  });

  it('retourne 22 pour une détention de 22 ans', () => {
    const from = new Date(2002, 0, 1);
    const to = new Date(2024, 1, 1);
    expect(calcYearsHeld(from, to)).toBe(22);
  });

  it('retourne 0 si from = to', () => {
    const d = new Date(2024, 0, 1);
    expect(calcYearsHeld(d, d)).toBe(0);
  });
});

// ─── computeTax ─────────────────────────────────────────────────────────────

describe('computeTax', () => {
  it('calcule la taxe forfaitaire à 11,5%', () => {
    const result = computeTax(10000, 5000, 1);
    expect(result.forfaitaire).toBeCloseTo(1150, 2);
  });

  it('calcule la plus-value sans abattement (< 3 ans)', () => {
    const result = computeTax(10000, 5000, 1);
    expect(result.plusValue).toBe(5000);
    expect(result.abatement).toBe(0);
    expect(result.taxablePV).toBe(5000);
    expect(result.plusValuesTax).toBeCloseTo(5000 * 0.376, 2);
  });

  it("applique 5% d'abattement par an à partir de la 3e année", () => {
    const result = computeTax(10000, 5000, 5);
    expect(result.abatement).toBeCloseTo(0.15, 4);
    expect(result.taxablePV).toBeCloseTo(5000 * 0.85, 2);
  });

  it('exonère totalement après 22 ans', () => {
    const result = computeTax(10000, 5000, 22);
    expect(result.isExempt).toBe(true);
    expect(result.plusValuesTax).toBe(0);
    expect(result.abatement).toBe(1);
  });

  it('exonère aussi à 25 ans', () => {
    const result = computeTax(10000, 5000, 25);
    expect(result.isExempt).toBe(true);
    expect(result.plusValuesTax).toBe(0);
  });

  it('position en moins-value → TPV = 0, forfaitaire reste due', () => {
    const result = computeTax(4000, 5000, 5);
    expect(result.plusValue).toBe(-1000);
    expect(result.plusValuesTax).toBe(0);
    expect(result.forfaitaire).toBeCloseTo(460, 2);
  });

  it("vente au prix d'achat → TPV = 0", () => {
    const result = computeTax(5000, 5000, 5);
    expect(result.plusValue).toBe(0);
    expect(result.plusValuesTax).toBe(0);
  });

  it('vente à 0€ → tout à 0', () => {
    const result = computeTax(0, 5000, 5);
    expect(result.forfaitaire).toBe(0);
    expect(result.plusValuesTax).toBe(0);
  });

  it('3 ans exactement → 5% abattement (1 an)', () => {
    const result = computeTax(10000, 5000, 3);
    expect(result.abatement).toBeCloseTo(0.05, 4);
  });

  it('21 ans → 95% abattement, pas encore exonéré', () => {
    const result = computeTax(10000, 5000, 21);
    expect(result.isExempt).toBe(false);
    expect(result.abatement).toBeCloseTo(0.95, 4);
    expect(result.plusValuesTax).toBeGreaterThan(0);
  });
});
