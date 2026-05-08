import type { Position } from '@/types/position';
import { getSpot } from '@/constants/metals';
import { computePositionCost, computePositionValue } from '@/utils/position-calc';
import { calcYearsHeld, computeTax, parseDate } from '@/utils/tax-helpers';
import { REGIME_EQUALITY_THRESHOLD, isGainFiscalEligiblePosition } from '@/utils/fiscal';
import { computeGlobalFiscalScenario } from '../fiscal-scenarios';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makePos(overrides: Partial<Position> = {}): Position {
  return {
    id: overrides.id ?? 'p1',
    metal: overrides.metal ?? 'or',
    product: overrides.product ?? 'Napoléon 20F',
    weightG: overrides.weightG ?? 31.1,
    quantity: overrides.quantity ?? 1,
    purchasePrice: overrides.purchasePrice ?? 1000,
    purchaseDate: overrides.purchaseDate ?? '01/01/2020',
    createdAt: overrides.createdAt ?? '2020-01-01T00:00:00.000Z',
    note: overrides.note,
    spotAtPurchase: overrides.spotAtPurchase,
  };
}

const PRICES_ALL_OK = { gold: 2500, silver: 1000, platinum: 800, palladium: 700 };

function dateAt(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

// ── 0. Test de parité avec la logique de fiscalite-globale.tsx ────────────
//
// Reproduit la logique du useMemo principal dans le test, puis compare
// avec computeGlobalFiscalScenario sur un portefeuille représentatif.

describe('computeGlobalFiscalScenario — parité avec fiscalite-globale.tsx', () => {
  test('agrégats identiques pour un portefeuille représentatif', () => {
    const positions: Position[] = [
      makePos({ id: 'p1', metal: 'or', purchasePrice: 1000, purchaseDate: '01/01/2020' }),
      makePos({ id: 'p2', metal: 'argent', purchasePrice: 500, weightG: 31.1, purchaseDate: '15/06/2018' }),
      makePos({ id: 'p3', metal: 'platine', purchasePrice: 800, purchaseDate: '20/03/2002' }),
      makePos({ id: 'p4', metal: 'or', purchasePrice: 5000, purchaseDate: '10/05/2024' }),
      makePos({ id: 'p5', metal: 'palladium', purchasePrice: 0, purchaseDate: '01/01/2021' }),
      makePos({ id: 'p6', metal: 'or', purchasePrice: 1000, purchaseDate: 'invalid-date' }),
      makePos({ id: 'p7', metal: 'argent', purchasePrice: 100, purchaseDate: '01/01/2030' }),
    ];
    const prices = PRICES_ALL_OK;
    const simulatedDate = dateAt(2026, 1, 15);

    // ── Référence : reproduire la logique du useMemo de fiscalite-globale.tsx
    type RefRow = {
      salePrice: number;
      forfaitaire: number;
      plusValuesTax: number;
    };
    const refComputed: RefRow[] = [];
    let refExcluded = 0;
    for (const pos of positions) {
      if (!isGainFiscalEligiblePosition(pos)) { refExcluded++; continue; }
      const spot = getSpot(pos.metal, prices);
      const sv = computePositionValue(pos, spot);
      if (sv === null) { refExcluded++; continue; }
      const purchaseDateParsed = parseDate(pos.purchaseDate);
      if (purchaseDateParsed === null) { refExcluded++; continue; }
      if (simulatedDate.getTime() < purchaseDateParsed.getTime()) { refExcluded++; continue; }
      const costPrice = computePositionCost(pos);
      const years = calcYearsHeld(purchaseDateParsed, simulatedDate);
      const tax = computeTax(sv, costPrice, years);
      refComputed.push({ salePrice: sv, forfaitaire: tax.forfaitaire, plusValuesTax: tax.plusValuesTax });
    }
    const refTotalSalePrice = refComputed.reduce((s, r) => s + r.salePrice, 0);
    const refTotalForfaitaire = refComputed.reduce((s, r) => s + r.forfaitaire, 0);
    const refTotalPlusValuesTax = refComputed.reduce((s, r) => s + r.plusValuesTax, 0);
    const refNetForf = refTotalSalePrice - refTotalForfaitaire;
    const refNetPV = refTotalSalePrice - refTotalPlusValuesTax;
    const refDelta = Math.abs(refNetPV - refNetForf);
    const refIsEquality = refDelta < REGIME_EQUALITY_THRESHOLD;
    const refBestGlobalRegime: 'forfaitaire' | 'plusvalues' | null = refIsEquality
      ? null
      : refNetPV > refNetForf
        ? 'plusvalues'
        : 'forfaitaire';
    const refHeroNet = refBestGlobalRegime === 'plusvalues' ? refNetPV : refNetForf;

    // ── Sous test
    const actual = computeGlobalFiscalScenario({ positions, prices, simulatedDate });

    // ── Comparaisons (tolérance 0.01 € pour montants, strict pour le reste)
    expect(actual.totalSalePrice).toBeCloseTo(refTotalSalePrice, 2);
    expect(actual.totalForfaitaireTax).toBeCloseTo(refTotalForfaitaire, 2);
    expect(actual.totalPlusValuesTax).toBeCloseTo(refTotalPlusValuesTax, 2);
    expect(actual.netForfaitaire).toBeCloseTo(refNetForf, 2);
    expect(actual.netPlusValues).toBeCloseTo(refNetPV, 2);
    expect(actual.delta).toBeCloseTo(refDelta, 2);
    expect(actual.heroNet).toBeCloseTo(refHeroNet, 2);
    expect(actual.computed).toHaveLength(refComputed.length);
    expect(actual.excluded).toHaveLength(refExcluded);

    // Mapping : null (écran actuel) ↔ 'equal' (type GlobalFiscalRegime)
    if (refBestGlobalRegime === null) {
      expect(actual.bestRegime).toBe('equal');
    } else {
      expect(actual.bestRegime).toBe(refBestGlobalRegime);
    }
  });
});

// ── 1. Scénario simple forfaitaire ────────────────────────────────────────

describe('computeGlobalFiscalScenario — scénarios fonctionnels', () => {
  test('1. position simple, achat récent : forfaitaire taxé sur prix de vente', () => {
    const positions = [makePos({ id: 'a', metal: 'or', purchasePrice: 1000, purchaseDate: '01/01/2024' })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(1);
    expect(result.totalSalePrice).toBeGreaterThan(0);
    // forfaitaire = salePrice * 0.115
    expect(result.totalForfaitaireTax).toBeCloseTo(result.totalSalePrice * 0.115, 2);
    expect(result.netForfaitaire).toBeCloseTo(result.totalSalePrice * 0.885, 2);
  });

  // ── 2. Scénario plus-values (moins-value : PV taxe = 0, forfaitaire taxe quand même)

  test('2. position en moins-value : plusValuesTax = 0, forfaitaire taxé', () => {
    const positions = [makePos({ id: 'b', metal: 'or', weightG: 31.1, quantity: 1, purchasePrice: 5000, purchaseDate: '01/01/2024' })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    // salePrice = 1 * 31.1/31.10435 * 2500 ≈ 2499.65 < cost 5000 → moins-value
    expect(result.totalPlusValuesTax).toBe(0);
    expect(result.totalForfaitaireTax).toBeGreaterThan(0);
    // bestRegime global : plus-values plus avantageux (taxe 0)
    expect(result.bestRegime).toBe('plusvalues');
    expect(result.netPlusValues).toBeGreaterThan(result.netForfaitaire);
  });

  // ── 3. Égalité des régimes ──────────────────────────────────────────────

  test('3. égalité des régimes quand delta net < REGIME_EQUALITY_THRESHOLD', () => {
    // Construire une position où netForf ≈ netPV à moins de 1 €.
    // Stratégie : exonération 22 ans → plusValuesTax = 0 → netPV = salePrice ;
    // si on choisit purchasePrice tel que cost ≈ salePrice, le forfaitaire taxe
    // mais la différence reste > 1 €. Plus simple : utiliser un cas moins-value
    // exonéré (>22 ans) avec très petite valeur de salePrice où 11.5 % < 1 €.
    const positions = [
      makePos({
        id: 'eq',
        metal: 'or',
        weightG: 0.1,
        quantity: 1,
        purchasePrice: 100,
        purchaseDate: '01/01/2002',
      }),
    ];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    // salePrice ≈ 0.1 g * 2500 / 31.10435 ≈ 8.04 €
    // forfaitaire ≈ 0.92 €, plusValuesTax = 0 (exonéré)
    // delta = 0.92 < 1 → 'equal' au niveau global
    expect(result.bestRegime).toBe('equal');
    // heroNet par convention = netForfaitaire quand 'equal'
    expect(result.heroNet).toBeCloseTo(result.netForfaitaire, 2);
  });

  // ── 4. Exonération 22 ans ───────────────────────────────────────────────

  test('4. position détenue ≥ 22 ans : isExempt = true, plusValuesTax = 0', () => {
    const positions = [makePos({ id: 'old', purchaseDate: '01/01/2000' })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(1);
    expect(result.computed[0].isExempt).toBe(true);
    expect(result.computed[0].plusValuesTax).toBe(0);
  });

  // ── 5. Abattement intermédiaire ──────────────────────────────────────────

  test('5. position détenue 5 ans : abattement = 0.15 (3 ans × 5%)', () => {
    const positions = [makePos({ id: 'mid', purchasePrice: 1000, purchaseDate: '01/01/2021' })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(1);
    // 5 ans → abattement = (5 - 2) * 0.05 = 0.15
    expect(result.computed[0].years).toBe(5);
    expect(result.computed[0].abatement).toBeCloseTo(0.15, 5);
    expect(result.computed[0].isExempt).toBe(false);
  });

  // ── 6. Exclusion : prix d'achat invalide ─────────────────────────────────

  test('6. purchasePrice = 0 : exclusion invalid_purchase_price', () => {
    const positions = [makePos({ id: 'zero', purchasePrice: 0 })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0].reason).toBe('invalid_purchase_price');
    expect(result.excluded[0].positionId).toBe('zero');
  });

  // ── 7. Exclusion : spot manquant ─────────────────────────────────────────

  test('7. spot null pour le métal de la position : exclusion missing_spot_price', () => {
    const positions = [makePos({ id: 'nospot', metal: 'argent' })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: { gold: 2500, silver: null, platinum: 800, palladium: 700 },
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(0);
    expect(result.excluded[0].reason).toBe('missing_spot_price');
  });

  // ── 8. Exclusion : date d'achat invalide ────────────────────────────────

  test('8. purchaseDate non parsable : exclusion invalid_purchase_date', () => {
    const positions = [makePos({ id: 'baddate', purchaseDate: 'pas une date' })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(0);
    expect(result.excluded[0].reason).toBe('invalid_purchase_date');
  });

  // ── 9. Exclusion : date simulée avant achat ──────────────────────────────

  test('9. simulatedDate < purchaseDate : exclusion simulated_date_before_purchase', () => {
    const positions = [makePos({ id: 'future', purchaseDate: '01/01/2030' })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(0);
    expect(result.excluded[0].reason).toBe('simulated_date_before_purchase');
  });

  // ── 10. Agrégation multi-positions ──────────────────────────────────────

  test('10. agrégation : sommes correctes sur 3 positions', () => {
    const positions = [
      makePos({ id: 'a', metal: 'or', purchasePrice: 1000, purchaseDate: '01/01/2024' }),
      makePos({ id: 'b', metal: 'argent', purchasePrice: 100, purchaseDate: '01/01/2023' }),
      makePos({ id: 'c', metal: 'platine', purchasePrice: 200, purchaseDate: '01/01/2022' }),
    ];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(3);
    const sumSale = result.computed.reduce((s, r) => s + r.salePrice, 0);
    expect(result.totalSalePrice).toBeCloseTo(sumSale, 2);
    const sumForf = result.computed.reduce((s, r) => s + r.forfaitaireTax, 0);
    expect(result.totalForfaitaireTax).toBeCloseTo(sumForf, 2);
  });

  // ── 11. Aucune position éligible ────────────────────────────────────────

  test('11. aucune position éligible : agrégats à 0, bestRegime = "equal"', () => {
    const positions = [
      makePos({ id: 'z', purchasePrice: 0 }),
      makePos({ id: 'b', purchaseDate: 'invalid' }),
    ];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(0);
    expect(result.eligiblePositionsCount).toBe(0);
    expect(result.excludedPositionsCount).toBe(2);
    expect(result.totalSalePrice).toBe(0);
    expect(result.totalForfaitaireTax).toBe(0);
    expect(result.totalPlusValuesTax).toBe(0);
    expect(result.netForfaitaire).toBe(0);
    expect(result.netPlusValues).toBe(0);
    expect(result.delta).toBe(0);
    expect(result.bestRegime).toBe('equal');
    expect(result.heroNet).toBe(0);
  });

  // ── 12. Déterminisme ────────────────────────────────────────────────────

  test('12. déterminisme : 2 appels avec mêmes inputs → mêmes outputs', () => {
    const positions = [
      makePos({ id: 'a', purchasePrice: 1000, purchaseDate: '01/01/2020' }),
      makePos({ id: 'b', metal: 'argent', purchasePrice: 200, purchaseDate: '01/01/2018' }),
    ];
    const simulatedDate = dateAt(2026, 1, 1);
    const r1 = computeGlobalFiscalScenario({ positions, prices: PRICES_ALL_OK, simulatedDate });
    const r2 = computeGlobalFiscalScenario({ positions, prices: PRICES_ALL_OK, simulatedDate });
    expect(r1.totalSalePrice).toBe(r2.totalSalePrice);
    expect(r1.totalForfaitaireTax).toBe(r2.totalForfaitaireTax);
    expect(r1.totalPlusValuesTax).toBe(r2.totalPlusValuesTax);
    expect(r1.heroNet).toBe(r2.heroNet);
    expect(r1.bestRegime).toBe(r2.bestRegime);
    expect(r1.computed).toHaveLength(r2.computed.length);
  });

  // ── 13. years évolue avec simulatedDate ─────────────────────────────────

  test('13. years augmente avec simulatedDate ; exonération atteinte au-delà de 22 ans', () => {
    const positions = [makePos({ id: 't', purchaseDate: '01/01/2020' })];
    const r2026 = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    const r2027 = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2027, 1, 1),
    });
    const r2042 = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2042, 1, 2),
    });
    expect(r2026.computed[0].years).toBe(6);
    expect(r2027.computed[0].years).toBe(7);
    expect(r2042.computed[0].isExempt).toBe(true);
    expect(r2042.computed[0].plusValuesTax).toBe(0);
  });

  // ── 14. salePrice indépendant de simulatedDate ──────────────────────────

  test('14. salePrice identique pour différentes simulatedDate (spot fixe)', () => {
    const positions = [makePos({ id: 's' })];
    const r1 = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    const r2 = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2030, 6, 15),
    });
    expect(r1.computed[0].salePrice).toBeCloseTo(r2.computed[0].salePrice, 6);
  });

  // ── 15. bestRegime position vs global ───────────────────────────────────

  test('15. bestRegime par position peut diverger du bestRegime global', () => {
    // p1 : achat récent élevé (cost > value) → moins-value → PV avantageux
    // p2 : achat très ancien (>22 ans) avec gain → exonéré → PV avantageux
    // Les deux favorisent PV → global = PV.
    const positions = [
      makePos({ id: 'p1', metal: 'or', weightG: 31.1, quantity: 1, purchasePrice: 5000, purchaseDate: '01/01/2024' }),
      makePos({ id: 'p2', metal: 'or', weightG: 31.1, quantity: 1, purchasePrice: 100, purchaseDate: '01/01/2000' }),
    ];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(2);
    // p1 en moins-value → plusValuesTax = 0 → 'plusvalues'
    expect(result.computed[0].bestRegime).toBe('plusvalues');
    // p2 exonéré → plusValuesTax = 0 → 'plusvalues'
    expect(result.computed[1].isExempt).toBe(true);
    expect(result.computed[1].bestRegime).toBe('plusvalues');
    // Global cohérent
    expect(result.bestRegime).toBe('plusvalues');
  });

  // ── 16. simulatedDate === purchaseDate ──────────────────────────────────

  test('16. simulatedDate === purchaseDate : inclus, years = 0', () => {
    const purchaseDate = '15/06/2024';
    const positions = [makePos({ id: 'same', purchaseDate })];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2024, 6, 15),
    });
    // parseDate construit une Date à minuit local (00:00:00).
    // dateAt construit à 12:00 local. Donc simulatedDate > purchaseDate :
    // la position est incluse, years = 0.
    expect(result.computed).toHaveLength(1);
    expect(result.computed[0].years).toBe(0);
  });

  // ── 17. simulatedDate < purchaseDate : couvert par #9 ───────────────────

  // ── 18. Inputs immuables ────────────────────────────────────────────────

  test('18. la fonction ne mute pas ses inputs', () => {
    const positions = [makePos({ id: 'imm', purchaseDate: '01/01/2020' })];
    const prices = { ...PRICES_ALL_OK };
    const simulatedDate = dateAt(2026, 1, 1);

    const positionsClone = JSON.parse(JSON.stringify(positions));
    const pricesClone = { ...prices };
    const simulatedDateClone = new Date(simulatedDate.getTime());

    computeGlobalFiscalScenario({ positions, prices, simulatedDate });

    expect(positions).toEqual(positionsClone);
    expect(prices).toEqual(pricesClone);
    expect(simulatedDate.getTime()).toBe(simulatedDateClone.getTime());
  });

  // ── 19. Métal listé : tous les métaux du catalogue traités ──────────────
  // Note : MetalType est une union stricte ('or' | 'argent' | 'platine' |
  // 'palladium'). Un métal hors catalogue ne peut pas être passé via TS.
  // Hors scope de S4.2 — le moteur réutilise getSpot qui couvre déjà les
  // 4 métaux du catalogue.

  test('19. les 4 métaux du catalogue sont calculés', () => {
    const positions = [
      makePos({ id: 'a', metal: 'or' }),
      makePos({ id: 'b', metal: 'argent' }),
      makePos({ id: 'c', metal: 'platine' }),
      makePos({ id: 'd', metal: 'palladium' }),
    ];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.computed).toHaveLength(4);
    expect(result.computed.map(r => r.metal).sort()).toEqual(['argent', 'or', 'palladium', 'platine']);
  });

  // ── 20. Position vendue partiellement : non supporté par le modèle ──────
  // Note : le type Position n'expose pas de champ "sold" ou "soldQuantity".
  // Hors scope de S4.2. Aucune action requise dans ce lot.

  test('20. exclusionsByReason agrège correctement les raisons multiples', () => {
    const positions = [
      makePos({ id: 'ok', purchaseDate: '01/01/2020' }),
      makePos({ id: 'zero1', purchasePrice: 0 }),
      makePos({ id: 'zero2', purchasePrice: 0 }),
      makePos({ id: 'baddate', purchaseDate: 'invalid' }),
    ];
    const result = computeGlobalFiscalScenario({
      positions,
      prices: PRICES_ALL_OK,
      simulatedDate: dateAt(2026, 1, 1),
    });
    expect(result.eligiblePositionsCount).toBe(1);
    expect(result.excludedPositionsCount).toBe(3);
    const byReason = new Map(result.exclusionsByReason.map(e => [e.reason, e.count]));
    expect(byReason.get('invalid_purchase_price')).toBe(2);
    expect(byReason.get('invalid_purchase_date')).toBe(1);
  });
});
