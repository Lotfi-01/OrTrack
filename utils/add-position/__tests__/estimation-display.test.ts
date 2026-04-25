import {
  buildEstimationDisclaimerText,
  buildEstimationDisplayModel,
  buildEstimationHelperText,
  buildGainLossDisplay,
} from '../estimation-display';

describe('buildGainLossDisplay', () => {
  it('returns positive tone and signed label for a positive rounded value', () => {
    const result = buildGainLossDisplay({
      roundedGainLossValue: 123.45,
      absoluteGainLossLabel: '123,45',
    });

    expect(result.gainLossTone).toBe('positive');
    expect(result.gainLossLabel).toBe('+123,45 €');
  });

  it('returns negative tone and signed label for a negative rounded value', () => {
    const result = buildGainLossDisplay({
      roundedGainLossValue: -123.45,
      absoluteGainLossLabel: '123,45',
    });

    expect(result.gainLossTone).toBe('negative');
    expect(result.gainLossLabel).toBe('-123,45 €');
  });

  it('returns neutral tone and unsigned 0,00 € label for a zero rounded value', () => {
    const result = buildGainLossDisplay({
      roundedGainLossValue: 0,
      absoluteGainLossLabel: '0,00',
    });

    expect(result.gainLossTone).toBe('neutral');
    expect(result.gainLossLabel).toBe('0,00 €');
  });

  it('returns no gain/loss label and neutral tone when rounded value is null', () => {
    const result = buildGainLossDisplay({
      roundedGainLossValue: null,
      absoluteGainLossLabel: '123,45',
    });

    expect(result.gainLossTone).toBe('neutral');
    expect(result.gainLossLabel).toBeUndefined();
  });

  it('treats -0 the same as 0 (neutral, unsigned)', () => {
    const result = buildGainLossDisplay({
      roundedGainLossValue: -0,
      absoluteGainLossLabel: '0,00',
    });

    expect(result.gainLossTone).toBe('neutral');
    expect(result.gainLossLabel).toBe('0,00 €');
  });

  it('uses the parent-provided absolute label without adding any sign character to it', () => {
    const result = buildGainLossDisplay({
      roundedGainLossValue: 1234.56,
      absoluteGainLossLabel: '1 234,56',
    });

    expect(result.gainLossLabel).toBe('+1 234,56 €');
    expect(result.gainLossLabel?.includes('--')).toBe(false);
    expect(result.gainLossLabel?.startsWith('++')).toBe(false);
  });
});

describe('buildEstimationHelperText', () => {
  it('matches the exact previous wording with €/oz unit and middot spacing', () => {
    const result = buildEstimationHelperText({
      spotPriceLabel: '3 500 €/oz',
      unitLabel: '6,45 g',
    });

    expect(result).toBe('Cours spot : 3 500 €/oz · 6,45 g par unité');
  });

  it('passes the spot price label through unchanged (the /oz unit is supplied by the caller)', () => {
    const result = buildEstimationHelperText({
      spotPriceLabel: '50,00 €/oz',
      unitLabel: '31,1 g',
    });

    expect(result).toBe('Cours spot : 50,00 €/oz · 31,1 g par unité');
  });
});

describe('buildEstimationDisclaimerText', () => {
  it('returns the exact previous standard disclaimer wording', () => {
    expect(buildEstimationDisclaimerText('standard')).toBe(
      'Estimation basée sur le cours spot · Hors prime revendeur',
    );
  });

  it('returns the exact previous silver disclaimer wording', () => {
    expect(buildEstimationDisclaimerText('silver')).toBe(
      'Estimation basée sur le spot métal · L’écart au prix payé peut inclure TVA, prime, marge ou frais',
    );
  });
});

