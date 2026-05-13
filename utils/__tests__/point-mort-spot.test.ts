import {
  calculerPointMortSpot,
  formatPointMortSpotGap,
  formatPointMortSpotPrice,
} from '../point-mort-spot';

// ─── calculerPointMortSpot — retours null ───────────────────────────────────

describe('calculerPointMortSpot — null', () => {
  it('retourne null si prixAchatTotal <= 0', () => {
    expect(
      calculerPointMortSpot({ prixAchatTotal: 0, poidsFinGrammes: 10, spotActuel: 80 }),
    ).toBeNull();
    expect(
      calculerPointMortSpot({ prixAchatTotal: -1, poidsFinGrammes: 10, spotActuel: 80 }),
    ).toBeNull();
  });

  it('retourne null si poidsFinGrammes <= 0', () => {
    expect(
      calculerPointMortSpot({ prixAchatTotal: 1000, poidsFinGrammes: 0, spotActuel: 80 }),
    ).toBeNull();
    expect(
      calculerPointMortSpot({ prixAchatTotal: 1000, poidsFinGrammes: -5, spotActuel: 80 }),
    ).toBeNull();
  });

  it('retourne null si prixAchatTotal est NaN ou Infinity', () => {
    expect(
      calculerPointMortSpot({ prixAchatTotal: NaN, poidsFinGrammes: 10, spotActuel: 80 }),
    ).toBeNull();
    expect(
      calculerPointMortSpot({
        prixAchatTotal: Infinity,
        poidsFinGrammes: 10,
        spotActuel: 80,
      }),
    ).toBeNull();
  });

  it('retourne null si poidsFinGrammes est NaN ou Infinity', () => {
    expect(
      calculerPointMortSpot({ prixAchatTotal: 1000, poidsFinGrammes: NaN, spotActuel: 80 }),
    ).toBeNull();
    expect(
      calculerPointMortSpot({
        prixAchatTotal: 1000,
        poidsFinGrammes: Infinity,
        spotActuel: 80,
      }),
    ).toBeNull();
  });
});

// ─── calculerPointMortSpot — spot indisponible ─────────────────────────────

describe('calculerPointMortSpot — spot indisponible', () => {
  const baseInputs = { prixAchatTotal: 9200, poidsFinGrammes: 100 };

  it('retourne spot_unavailable si spotActuel est absent', () => {
    const result = calculerPointMortSpot(baseInputs);
    expect(result).not.toBeNull();
    expect(result!.state).toBe('spot_unavailable');
    expect(result!.ecartPointMort).toBeNull();
    expect(result!.hasSpotActuel).toBe(false);
    expect(result!.pointMortSpot).toBe(92);
  });

  it('retourne spot_unavailable si spotActuel est null', () => {
    const result = calculerPointMortSpot({ ...baseInputs, spotActuel: null });
    expect(result!.state).toBe('spot_unavailable');
    expect(result!.ecartPointMort).toBeNull();
  });

  it('retourne spot_unavailable si spotActuel est NaN', () => {
    const result = calculerPointMortSpot({ ...baseInputs, spotActuel: NaN });
    expect(result!.state).toBe('spot_unavailable');
    expect(result!.ecartPointMort).toBeNull();
  });

  it('retourne spot_unavailable si spotActuel est Infinity', () => {
    const result = calculerPointMortSpot({ ...baseInputs, spotActuel: Infinity });
    expect(result!.state).toBe('spot_unavailable');
    expect(result!.ecartPointMort).toBeNull();
  });

  it('retourne spot_unavailable si spotActuel <= 0', () => {
    const zero = calculerPointMortSpot({ ...baseInputs, spotActuel: 0 });
    const neg = calculerPointMortSpot({ ...baseInputs, spotActuel: -5 });
    expect(zero!.state).toBe('spot_unavailable');
    expect(neg!.state).toBe('spot_unavailable');
  });
});

// ─── calculerPointMortSpot — états sous / proche / au-dessus ───────────────

