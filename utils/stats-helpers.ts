import { type MetalType, METAL_CONFIG, getSpot, OZ_TO_G } from '@/constants/metals';
import { TAX } from '@/constants/tax';
import { STATS } from '@/constants/stats-config';
import { Position } from '@/types/position';
import { formatEuro, stripMetalFromName } from '@/utils/format';
import { parseDate, calcYearsHeld } from '@/utils/tax-helpers';
import {
  PortfolioFiscalSummary,
  computeFiscalCountdown,
  computeAbatement,
  isGainFiscalEligiblePosition,
} from '@/utils/fiscal';

/** Format compact sans décimales : "12 460" au lieu de "12 460,00" */
function fmtCompact(n: number): string {
  return formatEuro(Math.round(n)).replace(/,00$/, '');
}

// ── Types ──────────────────────────────────────────────────────────────────

export type InsightType = 'fiscal-window' | 'fiscal-watch' | 'regime' | 'concentration' | 'metal-dominance' | 'fallback';

export type StatsInsight = {
  type: InsightType;
  title: string;
  phrase: string;
  subtext: string;
  method?: string;
  action?: { label: string; route: string; params?: Record<string, string> };
};

export type DecisionCard = {
  id: string;
  title: string;
  value: string;
  subtext: string;
  method: string;
};

export type MetalBreakdown = {
  metal: MetalType;
  name: string;
  value: number;
  cost: number;
  gainEur: number;
  partValue: number;
  partGain: number;
};

export type PositionRanking = {
  id: string;
  product: string;
  metal: MetalType;
  gainEur: number;
  gainPct: number;
  netEstimate: number | null;
  regimeLabel: string | null;
  fiscalNote: string | null;
};

// ── Insights ───────────────────────────────────────────────────────────────