describe('buildEstimationDisplayModel', () => {
  it('passes estimatedValueLabel through unchanged and uses the fixed estimation title', () => {
    const model = buildEstimationDisplayModel({
      estimatedValueLabel: '2 345,67 €',
      roundedGainLossValue: 100,
      absoluteGainLossLabel: '100,00',
      spotPriceLabel: '1 234,56 €/oz',
      unitLabel: '7,32 g',
      disclaimerVariant: 'standard',
    });

    expect(model.title).toBe('Estimation actuelle');
    expect(model.estimatedValueLabel).toBe('2 345,67 €');
  });

  it('assembles a full positive-gain standard model with €/oz helper text', () => {
    const model = buildEstimationDisplayModel({
      estimatedValueLabel: '2 345,67 €',
      roundedGainLossValue: 100,
      absoluteGainLossLabel: '100,00',
      spotPriceLabel: '1 234,56 €/oz',
      unitLabel: '7,32 g',
      disclaimerVariant: 'standard',
    });

    expect(model.gainLossLabel).toBe('+100,00 €');
    expect(model.gainLossTone).toBe('positive');
    expect(model.helperText).toBe(
      'Cours spot : 1 234,56 €/oz · 7,32 g par unité',
    );
    expect(model.helperText?.includes('€/oz')).toBe(true);
    expect(model.disclaimerText).toBe(
      'Estimation basée sur le cours spot · Hors prime revendeur',
    );
  });

  it('assembles a full negative-gain silver model with €/oz helper text', () => {
    const model = buildEstimationDisplayModel({
      estimatedValueLabel: '50,00 €',
      roundedGainLossValue: -25.5,
      absoluteGainLossLabel: '25,50',
      spotPriceLabel: '30,00 €/oz',
      unitLabel: '31,1 g',
      disclaimerVariant: 'silver',
    });

    expect(model.gainLossLabel).toBe('-25,50 €');
    expect(model.gainLossTone).toBe('negative');
    expect(model.helperText).toBe(
      'Cours spot : 30,00 €/oz · 31,1 g par unité',
    );
    expect(model.disclaimerText).toBe(
      'Estimation basée sur le spot métal · L’écart au prix payé peut inclure TVA, prime, marge ou frais',
    );
  });

  it('omits gainLossLabel and uses neutral tone when roundedGainLossValue is null', () => {
    const model = buildEstimationDisplayModel({
      estimatedValueLabel: '50,00 €',
      roundedGainLossValue: null,
      spotPriceLabel: '30,00 €/oz',
      unitLabel: '31,1 g',
      disclaimerVariant: 'standard',
    });

    expect(model.gainLossLabel).toBeUndefined();
    expect(model.gainLossTone).toBe('neutral');
  });

  it('omits helperText when spotPriceLabel is missing', () => {
    const model = buildEstimationDisplayModel({
      estimatedValueLabel: '50,00 €',
      roundedGainLossValue: 0,
      absoluteGainLossLabel: '0,00',
      unitLabel: '31,1 g',
      disclaimerVariant: 'standard',
    });

    expect(model.helperText).toBeUndefined();
  });

  it('omits helperText when unitLabel is missing', () => {
    const model = buildEstimationDisplayModel({
      estimatedValueLabel: '50,00 €',
      roundedGainLossValue: 0,
      absoluteGainLossLabel: '0,00',
      spotPriceLabel: '30,00 €/oz',
      disclaimerVariant: 'standard',
    });

    expect(model.helperText).toBeUndefined();
  });

  it('omits disclaimerText when disclaimerVariant is missing', () => {
    const model = buildEstimationDisplayModel({
      estimatedValueLabel: '50,00 €',
      roundedGainLossValue: 0,
      absoluteGainLossLabel: '0,00',
      spotPriceLabel: '30,00 €/oz',
      unitLabel: '31,1 g',
    });

    expect(model.disclaimerText).toBeUndefined();
  });

  it('omits both helperText and disclaimerText when no spot/variant info is supplied', () => {
    const model = buildEstimationDisplayModel({
      estimatedValueLabel: '50,00 €',
      roundedGainLossValue: 0,
      absoluteGainLossLabel: '0,00',
    });

    expect(model.helperText).toBeUndefined();
    expect(model.disclaimerText).toBeUndefined();
    expect(model.title).toBe('Estimation actuelle');
    expect(model.estimatedValueLabel).toBe('50,00 €');
    expect(model.gainLossLabel).toBe('0,00 €');
    expect(model.gainLossTone).toBe('neutral');
  });
});
