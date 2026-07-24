import { describe, expect, it } from 'vitest';
import { PORTFOLIO_BUILDER_PRESETS } from './portfolioBuilderPresets';

describe('PORTFOLIO_BUILDER_PRESETS', () => {
  it('defines at least one preset', () => {
    expect(PORTFOLIO_BUILDER_PRESETS.length).toBeGreaterThan(0);
  });

  it('each preset has a non-empty name, description, and buckets that allocate exactly 100%', () => {
    for (const preset of PORTFOLIO_BUILDER_PRESETS) {
      expect(preset.name.trim().length).toBeGreaterThan(0);
      expect(preset.description.trim().length).toBeGreaterThan(0);
      expect(preset.buckets.length).toBeGreaterThan(0);

      const total = preset.buckets.reduce((sum, bucket) => sum + bucket.targetAllocationPct, 0);
      expect(total).toBeCloseTo(100, 5);

      for (const bucket of preset.buckets) {
        expect(bucket.tickers.length).toBeGreaterThan(0);
      }
    }
  });

  it('every preset has a unique id', () => {
    const ids = PORTFOLIO_BUILDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