export function selectInsight(
  fiscal: PortfolioFiscalSummary | null,
  metalBreakdown: MetalBreakdown[],
  totalGain: number,
  positionCount: number,
): StatsInsight {
  // Priority 1: Fenêtre fiscale proche
  if (fiscal && totalGain > 0) {
    const now = new Date();
    for (const pf of fiscal.positionFiscals) {
      if (pf.gainEur <= 0) continue;
      const fc = computeFiscalCountdown(pf.pos.purchaseDate);
      if (!fc) continue;

      // Next abatement tier: 3, 4, 5, ..., 22 years
      const currentYears = fc.years;
      const nextTierYear = currentYears < TAX.abatementStartYear
        ? TAX.abatementStartYear
        : currentYears + 1;
      if (nextTierYear > TAX.fullExemptionYear) continue;

      const purchaseDate = parseDate(pf.pos.purchaseDate);
      if (!purchaseDate) continue;
      const tierDate = new Date(purchaseDate);
      tierDate.setFullYear(tierDate.getFullYear() + nextTierYear);
      const monthsToTier = Math.max(0, Math.ceil(
        (tierDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
      ));

      if (monthsToTier <= STATS.FISCAL_WINDOW_MONTHS) {
        // Estimate savings: difference between current and next tier abatement
        const currentAbat = computeAbatement(currentYears);
        const nextAbat = computeAbatement(nextTierYear);
        const gain = pf.gainEur;
        const currentTaxable = gain * (1 - currentAbat / 100);
        const nextTaxable = gain * (1 - nextAbat / 100);
        const savings = (currentTaxable - nextTaxable) * TAX.plusValueRate;

        if (savings >= STATS.FISCAL_MIN_SAVINGS) {
          return {
            type: 'fiscal-window',
            title: 'FENÊTRE FISCALE',
            phrase: `Attendre ${monthsToTier} mois sur 1 position pourrait améliorer votre net estimé.`,
            subtext: `${stripMetalFromName(pf.pos.product)} approche d\u2019un palier fiscal.`,
            method: `Économie potentielle estimée : ~${fmtCompact(savings)} \u20AC \u00B7 base cours actuel`,
            action: { label: 'Voir la simulation \u2192', route: '/fiscalite', params: { positionId: pf.pos.id } },
          };
        }
      }

      if (monthsToTier > STATS.FISCAL_WINDOW_MONTHS && monthsToTier <= STATS.FISCAL_WATCH_MONTHS) {
        return {
          type: 'fiscal-watch',
          title: 'POSITION À SURVEILLER',
          phrase: `${stripMetalFromName(pf.pos.product)} \u00B7 palier fiscal dans ${monthsToTier} mois.`,
          subtext: 'Ce palier peut améliorer votre net.',
          method: 'Abattement progressif \u00B7 art. 150 VI CGI',
        };
      }
    }
  }

  // Priority 2: Régime plus favorable
  if (fiscal && totalGain > 0 && fiscal.delta >= STATS.REGIME_MIN_DELTA && fiscal.bestRegime) {
    const regimeName = fiscal.bestRegime === 'plusvalues' ? 'plus-values' : 'forfaitaire';
    const otherName = fiscal.bestRegime === 'plusvalues' ? 'forfaitaire' : 'plus-values';
    return {
      type: 'regime',
      title: 'RÉGIME LE PLUS FAVORABLE',
      phrase: `Le régime ${fiscal.bestRegime === 'plusvalues' ? 'des plus-values' : 'forfaitaire'} vous laisse plus de net aujourd\u2019hui.`,
      subtext: `Écart estimé : +${fmtCompact(fiscal.delta)} \u20AC vs ${otherName}.`,
      method: 'Comparaison des régimes sur le portefeuille',
      action: { label: 'Comparer mes régimes \u2192', route: '/fiscalite-globale' },
    };
  }

  // Priority 3: Concentration PV
  if (fiscal && totalGain > 0 && positionCount >= STATS.CONCENTRATION_MIN_POSITIONS) {
    const gains = fiscal.positionFiscals
      .map(pf => ({ name: stripMetalFromName(pf.pos.product), gain: Math.max(0, pf.gainEur) }))
      .sort((a, b) => b.gain - a.gain);
    const totalPosGain = gains.reduce((s, g) => s + g.gain, 0);
    if (totalPosGain > 0) {
      const top1Pct = gains[0].gain / totalPosGain;
      const top2Pct = gains.length >= 2 ? (gains[0].gain + gains[1].gain) / totalPosGain : top1Pct;
      if (top2Pct >= STATS.CONCENTRATION_TOP2_THRESHOLD || top1Pct >= STATS.CONCENTRATION_TOP1_THRESHOLD) {
        const n = top1Pct >= STATS.CONCENTRATION_TOP1_THRESHOLD ? 1 : 2;
        const pct = Math.round((n === 1 ? top1Pct : top2Pct) * 100);
        const names = gains.slice(0, n).map(g => g.name).join(' et ');
        return {
          type: 'concentration',
          title: 'PLUS-VALUE CONCENTRÉE',
          phrase: `${n} position${n > 1 ? 's' : ''} génère${n > 1 ? 'nt' : ''} ${pct} % de votre plus-value.`,
          subtext: `${names} porte${n > 1 ? 'nt' : ''} l\u2019essentiel du gain.`,
        };
      }
    }
  }

  // Priority 4: Dépendance métal
  const totalValue = metalBreakdown.reduce((s, m) => s + m.value, 0);
  if (totalValue > 0) {
    const dominant = metalBreakdown.reduce((best, m) => m.value > best.value ? m : best, metalBreakdown[0]);
    if (dominant && dominant.partValue >= STATS.METAL_DOMINANCE_THRESHOLD) {
      return {
        type: 'metal-dominance',
        title: 'EXPOSITION DOMINANTE',
        phrase: `Votre portefeuille dépend majoritairement du cours de l\u2019${dominant.name.toLowerCase()}.`,
        subtext: `${dominant.name} représente ${Math.round(dominant.partValue * 100)} % de la valeur.`,
      };
    }
  }

  return {
    type: 'fallback',
    title: 'ANALYSE',
    phrase: 'Votre portefeuille reste stable selon les critères analysés.',
    subtext: '',
  };
}

// ── Decision cards ─────────────────────────────────────────────────────────

export function selectDecisionCards(
  fiscal: PortfolioFiscalSummary | null,
  totalGain: number,
  positionCount: number,
): DecisionCard[] {
  const cards: DecisionCard[] = [];

  // Card 1: Net si vente
  if (fiscal) {
    cards.push({
      id: 'net',
      title: 'NET SI VENTE',
      value: `${fmtCompact(fiscal.bestNet)} \u20AC`,
      subtext: 'Après fiscalité estimée',
      method: 'Régime le plus favorable \u00B7 hors frais',
    });
  }

  // Card 2: Régime
  if (fiscal && fiscal.delta >= STATS.REGIME_MIN_DELTA && fiscal.bestRegime) {
    const name = fiscal.bestRegime === 'plusvalues' ? 'Plus-values' : 'Forfaitaire';
    const other = fiscal.bestRegime === 'plusvalues' ? 'forfaitaire' : 'plus-values';
    cards.push({
      id: 'regime',
      title: 'RÉGIME FAVORABLE',
      value: name,
      subtext: `+${fmtCompact(fiscal.delta)} \u20AC vs ${other}`,
      method: 'Comparaison TMP vs TPV',
    });
  }

  // Card 3: Fenêtre fiscale
  if (fiscal && totalGain > 0) {
    const now = new Date();
    for (const pf of fiscal.positionFiscals) {
      if (pf.gainEur <= 0) continue;
      const purchaseDate = parseDate(pf.pos.purchaseDate);
      if (!purchaseDate) continue;
      const currentYears = pf.years;
      const nextTierYear = currentYears < TAX.abatementStartYear ? TAX.abatementStartYear : currentYears + 1;
      if (nextTierYear > TAX.fullExemptionYear) continue;
      const tierDate = new Date(purchaseDate);
      tierDate.setFullYear(tierDate.getFullYear() + nextTierYear);
      const monthsToTier = Math.max(0, Math.ceil((tierDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
      if (monthsToTier <= STATS.FISCAL_WINDOW_MONTHS) {
        const currentAbat = computeAbatement(currentYears);
        const nextAbat = computeAbatement(nextTierYear);
        const savings = (pf.gainEur * (1 - currentAbat / 100) - pf.gainEur * (1 - nextAbat / 100)) * TAX.plusValueRate;
        if (savings >= STATS.FISCAL_MIN_SAVINGS) {
          cards.push({
            id: 'window',
            title: 'FENÊTRE FISCALE',
            value: `Dans ${monthsToTier} mois`,
            subtext: `${stripMetalFromName(pf.pos.product)} \u00B7 économie estimée : ~${fmtCompact(savings)} \u20AC`,
            method: 'Base cours actuel \u00B7 abattement progressif',
          });
          break;
        }
      }
    }
  }

  // Card 4/5: Motor or Concentration (mutually exclusive)
  if (fiscal && totalGain > 0) {
    const gains = fiscal.positionFiscals
      .map(pf => ({ name: stripMetalFromName(pf.pos.product), gain: Math.max(0, pf.gainEur) }))
      .sort((a, b) => b.gain - a.gain);
    const totalPosGain = gains.reduce((s, g) => s + g.gain, 0);

    if (totalPosGain > 0 && positionCount >= STATS.MOTOR_MIN_POSITIONS) {
      const top1Contribution = gains[0].gain / totalPosGain;
      if (top1Contribution >= STATS.MOTOR_MIN_CONTRIBUTION) {
        cards.push({
          id: 'motor',
          title: 'MOTEUR DE PERFORMANCE',
          value: gains[0].name,
          subtext: `${Math.round(top1Contribution * 100)} % de la plus-value totale`,
          method: 'Part dans la plus-value totale',
        });
      } else {
        // Card E: Concentration
        const top2Pct = gains.length >= 2 ? (gains[0].gain + gains[1].gain) / totalPosGain : top1Contribution;
        if (top2Pct >= STATS.CONCENTRATION_TOP2_THRESHOLD || top1Contribution >= STATS.CONCENTRATION_TOP1_THRESHOLD) {
          const n = top1Contribution >= STATS.CONCENTRATION_TOP1_THRESHOLD ? 1 : 2;
          cards.push({
            id: 'concentration',
            title: 'PLUS-VALUE CONCENTRÉE',
            value: `${n} position${n > 1 ? 's' : ''}`,
            subtext: `${Math.round((n === 1 ? top1Contribution : top2Pct) * 100)} % de la plus-value totale`,
            method: 'Part dans la plus-value totale',
          });
        }
      }
    }
  }

  return cards;
}

// ── Metal breakdown ────────────────────────────────────────────────────────

export function computeMetalBreakdown(
  positions: Position[],
  prices: Record<string, number | null>,
): MetalBreakdown[] {
  const metalKeys: MetalType[] = ['or', 'argent', 'platine', 'palladium'];
  const result: MetalBreakdown[] = [];
  let totalValue = 0;
  let totalGain = 0;

  // First pass: compute values
  const byMetal: Record<string, { value: number; cost: number; gainValue: number }> = {};
  for (const mk of metalKeys) {
    const spot = getSpot(mk, prices as any);
    const filtered = positions.filter(p => p.metal === mk);
    if (filtered.length === 0) continue;
    const value = filtered.reduce((s, p) => s + (spot !== null ? p.quantity * (p.weightG / OZ_TO_G) * spot : 0), 0);
    const gainEligible = filtered.filter(isGainFiscalEligiblePosition);
    const cost = gainEligible.reduce((s, p) => s + p.quantity * p.purchasePrice, 0);
    const gainValue = gainEligible.reduce((s, p) => s + (spot !== null ? p.quantity * (p.weightG / OZ_TO_G) * spot : 0), 0);
    if (value <= 0) continue;
    byMetal[mk] = { value, cost, gainValue };
    totalValue += value;
    totalGain += cost > 0 ? gainValue - cost : 0;
  }

  // Second pass: compute ratios
  for (const [mk, data] of Object.entries(byMetal)) {
    const gainEur = data.cost > 0 ? data.gainValue - data.cost : 0;
    result.push({
      metal: mk as MetalType,
      name: METAL_CONFIG[mk as MetalType].name,
      value: data.value,
      cost: data.cost,
      gainEur,
      partValue: totalValue > 0 ? data.value / totalValue : 0,
      partGain: totalGain > 0 ? gainEur / totalGain : 0,
    });
  }

  return result.sort((a, b) => b.value - a.value);
}

// ── Position ranking ───────────────────────────────────────────────────────

export function computePositionRanking(
  fiscal: PortfolioFiscalSummary | null,
  positions: Position[],
  prices: Record<string, number | null>,
): PositionRanking[] {
  if (!fiscal) return [];

  return fiscal.positionFiscals.map(pf => {
    const gainPct = pf.costPrice > 0 ? ((pf.salePrice - pf.costPrice) / pf.costPrice) * 100 : 0;
    const bestNet = Math.max(pf.netForf, pf.netPV);
    const bestRegime = pf.netPV >= pf.netForf ? 'Plus-values' : 'Forfaitaire';

    let fiscalNote: string | null = null;
    if (pf.isExempt) {
      fiscalNote = 'Position exonérée de plus-values';
    } else {
      const fc = computeFiscalCountdown(pf.pos.purchaseDate);
      if (fc) {
        const currentYears = fc.years;
        const nextTierYear = currentYears < TAX.abatementStartYear ? TAX.abatementStartYear : currentYears + 1;
        if (nextTierYear <= TAX.fullExemptionYear) {
          const purchaseDate = parseDate(pf.pos.purchaseDate);
          if (purchaseDate) {
            const tierDate = new Date(purchaseDate);
            tierDate.setFullYear(tierDate.getFullYear() + nextTierYear);
            const monthsToTier = Math.max(0, Math.ceil((tierDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
            if (monthsToTier <= STATS.FISCAL_WATCH_MONTHS) {
              fiscalNote = `Palier fiscal dans ${monthsToTier} mois`;
            }
          }
        }
      }
    }

    const regimeDelta = Math.abs(pf.netPV - pf.netForf);
    const regimeLabel = regimeDelta < 1 ? 'Net estimé identique sous les 2 régimes' : `Régime le plus favorable : ${bestRegime}`;

    return {
      id: pf.pos.id,
      product: stripMetalFromName(pf.pos.product),
      metal: pf.pos.metal,
      gainEur: pf.gainEur,
      gainPct,
      netEstimate: bestNet,
      regimeLabel,
      fiscalNote,
    };
  });
}
