import { describe, expect, it } from 'vitest';
import { calculateRequiredPortfolio } from './passiveIncome';

describe('calculateRequiredPortfolio', () => {
  it('computes required portfolio from target income and net yield', () => {
    const result = calculateRequiredPortfolio({
      targetMonthlyIncomeThb: 10000,
      initialInvestmentThb: 50000,
      monthlyContributionThb: 5000,
      dividendYieldPct: 6,
      priceGrowthRatePct: 3,
      taxRatePct: 15,
    });

    const expected = (10000 * 12) / (0.06 * 0.85);
    expect(result.requiredPortfolioThb).toBeCloseTo(expected, 2);
  });

  it('finds a yearsToTarget within the 30-year horizon when achievable', () => {
    const result = calculateRequiredPortfolio({
      targetMonthlyIncomeThb: 10000,
      initialInvestmentThb: 50000,
      monthlyContributionThb: 5000,
      dividendYieldPct: 6,
      priceGrowthRatePct: 3,
      taxRatePct: 15,
    });

    expect(result.yearsToTarget).toBeGreaterThan(0);
    expect(result.yearsToTarget).toBeLessThanOrEqual(30);
    expect(result.isAchievableWithin30Years).toBe(true);
  });

  it('returns requiredPortfolioThb of 0 when dividend yield is zero', () => {
    const result = calculateRequiredPortfolio({
      targetMonthlyIncomeThb: 10000,
      initialInvestmentThb: 50000,
      monthlyContributionThb: 5000,
      dividendYieldPct: 0,
      priceGrowthRatePct: 3,
      taxRatePct: 15,
    });

    expect(result.requiredPortfolioThb).toBe(0);
  });

  it('caps yearsToTarget at 30 and marks unachievable when the target is never reached', () => {
    const result = calculateRequiredPortfolio({
      targetMonthlyIncomeThb: 10000000,
      initialInvestmentThb: 1000,
      monthlyContributionThb: 100,
      dividendYieldPct: 1,
      priceGrowthRatePct: 1,
      taxRatePct: 15,
    });

    expect(result.yearsToTarget).toBe(30);
    expect(result.isAchievableWithin30Years).toBe(false);
  });
});
