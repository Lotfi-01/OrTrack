export type SilverBreakdownInput = {
  unitPriceTTC: number;
  quantity: number;
  vatRate: number | null;
};

export type SilverBreakdown = {
  totalPaidTTC: number;
  estimatedExVatAmount: number | null;
  estimatedVatImpact: number | null;
};

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive finite number`);
  }
}

export function computeSilverBreakdown(input: SilverBreakdownInput): SilverBreakdown {
  assertPositiveFinite(input.unitPriceTTC, 'unitPriceTTC');
  assertPositiveFinite(input.quantity, 'quantity');

  const totalPaidTTC = input.unitPriceTTC * input.quantity;

  if (input.vatRate === null) {
    return {
      totalPaidTTC,
      estimatedExVatAmount: null,
      estimatedVatImpact: null,
    };
  }

  if (!Number.isFinite(input.vatRate) || input.vatRate < 0) {
    throw new Error('vatRate must be null or a non-negative finite number');
  }

  const estimatedExVatAmount = totalPaidTTC / (1 + input.vatRate);

  return {
    totalPaidTTC,
    estimatedExVatAmount,
    estimatedVatImpact: totalPaidTTC - estimatedExVatAmount,
  };
}