describe('calculerPointMortSpot — états', () => {
  const baseInputs = { prixAchatTotal: 10000, poidsFinGrammes: 100 }; // pointMort = 100

  it("état 'near' si écart = -2 % (borne incluse)", () => {
    const result = calculerPointMortSpot({ ...baseInputs, spotActuel: 98 });
    expect(result!.state).toBe('near');
    expect(result!.ecartPointMort).toBeCloseTo(-0.02, 10);
    expect(result!.hasSpotActuel).toBe(true);
  });

  it("état 'near' si écart = +2 % (borne incluse)", () => {
    const result = calculerPointMortSpot({ ...baseInputs, spotActuel: 102 });
    expect(result!.state).toBe('near');
    expect(result!.ecartPointMort).toBeCloseTo(0.02, 10);
  });

  it("état 'near' si écart = 0 %", () => {
    const result = calculerPointMortSpot({ ...baseInputs, spotActuel: 100 });
    expect(result!.state).toBe('near');
    expect(result!.ecartPointMort).toBe(0);
  });

  it("état 'below' si écart strictement < -2 %", () => {
    const result = calculerPointMortSpot({ ...baseInputs, spotActuel: 97 });
    expect(result!.state).toBe('below');
  });

  it("état 'above' si écart strictement > +2 %", () => {
    const result = calculerPointMortSpot({ ...baseInputs, spotActuel: 103 });
    expect(result!.state).toBe('above');
  });

  it('calcule pointMortSpot = prixAchatTotal / poidsFinGrammes', () => {
    const result = calculerPointMortSpot({
      prixAchatTotal: 9200,
      poidsFinGrammes: 100,
      spotActuel: 87,
    });
    expect(result!.pointMortSpot).toBe(92);
    expect(result!.ecartPointMort).toBeCloseTo(-0.0543, 4);
    expect(result!.state).toBe('below');
  });
});

// ─── formatPointMortSpotPrice ──────────────────────────────────────────────

describe('formatPointMortSpotPrice', () => {
  it('affiche 2 décimales si valeur < 50', () => {
    expect(formatPointMortSpotPrice(1.08)).toBe('1,08 €/g');
    expect(formatPointMortSpotPrice(1.999)).toBe('2,00 €/g');
    expect(formatPointMortSpotPrice(9.5)).toBe('9,50 €/g');
    expect(formatPointMortSpotPrice(9.99)).toBe('9,99 €/g');
    expect(formatPointMortSpotPrice(30.15)).toBe('30,15 €/g');
    expect(formatPointMortSpotPrice(31.5)).toBe('31,50 €/g');
    expect(formatPointMortSpotPrice(49.99)).toBe('49,99 €/g');
  });

  it('affiche sans décimale si valeur >= 50', () => {
    expect(formatPointMortSpotPrice(50)).toBe('50 €/g');
    expect(formatPointMortSpotPrice(91.5)).toBe('92 €/g');
    expect(formatPointMortSpotPrice(92)).toBe('92 €/g');
    expect(formatPointMortSpotPrice(87.7)).toBe('88 €/g');
  });

  it('respecte le currencySymbol passé en paramètre', () => {
    expect(formatPointMortSpotPrice(92, '€')).toBe('92 €/g');
    expect(formatPointMortSpotPrice(1.08, '€')).toBe('1,08 €/g');
  });
});

// ─── formatPointMortSpotGap ────────────────────────────────────────────────

describe('formatPointMortSpotGap', () => {
  it('formate l’écart négatif avec le signe moins U+2013', () => {
    const out = formatPointMortSpotGap(-0.054);
    expect(out).toBe('–5,4 %');
    expect(out.charCodeAt(0)).toBe(0x2013);
  });

  it('formate l’écart positif avec le signe +', () => {
    expect(formatPointMortSpotGap(0.054)).toBe('+5,4 %');
    expect(formatPointMortSpotGap(0.848)).toBe('+84,8 %');
  });

  it('formate l’écart nul sans signe', () => {
    expect(formatPointMortSpotGap(0)).toBe('0,0 %');
  });

  it('utilise une virgule comme séparateur décimal', () => {
    const out = formatPointMortSpotGap(-0.123);
    expect(out).toContain(',');
    expect(out).not.toContain('.');
  });

  it('arrondit à une décimale', () => {
    expect(formatPointMortSpotGap(-0.0543)).toBe('–5,4 %');
    expect(formatPointMortSpotGap(-0.0549)).toBe('–5,5 %');
    expect(formatPointMortSpotGap(0.025)).toMatch(/^\+2,5\s%$/);
  });

  it('rend un signe + cohérent pour les écarts faibles non nuls après arrondi', () => {
    expect(formatPointMortSpotGap(0.0001)).toBe('0,0 %');
    expect(formatPointMortSpotGap(-0.0001)).toBe('0,0 %');
  });
});
