import { describe, expect, it } from 'vitest';
import { calculateStressTest } from './stressTest';

describe('calculateStressTest', () => {
  it('computes the fixed -5%/-10%/-20% scenarios from an investment and current price', () => {
    const scenarios = calculateStressTest({ investmentUsd: 1000, currentPriceUsd: 100 });

    expect(scenarios).toHaveLength(3);

    const [down5, down10, down20] = scenarios;
    expect(down5.label).toBe('-5%');
    expect(down5.targetPriceUsd).toBeCloseTo(95, 6);
    expect(down5.remainingValueUsd).toBeCloseTo(950, 6);
    expect(down5.moneyLostUsd).toBeCloseTo(50, 6);

    expect(down10.label).toBe('-10%');
    expect(down10.targetPriceUsd).toBeCloseTo(90, 6);
    expect(down10.remainingValueUsd).toBeCloseTo(900, 6);
    expect(down10.moneyLostUsd).toBeCloseTo(100, 6);

    expect(down20.label).toBe('-20%');
    expect(down20.targetPriceUsd).toBeCloseTo(80, 6);
    expect(down20.remainingValueUsd).toBeCloseTo(800, 6);
    expect(down20.moneyLostUsd).toBeCloseTo(200, 6);
  });

  it('appends a custom-target-price scenario when provided', () => {
    const scenarios = calculateStressTest({ investmentUsd: 1000, currentPriceUsd: 100, customTargetPriceUsd: 70 });

    expect(scenarios).toHaveLength(4);
    const custom = scenarios[3];
    expect(custom.label).toBe('Custom');
    expect(custom.targetPriceUsd).toBe(70);
    expect(custom.remainingValueUsd).toBeCloseTo(700, 6);
    expect(custom.moneyLostUsd).toBeCloseTo(300, 6);
  });

  it('returns zeroed scenarios when investment is zero', () => {
    const scenarios = calculateStressTest({ investmentUsd: 0, currentPriceUsd: 100 });

    for (const scenario of scenarios) {
      expect(scenario.remainingValueUsd).toBe(0);
      expect(scenario.moneyLostUsd).toBe(0);
    }
  });

  it('appends a custom scenario even when the custom target price is exactly 0', () => {
    const scenarios = calculateStressTest({ investmentUsd: 1000, currentPriceUsd: 100, customTargetPriceUsd: 0 });

    expect(scenarios).toHaveLength(4);
    const custom = scenarios[3];
    expect(custom.label).toBe('Custom');
    expect(custom.targetPriceUsd).toBe(0);
    expect(custom.remainingValueUsd).toBe(0);
    expect(custom.moneyLostUsd).toBeCloseTo(1000, 6);
  });

  it('does not divide by zero when currentPriceUsd is 0', () => {
    const scenarios = calculateStressTest({ investmentUsd: 1000, currentPriceUsd: 0 });

    for (const scenario of scenarios) {
      expect(scenario.remainingValueUsd).toBe(0);
      expect(scenario.moneyLostUsd).toBe(1000);
      expect(Number.isFinite(scenario.remainingValueUsd)).toBe(true);
      expect(Number.isFinite(scenario.moneyLostUsd)).toBe(true);
    }
  });
});
