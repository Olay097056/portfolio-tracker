import { describe, expect, it } from 'vitest';
import { computeDynamicSrMatrix } from './dynamicSrMatrix';

describe('computeDynamicSrMatrix', () => {
  it('returns empty array when currentPrice is null or invalid', () => {
    expect(computeDynamicSrMatrix(null, null, [])).toEqual([]);
    expect(computeDynamicSrMatrix(0, null, [])).toEqual([]);
  });

  it('maps custom zones directly when zones exist', () => {
    const zones = [
      { id: 1, kind: 'resistance' as const, price: 150, strength: null, source: 'manual' as const },
      { id: 2, kind: 'support' as const, price: 90, strength: null, source: 'manual' as const },
    ];
    const matrix = computeDynamicSrMatrix(100, null, zones);
    expect(matrix.length).toBe(3);
    expect(matrix[0].label).toContain('R1');
    expect(matrix[0].price).toBe(150);
    expect(matrix[1].label).toContain('S0');
    expect(matrix[2].label).toContain('S1');
    expect(matrix[2].price).toBe(90);
  });

  it('computes dynamic Pivot Points from chart points when no custom zones exist', () => {
    const points = [
      { time: '2026-01-01', open: 100, high: 120, low: 80, close: 105, volume: 1000 },
      { time: '2026-01-02', open: 105, high: 130, low: 95, close: 110, volume: 1200 },
    ];

    const matrix = computeDynamicSrMatrix(110, points, []);
    expect(matrix.length).toBe(9);
    expect(matrix[0].kind).toBe('resistance');
    expect(matrix[0].price).toBeGreaterThan(110);
    expect(matrix[3].kind).toBe('current');
    expect(matrix[3].price).toBe(110);
    expect(matrix[4].kind).toBe('support');
    expect(matrix[4].price).toBeLessThan(110);
  });
});
