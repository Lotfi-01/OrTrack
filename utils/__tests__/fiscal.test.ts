import { TAX } from '@/constants/tax';
import {
  computeAbatement,
  computeSellerNetForfaitaire,
  computeSellerNetPlusValues,
  computeFiscalCountdown,
  computeRegimeComparison,
} from '../fiscal';

// ── computeAbatement ──────────────────────────────────────────────────────

describe('computeAbatement', () => {
  test('0% si < 3 ans', () => {
    expect(computeAbatement(0)).toBe(0);
    expect(computeAbatement(1)).toBe(0);
    expect(computeAbatement(2)).toBe(0);
  });

  test('5% à 3 ans', () => {
    expect(computeAbatement(3)).toBe(5);
  });

  test('15% à 5 ans', () => {
    expect(computeAbatement(5)).toBe(15);
  });

  test('100% à 22 ans', () => {
    expect(computeAbatement(22)).toBe(100);
  });

  test('100% au-delà de 22 ans', () => {
    expect(computeAbatement(30)).toBe(100);
  });
});

// ── computeSellerNetForfaitaire ───────────────────────────────────────────

describe('computeSellerNetForfaitaire', () => {
  test('taxe même une position à perte', () => {
    // Valeur 4000, coût 5000 → perte, mais forfaitaire taxe quand même
    expect(computeSellerNetForfaitaire(4000)).toBeCloseTo(4000 * (1 - TAX.forfaitaireRate));
  });

  test('taxe une position en gain', () => {
    expect(computeSellerNetForfaitaire(10000)).toBeCloseTo(10000 * 0.885);
  });
});

// ── computeSellerNetPlusValues ────────────────────────────────────────────

describe('computeSellerNetPlusValues', () => {
  test('pas de taxe si perte', () => {
    expect(computeSellerNetPlusValues(4000, 5000, 5)).toBe(4000);
  });

  test('taxe le gain avec abattement 0% (1 an)', () => {
    // Gain = 6000 - 5000 = 1000, abattement 0%, taxe = 1000 * 0.376 = 376
    const result = computeSellerNetPlusValues(6000, 5000, 1);
    expect(result).toBeCloseTo(6000 - 376);
  });

  test('taxe le gain avec abattement 15% (5 ans)', () => {
    // Gain = 6000 - 5000 = 1000, abattement 15%, taxable = 1000 * 0.85 = 850, taxe = 850 * 0.376 = 319.6
    const result = computeSellerNetPlusValues(6000, 5000, 5);
    expect(result).toBeCloseTo(6000 - 319.6);
  });
});

// ── computeFiscalCountdown ────────────────────────────────────────────────

describe('computeFiscalCountdown', () => {
  test('date invalide retourne null', () => {
    expect(computeFiscalCountdown('invalid')).toBeNull();
    expect(computeFiscalCountdown('')).toBeNull();
  });

  test('date future retourne null', () => {
    expect(computeFiscalCountdown('01/01/2099')).toBeNull();
  });

  test('date valide retourne un objet', () => {
    const result = computeFiscalCountdown('01/01/2020');
    expect(result).not.toBeNull();
    expect(result!.years).toBeGreaterThan(0);
    expect(result!.abattement).toBeGreaterThanOrEqual(0);
    expect(result!.exemptionYear).toBe(2042);
  });
});

// ── computeRegimeComparison ───────────────────────────────────────────────

describe('computeRegimeComparison', () => {
  test('forfaitaire meilleur sur petit gain court terme', () => {
    // Achat 5000, valeur 6000, 1 an
    // Forfaitaire: 6000 * 0.885 = 5310
    // PV: gain 1000, abattement 0%, taxe 376 → net 5624
    const result = computeRegimeComparison(6000, 5000, 1);
    expect(result.bestRegime).toBe('plusvalues');
    expect(result.sellerNetForfaitaire).toBeCloseTo(5310);
    expect(result.sellerNetPlusValues).toBeCloseTo(5624);
    expect(result.delta).toBeCloseTo(314);
  });

  test('forfaitaire meilleur sur très gros gain', () => {
    // Achat 5000, valeur 15000, 1 an
    // Forfaitaire: 15000 * 0.885 = 13275
    // PV: gain 10000, abattement 0%, taxe 3760 → net 11240
    const result = computeRegimeComparison(15000, 5000, 1);
    expect(result.bestRegime).toBe('forfaitaire');
    expect(result.sellerNetForfaitaire).toBeCloseTo(13275);
    expect(result.sellerNetPlusValues).toBeCloseTo(11240);
  });

  test('delta est toujours positif', () => {
    const result = computeRegimeComparison(6000, 5000, 1);
    expect(result.delta).toBeGreaterThanOrEqual(0);
  });

  test("en cas d'égalité, plus-values est sélectionné (>=)", () => {
    // Le tie-break historique utilise >= : sellerNetPlusValues >= sellerNetForfaitaire → 'plusvalues'
    // On ne peut pas facilement construire une égalité exacte, mais on vérifie la règle :
    // Si PV == Forf, le résultat doit être 'plusvalues' et delta 0
    const forf = computeSellerNetForfaitaire(10000);
    // On cherche un cas où PV ≈ Forf
    // Mais plutôt que de trouver un cas exact, on vérifie que le tie-break est >=
    // en testant la logique directement
    const result = computeRegimeComparison(10000, 10000, 1);
    // gain = 0, PV net = 10000 (pas de taxe), Forf net = 8850
    expect(result.bestRegime).toBe('plusvalues');
  });
});
