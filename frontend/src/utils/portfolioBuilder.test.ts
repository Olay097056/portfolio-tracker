import { describe, expect, it } from 'vitest';
import { buildPortfolioPlan } from './portfolioBuilder';
import type { PortfolioBuilderPreset } from './portfolioBuilderPresets';

const preset: PortfolioBuilderPreset = {
  id: 'test-preset',
  name: 'Test Preset',
  description: 'test',
  buckets: [
    { label: 'Bucket A', targetAllocationPct: 60, tickers: ['AAA', 'BBB'] },
    { label: 'Bucket B', targetAllocationPct: 40, tickers: ['CCC'] },
  ],
};

describe('buildPortfolioPlan', () => {
  it('splits each bucket allocation evenly across its candidate tickers', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 100000,
      usdThbRate: 30,
      pricesUsd: { AAA: 100, BBB: 200, CCC: 50 },
    });

    expect(lines).toHaveLength(3);
    const aaa = lines.find((l) => l.ticker === 'AAA');
    expect(aaa).toBeDefined();
    expect(aaa!.capitalThb).toBeCloseTo(30000, 5);
    expect(aaa!.capitalUsd).toBeCloseTo(1000, 5);
    expect(aaa!.shares).toBeCloseTo(10, 5);
  });

  it('skips a ticker whose price is unavailable instead of fabricating a share count', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 100000,
      usdThbRate: 30,
      pricesUsd: { AAA: 100, CCC: 50 },
    });

    expect(lines.find((l) => l.ticker === 'BBB')).toBeUndefined();
    expect(lines).toHaveLength(2);
  });

  it('returns an empty array when the USD/THB rate is zero or negative', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 100000,
      usdThbRate: 0,
      pricesUsd: { AAA: 100, BBB: 200, CCC: 50 },
    });

    expect(lines).toEqual([]);
  });

  it('returns an empty array for zero capital', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 0,
      usdThbRate: 30,
      pricesUsd: { AAA: 100, BBB: 200, CCC: 50 },
    });

    expect(lines).toEqual([]);
  });

  it('calculates exact targetAllocationPct per ticker', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 100000,
      usdThbRate: 30,
      pricesUsd: { AAA: 100, BBB: 200, CCC: 50 },
    });

    const aaa = lines.find((l) => l.ticker === 'AAA');
    const ccc = lines.find((l) => l.ticker === 'CCC');
    expect(aaa?.targetAllocationPct).toBe(30); // 60% bucket split between 2 tickers
    expect(ccc?.targetAllocationPct).toBe(40); // 40% bucket for 1 ticker
  });
});

