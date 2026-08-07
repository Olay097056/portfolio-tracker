import { describe, expect, it } from 'vitest';
import { calculateDcaProjection } from './dcaProjection';

describe('calculateDcaProjection', () => {
  it('returns one entry per year', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 5,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result).toHaveLength(5);
  });

  it('accumulates total invested as initial plus all monthly contributions', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 5,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result[4].totalInvestedThb).toBe(700000);
  });

  it('grows the portfolio beyond total invested when reinvesting a positive net yield', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 5,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result[4].portfolioValueThb).toBeGreaterThan(700000);
  });

  it('does not grow the portfolio beyond contributions when not reinvesting and growth is zero', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 2,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: false,
      taxRatePct: 15,
    });

    expect(result[1].portfolioValueThb).toBe(result[1].totalInvestedThb);
  });

  it('returns an empty array for zero years', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 0,
      years: 0,
      dividendYieldPct: 5,
      priceGrowthRatePct: 5,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result).toEqual([]);
  });

  it('calculates gross annual dividend and 15% withheld tax correctly for each year', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 2,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result[0].annualContributionThb).toBe(220000); // 100k + 12*10k
    expect(result[0].grossAnnualDividendThb).toBeGreaterThan(0);
    expect(result[0].annualTaxWithheldThb).toBeCloseTo(result[0].grossAnnualDividendThb * 0.15, 2);
    expect(result[0].netAnnualDividendThb).toBeCloseTo(result[0].grossAnnualDividendThb * 0.85, 2);
  });
});

