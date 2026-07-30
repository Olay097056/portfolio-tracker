// frontend/src/utils/dividendYield.test.ts
import { describe, expect, it } from 'vitest';
import { netYieldPct } from './dividendYield';

describe('netYieldPct', () => {
  it('applies the tax rate to gross yield', () => {
    expect(netYieldPct(10.0, 20)).toBeCloseTo(8.0, 5);
  });

  it('matches the value previously hand-verified for 11.1% gross at 15% tax', () => {
    expect(netYieldPct(11.1, 15)).toBeCloseTo(9.435, 3);
  });

  it('returns null when gross yield is null', () => {
    expect(netYieldPct(null, 15)).toBeNull();
  });

  it('is zero when gross yield is zero, regardless of tax rate', () => {
    expect(netYieldPct(0, 15)).toBe(0);
  });

  it('returns gross yield unchanged at a zero tax rate', () => {
    expect(netYieldPct(10.0, 0)).toBeCloseTo(10.0, 5);
  });
});
