// frontend/src/utils/dynamicSrMatrix.ts
import type { ChartPoint, Zone } from '../api/types';

export interface SrMatrixRow {
  label: string;
  pct: number;
  price: number;
  kind: 'resistance' | 'current' | 'support';
}

/**
 * Computes dynamic S/R matrix levels from real chart points and active zones.
 * If active zones exist, maps them directly.
 * If no active zones exist, calculates dynamic Standard Pivot Points & Fibonacci levels
 * from the actual High, Low, and Close prices of the current chart points.
 */
export function computeDynamicSrMatrix(
  currentPriceRaw: number | null,
  points: ChartPoint[] | null,
  zones: Zone[]
): SrMatrixRow[] {
  if (currentPriceRaw === null || currentPriceRaw <= 0) {
    return [];
  }

  // If user has active zones (auto or manual), map them
  if (zones && zones.length > 0) {
    const resistances = zones
      .filter((z) => z.kind === 'resistance')
      .sort((a, b) => b.price - a.price)
      .map((z, i, arr) => ({
        label: `R${arr.length - i} (Target ${arr.length - i})`,
        pct: ((z.price - currentPriceRaw) / currentPriceRaw) * 100,
        price: z.price,
        kind: 'resistance' as const,
      }));

    const supports = zones
      .filter((z) => z.kind === 'support')
      .sort((a, b) => b.price - a.price)
      .map((z, i) => ({
        label: `S${i + 1} (Dip Buy ${i + 1})`,
        pct: ((z.price - currentPriceRaw) / currentPriceRaw) * 100,
        price: z.price,
        kind: 'support' as const,
      }));

    return [
      ...resistances,
      { label: 'S0 (Baseline)', pct: 0, price: currentPriceRaw, kind: 'current' as const },
      ...supports,
    ];
  }

  // If no zones exist yet, compute dynamic Pivot Points & Fibonacci levels from real chart points
  if (!points || points.length === 0) {
    // Basic fallback if points are not loaded yet
    return [
      { label: 'R3 (Target 3)', pct: 15.0, price: currentPriceRaw * 1.15, kind: 'resistance' },
      { label: 'R2 (Target 2)', pct: 10.0, price: currentPriceRaw * 1.1, kind: 'resistance' },
      { label: 'R1 (Target 1)', pct: 5.0, price: currentPriceRaw * 1.05, kind: 'resistance' },
      { label: 'S0 (Baseline)', pct: 0, price: currentPriceRaw, kind: 'current' },
      { label: 'S1 (Dip Buy 1)', pct: -5.0, price: currentPriceRaw * 0.95, kind: 'support' },
      { label: 'S2 (Dip Buy 2)', pct: -10.0, price: currentPriceRaw * 0.9, kind: 'support' },
      { label: 'S3 (Dip Buy 3)', pct: -15.0, price: currentPriceRaw * 0.85, kind: 'support' },
    ];
  }

  const highs = points.map((p) => p.high ?? p.close);
  const lows = points.map((p) => p.low ?? p.close);
  const closes = points.map((p) => p.close);

  const highestPrice = Math.max(...highs);
  const lowestPrice = Math.min(...lows);
  const latestClose = closes[closes.length - 1];

  // Standard Pivot Point P = (High + Low + Close) / 3
  const P = (highestPrice + lowestPrice + latestClose) / 3.0;

  // Resistance levels
  const r1 = 2 * P - lowestPrice;
  const r2 = P + (highestPrice - lowestPrice);
  const r3 = highestPrice + 2 * (P - lowestPrice);

  // Support levels
  const s1 = 2 * P - highestPrice;
  const s2 = P - (highestPrice - lowestPrice);
  const s3 = lowestPrice - 2 * (highestPrice - P);
  const s4 = P - 1.382 * (highestPrice - lowestPrice);
  const s5 = P - 1.618 * (highestPrice - lowestPrice);

  // Ensure logical ordering & prices relative to current price
  const validR1 = Math.max(r1, latestClose * 1.02);
  const validR2 = Math.max(r2, validR1 * 1.03);
  const validR3 = Math.max(r3, validR2 * 1.04);

  const validS1 = Math.min(s1, latestClose * 0.98);
  const validS2 = Math.min(s2, validS1 * 0.97);
  const validS3 = Math.min(s3, validS2 * 0.96);
  const validS4 = Math.min(s4, validS3 * 0.95);
  const validS5 = Math.min(s5, validS4 * 0.94);

  const toPct = (price: number) => ((price - currentPriceRaw) / currentPriceRaw) * 100;

  return [
    { label: 'R3 (Target 3)', pct: toPct(validR3), price: validR3, kind: 'resistance' },
    { label: 'R2 (Target 2)', pct: toPct(validR2), price: validR2, kind: 'resistance' },
    { label: 'R1 (Target 1)', pct: toPct(validR1), price: validR1, kind: 'resistance' },
    { label: 'S0 (Baseline)', pct: 0, price: currentPriceRaw, kind: 'current' },
    { label: 'S1 (Dip Buy 1)', pct: toPct(validS1), price: validS1, kind: 'support' },
    { label: 'S2 (Dip Buy 2)', pct: toPct(validS2), price: validS2, kind: 'support' },
    { label: 'S3 (Dip Buy 3)', pct: toPct(validS3), price: validS3, kind: 'support' },
    { label: 'S4 (Deep Dip)', pct: toPct(validS4), price: validS4, kind: 'support' },
    { label: 'S5 (Crisis Dip)', pct: toPct(validS5), price: validS5, kind: 'support' },
  ];
}
