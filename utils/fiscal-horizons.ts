import { TAX } from '@/constants/tax';
import { Position } from '@/types/position';
import { computeGlobalFiscalScenario } from '@/utils/fiscal-scenarios';
import { calcYearsHeld, parseDate } from '@/utils/tax-helpers';

// Type des prix spot tel que consommé par computeGlobalFiscalScenario.
// Repris du même pattern que utils/fiscal-scenarios.ts pour rester
// strictement aligné avec le moteur fiscal pur (S4.2).
type SpotPricesParam = Parameters<typeof computeGlobalFiscalScenario>[0]['prices'];

// ─── Types publics ───────────────────────────────────────────────────────────

export type FiscalHorizonKind =
  | 'today'
  | 'one_year'
  | 'next_tax_step'
  | 'long_holding_22y';

export type FiscalHorizonRegime =
  | 'forfaitaire'
  | 'plusvalues'
  | 'equal';

export type FiscalHorizonCard = {
  kind: FiscalHorizonKind;
  label: string;
  simulatedDate: Date | null;
  isCalculable: boolean;
  netSeller: number | null;
  deltaVsToday: number | null;
  regime: FiscalHorizonRegime | null;
  message?: string;
  microcopy?: string;
};

// ─── Helpers purs ────────────────────────────────────────────────────────────

/**
 * Ajoute `years` à la date sans muter l'input. Gère le 29/02 :
 * si le jour cible n'existe pas dans le mois résultant, retombe sur le
 * dernier jour du mois (ex. 29/02/2024 + 1 an → 28/02/2025). Heure fixée
 * à 12:00 local pour neutraliser les bascules DST.
 *
 * Convention identique à `addYearsSafe` privé de app/fiscalite-globale.tsx.
 * Réimplémenté ici pour garder l'adapter pur et isolément testable, sans
 * couplage à un écran. Toute évolution doit rester cohérente entre les deux.
 */
export function addYearsClone(date: Date, years: number): Date {
  const y = date.getFullYear() + years;
  const mo = date.getMonth();
  const d = date.getDate();
  const cand = new Date(y, mo, d, 12, 0, 0, 0);
  if (cand.getMonth() !== mo) return new Date(y, mo + 1, 0, 12, 0, 0, 0);
  return cand;
}

// ─── Constantes locales ──────────────────────────────────────────────────────

const LABELS = {
  today: 'Aujourd’hui',
  oneYear: 'Dans 1 an',
  nextTaxStep: 'Prochain seuil fiscal',
  longHolding: 'Détention 22 ans',
} as const;

const MICROCOPY_FUTURE = 'Estimation à date simulée, hors évolution du cours.';
const MICROCOPY_22Y = 'À 22 ans, seul le régime plus-values est exonéré.';
const MICROCOPY_SAME_AS_22Y = 'Même date que le seuil de détention 22 ans.';
const MESSAGE_NO_NEXT_STEP = 'Aucun prochain seuil fiscal détecté.';
const MESSAGE_22Y_REACHED = 'Détention 22 ans déjà atteinte sur les positions éligibles.';

// ─── Helpers d'équivalence carte 3 / carte 4 (S4.6) ──────────────────────────

function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * True si carte 3 et carte 4 sont équivalentes : même date (clé YYYY-MM-DD,
 * pas de comparaison par référence Date), même netSeller (tolérance 0,01 €),
 * même deltaVsToday (tolérance 0,01 €), même régime (strict equality).
 *
 * Les deux cartes doivent être calculables. Sert uniquement à substituer la
 * microcopy de la carte 3 ; ne fusionne ni ne masque aucune carte.
 */
function areNextStepAndLongHoldingEquivalent(
  c3: FiscalHorizonCard,
  c4: FiscalHorizonCard,
): boolean {
  if (!c3.isCalculable || !c4.isCalculable) return false;
  if (c3.simulatedDate === null || c4.simulatedDate === null) return false;
  if (dateKey(c3.simulatedDate) !== dateKey(c4.simulatedDate)) return false;
  if (c3.netSeller === null || c4.netSeller === null) return false;
  if (Math.abs(c3.netSeller - c4.netSeller) > 0.01) return false;
  if (c3.deltaVsToday === null || c4.deltaVsToday === null) return false;
  if (Math.abs(c3.deltaVsToday - c4.deltaVsToday) > 0.01) return false;
  if (c3.regime !== c4.regime) return false;
  return true;
}

