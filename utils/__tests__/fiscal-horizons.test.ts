import type { Position } from '@/types/position';
import { computeGlobalFiscalScenario } from '../fiscal-scenarios';
import {
  addYearsClone,
  buildHorizonsFromPositions,
  type FiscalHorizonCard,
} from '../fiscal-horizons';

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

function findCard(cards: FiscalHorizonCard[], kind: FiscalHorizonCard['kind']): FiscalHorizonCard {
  const c = cards.find(x => x.kind === kind);
  if (!c) throw new Error(`carte ${kind} introuvable`);
  return c;
}

// ── A. Helper addYearsClone ───────────────────────────────────────────────

describe('addYearsClone — helper de date pur', () => {
  test('A.1. ajoute des années sans muter l’input', () => {
    const input = dateAt(2024, 6, 15);
    const before = input.getTime();
    const result = addYearsClone(input, 3);
    expect(input.getTime()).toBe(before);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });

  test('A.2. 29/02/2024 + 1 an → 28/02/2025 (jour clamped, mois préservé)', () => {
    const input = dateAt(2024, 2, 29);
    const result = addYearsClone(input, 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  test('A.3. achat + 3 ans : décale exactement de 3 années', () => {
    const purchase = dateAt(2023, 5, 10);
    const result = addYearsClone(purchase, 3);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(4);
    expect(result.getDate()).toBe(10);
  });

  test('A.4. achat + 22 ans : décale exactement de 22 années', () => {
    const purchase = dateAt(2010, 7, 1);
    const result = addYearsClone(purchase, 22);
    expect(result.getFullYear()).toBe(2032);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(1);
  });

  test('A.5. heure normalisée à 12:00 local (résiste DST)', () => {
    const input = dateAt(2024, 1, 15);
    const result = addYearsClone(input, 5);
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

// ── B. buildHorizonsFromPositions — règles structurelles ──────────────────

describe('buildHorizonsFromPositions — règles structurelles', () => {
  test('B.1. retourne exactement 4 cartes si Aujourd’hui est calculable', () => {
    const positions = [makePos({ purchaseDate: '01/01/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    expect(horizons).toHaveLength(4);
  });

  test('B.2. retourne [] si portefeuille vide', () => {
    const horizons = buildHorizonsFromPositions({
      positions: [],
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    expect(horizons).toEqual([]);
  });

  test('B.3. retourne [] si toutes positions exclues (purchasePrice = 0)', () => {
    const positions = [
      makePos({ id: 'a', purchasePrice: 0, purchaseDate: '01/01/2024' }),
      makePos({ id: 'b', purchasePrice: 0, purchaseDate: '01/01/2020' }),
    ];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    expect(horizons).toEqual([]);
  });

  test('B.4. retourne [] si tous les spots sont manquants', () => {
    const positions = [makePos({ purchaseDate: '01/01/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: { gold: null, silver: null, platinum: null, palladium: null },
      today: dateAt(2026, 5, 9),
    });
    expect(horizons).toEqual([]);
  });

  test('B.5. ordre fixe des 4 cartes : today → one_year → next_tax_step → long_holding_22y', () => {
    const positions = [makePos({ purchaseDate: '01/01/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    expect(horizons[0].kind).toBe('today');
    expect(horizons[1].kind).toBe('one_year');
    expect(horizons[2].kind).toBe('next_tax_step');
    expect(horizons[3].kind).toBe('long_holding_22y');
  });

  test('B.6. inputs non mutés (positions, prices, today)', () => {
    const positions = [makePos({ id: 'p1', purchaseDate: '01/01/2024' })];
    const positionsSnapshot = JSON.parse(JSON.stringify(positions));
    const prices = { gold: 2500, silver: 1000, platinum: 800, palladium: 700 };
    const pricesSnapshot = { ...prices };
    const today = dateAt(2026, 5, 9);
    const todaySnapshot = today.getTime();

    buildHorizonsFromPositions({ positions, prices, today });

    expect(positions).toEqual(positionsSnapshot);
    expect(prices).toEqual(pricesSnapshot);
    expect(today.getTime()).toBe(todaySnapshot);
  });
});

// ── C. Sélection du Prochain seuil fiscal ─────────────────────────────────

describe('buildHorizonsFromPositions — Prochain seuil fiscal', () => {
  test('C.1. portefeuille jeune (<3 ans) : carte 3 = entrée dans l’abattement (achat + 3 ans)', () => {
    // Position achetée 01/01/2024, today = 09/05/2026 → ~2 ans détention
    const positions = [makePos({ id: 'young', purchaseDate: '01/01/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c3 = findCard(horizons, 'next_tax_step');
    expect(c3.isCalculable).toBe(true);
    expect(c3.simulatedDate).not.toBeNull();
    expect(c3.simulatedDate!.getFullYear()).toBe(2027);
    expect(c3.simulatedDate!.getMonth()).toBe(0);
    expect(c3.simulatedDate!.getDate()).toBe(1);
  });

  test('C.2. portefeuille entre 3 et 22 ans : carte 3 = seuil 22 ans (achat + 22 ans)', () => {
    // Position achetée 01/01/2018, today = 09/05/2026 → ~8 ans détention
    const positions = [makePos({ id: 'mid', purchaseDate: '01/01/2018' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c3 = findCard(horizons, 'next_tax_step');
    expect(c3.isCalculable).toBe(true);
    expect(c3.simulatedDate!.getFullYear()).toBe(2040);
    expect(c3.simulatedDate!.getMonth()).toBe(0);
    expect(c3.simulatedDate!.getDate()).toBe(1);
  });

  test('C.3. toutes positions ≥ 22 ans : carte 3 non calculable + message', () => {
    const positions = [makePos({ id: 'old', purchaseDate: '01/01/2000' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c3 = findCard(horizons, 'next_tax_step');
    expect(c3.isCalculable).toBe(false);
    expect(c3.simulatedDate).toBeNull();
    expect(c3.netSeller).toBeNull();
    expect(c3.deltaVsToday).toBeNull();
    expect(c3.regime).toBeNull();
    expect(c3.message).toBe('Aucun prochain seuil fiscal détecté.');
  });

  test('C.4. seuls 3 et 22 ans utilisés : aucun palier intermédiaire (6, 9, 12, 15, 18, 21)', () => {
    // Cas position détenue 9 ans : si on utilisait un palier, ce serait 12 ans.
    // Mais on doit retomber sur 22 ans (achat + 22 ans).
    const positions = [makePos({ id: 'mid9', purchaseDate: '01/01/2017' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c3 = findCard(horizons, 'next_tax_step');
    // achat 01/01/2017 + 22 ans = 01/01/2039
    expect(c3.simulatedDate!.getFullYear()).toBe(2039);
    expect(c3.simulatedDate!.getFullYear()).not.toBe(2029); // pas +12 ans
    expect(c3.simulatedDate!.getFullYear()).not.toBe(2026); // pas +9 ans
  });

  test('C.5. Position éligible la plus jeune sélectionnée même si une plus ancienne existe', () => {
    // Mix : une vieille (14 ans) + une jeune (1 an). La plus jeune pilote
    // le prochain seuil → entrée dans l’abattement (jeune + 3 ans).
    const positions = [
      makePos({ id: 'old', purchaseDate: '01/01/2012' }),
      makePos({ id: 'young', purchaseDate: '01/06/2025' }),
    ];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c3 = findCard(horizons, 'next_tax_step');
    expect(c3.isCalculable).toBe(true);
    // jeune (01/06/2025) + 3 ans = 01/06/2028
    expect(c3.simulatedDate!.getFullYear()).toBe(2028);
    expect(c3.simulatedDate!.getMonth()).toBe(5);
    expect(c3.simulatedDate!.getDate()).toBe(1);
  });
});

// ── D. Carte Détention 22 ans ─────────────────────────────────────────────

describe('buildHorizonsFromPositions — Détention 22 ans', () => {
  test('D.1. carte 4 toujours présente quand le bloc est visible', () => {
    const positions = [makePos({ purchaseDate: '01/01/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    expect(horizons.some(c => c.kind === 'long_holding_22y')).toBe(true);
  });

  test('D.2. portefeuille tous ≥ 22 ans : carte 4 état spécial déjà atteinte', () => {
    const positions = [makePos({ id: 'old', purchaseDate: '01/01/2000' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c4 = findCard(horizons, 'long_holding_22y');
    expect(c4.isCalculable).toBe(false);
    expect(c4.simulatedDate).toBeNull();
    expect(c4.netSeller).toBeNull();
    expect(c4.message).toBe('Détention 22 ans déjà atteinte sur les positions éligibles.');
    expect(c4.microcopy).toBe('À 22 ans, seul le régime plus-values est exonéré.');
  });

  test('D.3. portefeuille jeune : carte 4 calculable, date = jeune + 22 ans', () => {
    const positions = [makePos({ id: 'young', purchaseDate: '15/06/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c4 = findCard(horizons, 'long_holding_22y');
    expect(c4.isCalculable).toBe(true);
    expect(c4.simulatedDate!.getFullYear()).toBe(2046);
    expect(c4.simulatedDate!.getMonth()).toBe(5);
    expect(c4.simulatedDate!.getDate()).toBe(15);
    expect(c4.microcopy).toBe('À 22 ans, seul le régime plus-values est exonéré.');
  });

  test('D.4. carte 3 et carte 4 même date : deux cartes séparées + microcopy carte 3 substituée (S4.6)', () => {
    // Position 8 ans : c3 = achat + 22 ans, c4 = achat + 22 ans → même date.
    const positions = [makePos({ id: 'mid', purchaseDate: '01/01/2018' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    // Aucune fusion : les 4 cartes restent présentes dans l'ordre fixe.
    expect(horizons).toHaveLength(4);
    const c3 = findCard(horizons, 'next_tax_step');
    const c4 = findCard(horizons, 'long_holding_22y');
    expect(c3.kind).toBe('next_tax_step');
    expect(c3.label).toBe('Prochain seuil fiscal');
    expect(c4.kind).toBe('long_holding_22y');
    expect(c4.label).toBe('Détention 22 ans');

    // Equivalence : même date, même montant, même delta, même régime.
    expect(c3.simulatedDate!.getTime()).toBe(c4.simulatedDate!.getTime());
    expect(c3.netSeller).toBeCloseTo(c4.netSeller!, 2);
    expect(c3.deltaVsToday).toBeCloseTo(c4.deltaVsToday!, 2);
    expect(c3.regime).toBe(c4.regime);

    // Microcopy carte 3 remplacée — l'ancienne (futur générique) ne doit plus apparaître.
    expect(c3.microcopy).toBe('Même date que le seuil de détention 22 ans.');
    expect(c3.microcopy).not.toBe('Estimation à date simulée, hors évolution du cours.');
    // Microcopy carte 4 préservée.
    expect(c4.microcopy).toBe('À 22 ans, seul le régime plus-values est exonéré.');
  });

  test('D.5. carte 3 et carte 4 dates différentes : carte 3 garde la microcopy futur générique (S4.6)', () => {
    // Position <3 ans : c3 = achat + 3 ans (2027), c4 = achat + 22 ans (2046) → différentes.
    const positions = [makePos({ id: 'young', purchaseDate: '01/06/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c3 = findCard(horizons, 'next_tax_step');
    const c4 = findCard(horizons, 'long_holding_22y');
    expect(c3.simulatedDate!.getTime()).not.toBe(c4.simulatedDate!.getTime());
    // Microcopy carte 3 = futur générique (pas de substitution).
    expect(c3.microcopy).toBe('Estimation à date simulée, hors évolution du cours.');
    expect(c3.microcopy).not.toBe('Même date que le seuil de détention 22 ans.');
  });
});

// ── E. Calcul du delta et carte Aujourd'hui ───────────────────────────────

describe('buildHorizonsFromPositions — delta et carte Aujourd’hui', () => {
  test('E.1. carte Aujourd’hui : deltaVsToday = null', () => {
    const positions = [makePos({ purchaseDate: '01/01/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c1 = findCard(horizons, 'today');
    expect(c1.deltaVsToday).toBeNull();
  });

  test('E.2. delta vs aujourd’hui = netSeller(carte) - netSeller(today) pour cartes futures calculables', () => {
    const positions = [makePos({ purchaseDate: '01/01/2024' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c1 = findCard(horizons, 'today');
    const c2 = findCard(horizons, 'one_year');
    expect(c2.deltaVsToday).not.toBeNull();
    expect(c2.deltaVsToday!).toBeCloseTo(c2.netSeller! - c1.netSeller!, 2);
  });

  test('E.3. carte non calculable : deltaVsToday = null', () => {
    const positions = [makePos({ id: 'old', purchaseDate: '01/01/2000' })];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    const c3 = findCard(horizons, 'next_tax_step');
    const c4 = findCard(horizons, 'long_holding_22y');
    expect(c3.deltaVsToday).toBeNull();
    expect(c4.deltaVsToday).toBeNull();
  });
});

// ── F. Parité moteur fiscal (carte Aujourd'hui) ──────────────────────────

describe('buildHorizonsFromPositions — parité moteur sur Aujourd’hui', () => {
  test('F.1. netSeller(today) === heroNet du moteur fiscal pour la même date', () => {
    const positions = [
      makePos({ id: 'a', metal: 'or', purchasePrice: 1000, purchaseDate: '01/01/2020' }),
      makePos({ id: 'b', metal: 'argent', purchasePrice: 500, purchaseDate: '15/06/2018' }),
    ];
    const today = dateAt(2026, 5, 9);
    const horizons = buildHorizonsFromPositions({ positions, prices: PRICES_ALL_OK, today });
    const c1 = findCard(horizons, 'today');
    const moteur = computeGlobalFiscalScenario({ positions, prices: PRICES_ALL_OK, simulatedDate: today });
    expect(c1.netSeller).toBeCloseTo(moteur.heroNet, 2);
    expect(c1.regime).toBe(moteur.bestRegime);
  });
});

// ── G. Cas mixtes et limites ──────────────────────────────────────────────

describe('buildHorizonsFromPositions — cas mixtes et limites', () => {
  test('G.1. toutes positions même purchaseDate : 4 cartes cohérentes', () => {
    const positions = [
      makePos({ id: 'p1', metal: 'or', purchaseDate: '01/01/2024' }),
      makePos({ id: 'p2', metal: 'argent', purchaseDate: '01/01/2024' }),
      makePos({ id: 'p3', metal: 'platine', purchaseDate: '01/01/2024' }),
    ];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    expect(horizons).toHaveLength(4);
    const c3 = findCard(horizons, 'next_tax_step');
    // Toutes ont 2 ans → seuil = +3 ans depuis 01/01/2024 = 01/01/2027.
    expect(c3.simulatedDate!.getFullYear()).toBe(2027);
  });

  test('G.2. mix jeune éligible + ancienne non éligible (purchasePrice = 0)', () => {
    const positions = [
      makePos({ id: 'old_invalid', purchasePrice: 0, purchaseDate: '01/01/2000' }),
      makePos({ id: 'young_ok', purchasePrice: 1000, purchaseDate: '01/06/2024' }),
    ];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    expect(horizons).toHaveLength(4);
    const c3 = findCard(horizons, 'next_tax_step');
    // Seule la jeune est éligible → seuil = jeune + 3 ans = 01/06/2027.
    expect(c3.simulatedDate!.getFullYear()).toBe(2027);
    expect(c3.simulatedDate!.getMonth()).toBe(5);
  });

  test('G.3. position avec purchaseDate future : exclue → ignorée', () => {
    const positions = [
      makePos({ id: 'future', purchaseDate: '01/01/2030' }),
      makePos({ id: 'normal', purchaseDate: '01/01/2024' }),
    ];
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: PRICES_ALL_OK,
      today: dateAt(2026, 5, 9),
    });
    expect(horizons).toHaveLength(4);
    const c3 = findCard(horizons, 'next_tax_step');
    // La position future est exclue par le moteur (simulated_date_before_purchase).
    // Seule la normale (01/01/2024) reste éligible → seuil = +3 ans = 01/01/2027.
    expect(c3.simulatedDate!.getFullYear()).toBe(2027);
  });

  test('G.4. prix spot partiellement défini : positions sans spot exclues', () => {
    const positions = [
      makePos({ id: 'gold', metal: 'or', purchaseDate: '01/01/2024' }),
      makePos({ id: 'silv', metal: 'argent', purchaseDate: '01/06/2025' }),
    ];
    const partialPrices = { gold: 2500, silver: null, platinum: null, palladium: null };
    const horizons = buildHorizonsFromPositions({
      positions,
      prices: partialPrices,
      today: dateAt(2026, 5, 9),
    });
    // Seule la position 'or' est éligible → bloc visible avec 4 cartes.
    expect(horizons).toHaveLength(4);
    const c3 = findCard(horizons, 'next_tax_step');
    // Position or (01/01/2024) + 3 ans = 01/01/2027.
    expect(c3.simulatedDate!.getFullYear()).toBe(2027);
  });
});
