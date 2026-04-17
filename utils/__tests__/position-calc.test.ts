import { OZ_TO_G } from '../../constants/metals';
import { computePositionCost, computePositionValue } from '../position-calc';

describe('computePositionValue', () => {
  it('returns null when spot is null', () => {
    expect(computePositionValue({ quantity: 2, weightG: 31.1 }, null)).toBeNull();
  });

  it('computes quantity × (weightG / OZ_TO_G) × spot', () => {
    const spot = 1000;
    const pos = { quantity: 2, weightG: 31.1 };
    const expected = 2 * (31.1 / OZ_TO_G) * spot;
    expect(computePositionValue(pos, spot)).toBeCloseTo(expected, 6);
  });

  it('returns 0 when quantity or weight is 0', () => {
    expect(computePositionValue({ quantity: 0, weightG: 31.1 }, 1000)).toBe(0);
    expect(computePositionValue({ quantity: 2, weightG: 0 }, 1000)).toBe(0);
  });

  it('propagates a spot of 0 as a value of 0', () => {
    expect(computePositionValue({ quantity: 2, weightG: 31.1 }, 0)).toBe(0);
  });

  it('handles fractional quantity', () => {
    const spot = 2000;
    const pos = { quantity: 0.5, weightG: 10 };
    const expected = 0.5 * (10 / OZ_TO_G) * spot;
    expect(computePositionValue(pos, spot)).toBeCloseTo(expected, 6);
  });
});

describe('computePositionCost', () => {
  it('computes quantity × purchasePrice', () => {
    expect(computePositionCost({ quantity: 3, purchasePrice: 500 })).toBe(1500);
  });

  it('does not filter purchasePrice of 0 (caller decides)', () => {
    expect(computePositionCost({ quantity: 2, purchasePrice: 0 })).toBe(0);
  });

  it('does not filter negative purchasePrice (caller decides)', () => {
    expect(computePositionCost({ quantity: 2, purchasePrice: -10 })).toBe(-20);
  });

  it('handles fractional quantity', () => {
    expect(computePositionCost({ quantity: 0.5, purchasePrice: 1000 })).toBe(500);
  });
});