// ─── Adapter principal ───────────────────────────────────────────────────────

/**
 * Construit les 4 cartes Horizons fiscaux à partir d'un portefeuille.
 *
 * Règles (S4.4 V2.3) :
 * - Délègue tous les calculs à `computeGlobalFiscalScenario`.
 * - Aucun `new Date()` ni `Date.now()`. `today` est passé en paramètre.
 * - Retourne `[]` si Aujourd'hui n'est pas calculable (eligibleCount = 0).
 * - Sinon, retourne toujours exactement 4 cartes, dans l'ordre fixe :
 *   today, one_year, next_tax_step, long_holding_22y.
 * - Aucune fusion : si carte 3 et carte 4 ont la même date, les deux
 *   restent affichées séparément.
 *
 * Définition position éligible la plus jeune : la position incluse dans
 * `todayScenario.computed` avec la date d'achat la plus récente.
 *
 * Seuils fiscaux structurants (uniquement deux) :
 * - 3 ans (entrée dans l'abattement plus-values)
 * - 22 ans (exonération plus-values)
 *
 * Pureté : ne mute aucun input, déterministe pour un même triplet
 * (positions, prices, today).
 */
export function buildHorizonsFromPositions(params: {
  positions: Position[];
  prices: SpotPricesParam;
  today: Date;
}): FiscalHorizonCard[] {
  const { positions, prices, today } = params;

  // 1. Scénario Aujourd'hui — source unique de la visibilité du bloc.
  const todayScenario = computeGlobalFiscalScenario({
    positions,
    prices,
    simulatedDate: today,
  });
  if (todayScenario.eligiblePositionsCount === 0) return [];

  // 2. Reconstituer les positions éligibles depuis computed[].positionId
  //    sans s'appuyer sur Position.find en boucle (perf et lisibilité).
  const positionsById = new Map<string, Position>();
  for (const p of positions) positionsById.set(p.id, p);

  const eligiblePositions: Position[] = [];
  for (const r of todayScenario.computed) {
    const p = positionsById.get(r.positionId);
    if (p) eligiblePositions.push(p);
  }
  if (eligiblePositions.length === 0) return [];

  // 3. Position éligible la plus jeune = purchaseDate la plus récente.
  let youngestPos: Position | null = null;
  let youngestDate: Date | null = null;
  for (const p of eligiblePositions) {
    const d = parseDate(p.purchaseDate);
    if (!d) continue;
    if (youngestDate === null || d.getTime() > youngestDate.getTime()) {
      youngestPos = p;
      youngestDate = d;
    }
  }
  // Garde-fou : tous les ids passés ont été parsés par le moteur, mais on
  // reste défensif si un cas dégénéré apparaît.
  if (youngestPos === null || youngestDate === null) return [];

  const yearsHeldYoungest = calcYearsHeld(youngestDate, today);
  const heroNetToday = todayScenario.heroNet;

  // 4. Carte 1 — Aujourd'hui.
  const cardToday: FiscalHorizonCard = {
    kind: 'today',
    label: LABELS.today,
    simulatedDate: today,
    isCalculable: true,
    netSeller: heroNetToday,
    deltaVsToday: null,
    regime: todayScenario.bestRegime,
  };

  // 5. Carte 2 — Dans 1 an.
  const dateOneYear = addYearsClone(today, 1);
  const oneYearScenario = computeGlobalFiscalScenario({
    positions,
    prices,
    simulatedDate: dateOneYear,
  });
  const cardOneYear: FiscalHorizonCard = oneYearScenario.eligiblePositionsCount > 0
    ? {
        kind: 'one_year',
        label: LABELS.oneYear,
        simulatedDate: dateOneYear,
        isCalculable: true,
        netSeller: oneYearScenario.heroNet,
        deltaVsToday: oneYearScenario.heroNet - heroNetToday,
        regime: oneYearScenario.bestRegime,
        microcopy: MICROCOPY_FUTURE,
      }
    : {
        kind: 'one_year',
        label: LABELS.oneYear,
        simulatedDate: dateOneYear,
        isCalculable: false,
        netSeller: null,
        deltaVsToday: null,
        regime: null,
        microcopy: MICROCOPY_FUTURE,
      };

  // 6. Carte 3 — Prochain seuil fiscal (3 ans ou 22 ans uniquement).
  let cardNextStep: FiscalHorizonCard;
  if (yearsHeldYoungest < TAX.abatementStartYear) {
    const dateThreeYears = addYearsClone(youngestDate, TAX.abatementStartYear);
    const sc = computeGlobalFiscalScenario({
      positions,
      prices,
      simulatedDate: dateThreeYears,
    });
    cardNextStep = sc.eligiblePositionsCount > 0
      ? {
          kind: 'next_tax_step',
          label: LABELS.nextTaxStep,
          simulatedDate: dateThreeYears,
          isCalculable: true,
          netSeller: sc.heroNet,
          deltaVsToday: sc.heroNet - heroNetToday,
          regime: sc.bestRegime,
          microcopy: MICROCOPY_FUTURE,
        }
      : {
          kind: 'next_tax_step',
          label: LABELS.nextTaxStep,
          simulatedDate: null,
          isCalculable: false,
          netSeller: null,
          deltaVsToday: null,
          regime: null,
          message: MESSAGE_NO_NEXT_STEP,
        };
  } else if (yearsHeldYoungest < TAX.fullExemptionYear) {
    const dateTwentyTwo = addYearsClone(youngestDate, TAX.fullExemptionYear);
    const sc = computeGlobalFiscalScenario({
      positions,
      prices,
      simulatedDate: dateTwentyTwo,
    });
    cardNextStep = sc.eligiblePositionsCount > 0
      ? {
          kind: 'next_tax_step',
          label: LABELS.nextTaxStep,
          simulatedDate: dateTwentyTwo,
          isCalculable: true,
          netSeller: sc.heroNet,
          deltaVsToday: sc.heroNet - heroNetToday,
          regime: sc.bestRegime,
          microcopy: MICROCOPY_FUTURE,
        }
      : {
          kind: 'next_tax_step',
          label: LABELS.nextTaxStep,
          simulatedDate: null,
          isCalculable: false,
          netSeller: null,
          deltaVsToday: null,
          regime: null,
          message: MESSAGE_NO_NEXT_STEP,
        };
  } else {
    cardNextStep = {
      kind: 'next_tax_step',
      label: LABELS.nextTaxStep,
      simulatedDate: null,
      isCalculable: false,
      netSeller: null,
      deltaVsToday: null,
      regime: null,
      message: MESSAGE_NO_NEXT_STEP,
    };
  }

  // 7. Carte 4 — Détention 22 ans. Toujours présente quand le bloc est visible.
  let cardLongHolding: FiscalHorizonCard;
  if (yearsHeldYoungest >= TAX.fullExemptionYear) {
    cardLongHolding = {
      kind: 'long_holding_22y',
      label: LABELS.longHolding,
      simulatedDate: null,
      isCalculable: false,
      netSeller: null,
      deltaVsToday: null,
      regime: null,
      message: MESSAGE_22Y_REACHED,
      microcopy: MICROCOPY_22Y,
    };
  } else {
    const dateTwentyTwo = addYearsClone(youngestDate, TAX.fullExemptionYear);
    const sc = computeGlobalFiscalScenario({
      positions,
      prices,
      simulatedDate: dateTwentyTwo,
    });
    cardLongHolding = sc.eligiblePositionsCount > 0
      ? {
          kind: 'long_holding_22y',
          label: LABELS.longHolding,
          simulatedDate: dateTwentyTwo,
          isCalculable: true,
          netSeller: sc.heroNet,
          deltaVsToday: sc.heroNet - heroNetToday,
          regime: sc.bestRegime,
          microcopy: MICROCOPY_22Y,
        }
      : {
          kind: 'long_holding_22y',
          label: LABELS.longHolding,
          simulatedDate: dateTwentyTwo,
          isCalculable: false,
          netSeller: null,
          deltaVsToday: null,
          regime: null,
          microcopy: MICROCOPY_22Y,
        };
  }

  // S4.6 — Si carte 3 et carte 4 sont équivalentes (même date, même montant,
  // même régime), la microcopy de la carte 3 est remplacée par une précision
  // dédiée. Aucune fusion, aucun masquage, aucune modification des valeurs.
  let cardNextStepFinal = cardNextStep;
  if (areNextStepAndLongHoldingEquivalent(cardNextStep, cardLongHolding)) {
    cardNextStepFinal = { ...cardNextStep, microcopy: MICROCOPY_SAME_AS_22Y };
  }

  return [cardToday, cardOneYear, cardNextStepFinal, cardLongHolding];
}
