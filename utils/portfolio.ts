import { Position } from '@/types/position';
import { MetalType, OZ_TO_G } from '@/constants/metals';
import {
  FiscalCountdown,
  RegimeComparison,
  computeFiscalCountdown,
  computeSellerNetForfaitaire,
  computeRegimeComparison,
} from '@/utils/fiscal';

// ── Types ──────────────────────────────────────────────────────────────────

export type PositionMetrics = {
  currentValue: number | null;
  totalCost: number;
  gainLoss: number | null;
  gainPct: number | null;
  sellerNetForfaitaire: number | null;
  fiscal: FiscalCountdown | null;
  regime: RegimeComparison | null;
};

export type PositionViewModel = {
  position: Position;
  metrics: PositionMetrics;
};

export type PortfolioSummary = {
  totalValue: number;
  totalCost: number;
  gain: number;
  gainPct: number;
  sellerNet: number;
  positionCount: number;
};

// ── Fonctions ──────────────────────────────────────────────────────────────

export function computePositionMetrics(
  pos: Position,
  spotPrice: number | null,
): PositionMetrics {
  const totalCost = pos.quantity * pos.purchasePrice;
  const currentValue = spotPrice !== null
    ? pos.quantity * (pos.weightG / OZ_TO_G) * spotPrice
    : null;
  const gainLoss = currentValue !== null ? currentValue - totalCost : null;
  const gainPct = gainLoss !== null && totalCost > 0
    ? (gainLoss / totalCost) * 100
    : null;
  const sellerNetForfaitaire = currentValue !== null
    ? computeSellerNetForfaitaire(currentValue)
    : null;
  const fiscal = computeFiscalCountdown(pos.purchaseDate);
  const regime = currentValue !== null && gainLoss !== null && fiscal
    ? computeRegimeComparison(currentValue, totalCost, fiscal.years)
    : null;

  return { currentValue, totalCost, gainLoss, gainPct, sellerNetForfaitaire, fiscal, regime };
}

export function computePositionViewModels(
  positions: Position[],
  getSpotPrice: (metal: MetalType) => number | null,
): PositionViewModel[] {
  return positions.map(pos => ({
    position: pos,
    metrics: computePositionMetrics(pos, getSpotPrice(pos.metal)),
  }));
}

export function computePortfolioSummary(viewModels: PositionViewModel[]): PortfolioSummary {
  let totalValue = 0;
  let totalCost = 0;

  for (const vm of viewModels) {
    totalCost += vm.metrics.totalCost;
    if (vm.metrics.currentValue !== null) {
      totalValue += vm.metrics.currentValue;
    }
  }

  const gain = totalCost > 0 ? totalValue - totalCost : 0;
  const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
  const sellerNet = computeSellerNetForfaitaire(totalValue);

  return { totalValue, totalCost, gain, gainPct, sellerNet, positionCount: viewModels.length };
}

export function sortPositions(viewModels: PositionViewModel[]): PositionViewModel[] {
  // Pas de tri explicite dans le code actuel — conserver l'ordre reçu
  return viewModels;
}

export function getBestPerformerName(viewModels: PositionViewModel[]): string | null {
  if (viewModels.length < 2) return null;
  let bestPct = -Infinity;
  let bestName = '';
  for (const vm of viewModels) {
    const pct = vm.metrics.gainPct;
    if (pct !== null && pct > bestPct) {
      bestPct = pct;
      bestName = vm.position.product;
    }
  }
  return bestName || null;
}
