import { describe, expect, it } from 'vitest';
import { calculateDca } from './dca';

describe('calculateDca', () => {
  it('computes new shares, average cost, and total cost after adding an investment', () => {
    const result = calculateDca({
      currentShares: 12,
      currentAvgCostUsd: 187.4,
      additionalInvestmentUsd: 1000,
      currentPriceUsd: 333.74,
    });

    const expectedNewShares = 12 + 1000 / 333.74;
    const expectedTotalCost = 12 * 187.4 + 1000;

    expect(result.newShares).toBeCloseTo(expectedNewShares, 6);
    expect(result.newTotalCostUsd).toBeCloseTo(expectedTotalCost, 6);
    expect(result.newAvgCostUsd).toBeCloseTo(expectedTotalCost / expectedNewShares, 6);
  });

  it('returns the unchanged position when additional investment is zero', () => {
    const result = calculateDca({
      currentShares: 10,
      currentAvgCostUsd: 100,
      additionalInvestmentUsd: 0,
      currentPriceUsd: 150,
    });

    expect(result.newShares).toBe(10);
    expect(result.newAvgCostUsd).toBe(100);
    expect(result.newTotalCostUsd).toBe(1000);
  });

  it('starting from zero shares, new average cost equals the current price', () => {
    const result = calculateDca({
      currentShares: 0,
      currentAvgCostUsd: 0,
      additionalInvestmentUsd: 500,
      currentPriceUsd: 50,
    });

    expect(result.newShares).toBe(10);
    expect(result.newAvgCostUsd).toBe(50);
    expect(result.newTotalCostUsd).toBe(500);
  });
});
