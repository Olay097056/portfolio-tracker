// frontend/src/utils/dividendYield.ts
export function netYieldPct(grossYieldPct: number | null, taxRatePct: number): number | null {
  return grossYieldPct == null ? null : grossYieldPct * (1 - taxRatePct / 100);
}
