// Pure display helpers for the EstimationCard shown in the Add Position
// screen. The parent owns every business calculation, every euro
// formatting, and the decision to render. These helpers only assemble
// final strings and pick the gain/loss tone from a rounded display value
// already prepared by the parent.

export type EstimationDisplayTone = 'positive' | 'negative' | 'neutral';

export type EstimationDisclaimerVariant = 'standard' | 'silver';

export type EstimationDisplayModel = {
  title: string;
  estimatedValueLabel: string;
  gainLossLabel?: string;
  gainLossTone: EstimationDisplayTone;
  helperText?: string;
  disclaimerText?: string;
};

const ESTIMATION_TITLE = 'Estimation actuelle';

const DISCLAIMER_STANDARD =
  'Estimation basée sur le cours spot · Hors prime revendeur';

const DISCLAIMER_SILVER =
  'Estimation basée sur le spot métal · L’écart au prix payé peut inclure TVA, prime, marge ou frais';

export function buildGainLossDisplay(params: {
  roundedGainLossValue: number | null;
  absoluteGainLossLabel?: string;
}): {
  gainLossLabel?: string;
  gainLossTone: EstimationDisplayTone;
} {
  const { roundedGainLossValue, absoluteGainLossLabel } = params;

  if (roundedGainLossValue === null) {
    return { gainLossTone: 'neutral' };
  }

  if (roundedGainLossValue === 0) {
    return {
      gainLossLabel:
        absoluteGainLossLabel !== undefined
          ? `${absoluteGainLossLabel} €`
          : undefined,
      gainLossTone: 'neutral',
    };
  }

  if (roundedGainLossValue > 0) {
    return {
      gainLossLabel:
        absoluteGainLossLabel !== undefined
          ? `+${absoluteGainLossLabel} €`
          : undefined,
      gainLossTone: 'positive',
    };
  }

  return {
    gainLossLabel:
      absoluteGainLossLabel !== undefined
        ? `-${absoluteGainLossLabel} €`
        : undefined,
    gainLossTone: 'negative',
  };
}

export function buildEstimationHelperText(params: {
  spotPriceLabel: string;
  unitLabel: string;
}): string {
  return `Cours spot : ${params.spotPriceLabel} · ${params.unitLabel} par unité`;
}

export function buildEstimationDisclaimerText(
  variant: EstimationDisclaimerVariant,
): string {
  return variant === 'silver' ? DISCLAIMER_SILVER : DISCLAIMER_STANDARD;
}

export function buildEstimationDisplayModel(params: {
  estimatedValueLabel: string;
  roundedGainLossValue: number | null;
  absoluteGainLossLabel?: string;
  spotPriceLabel?: string;
  unitLabel?: string;
  disclaimerVariant?: EstimationDisclaimerVariant;
}): EstimationDisplayModel {
  const gainLoss = buildGainLossDisplay({
    roundedGainLossValue: params.roundedGainLossValue,
    absoluteGainLossLabel: params.absoluteGainLossLabel,
  });

  const helperText =
    params.spotPriceLabel !== undefined && params.unitLabel !== undefined
      ? buildEstimationHelperText({
          spotPriceLabel: params.spotPriceLabel,
          unitLabel: params.unitLabel,
        })
      : undefined;

  const disclaimerText =
    params.disclaimerVariant !== undefined
      ? buildEstimationDisclaimerText(params.disclaimerVariant)
      : undefined;

  return {
    title: ESTIMATION_TITLE,
    estimatedValueLabel: params.estimatedValueLabel,
    gainLossLabel: gainLoss.gainLossLabel,
    gainLossTone: gainLoss.gainLossTone,
    helperText,
    disclaimerText,
  };
}
