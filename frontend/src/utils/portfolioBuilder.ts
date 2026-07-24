import type { PortfolioBuilderPreset } from './portfolioBuilderPresets';

export interface PortfolioBuilderLine {
  ticker: string;
  bucketLabel: string;
  capitalThb: number;
  capitalUsd: number;
  priceUsd: number;
  shares: number;
}

export interface PortfolioBuilderPlanInput {
  preset: PortfolioBuilderPreset;
  capitalThb: number;
  usdThbRate: number;
  pricesUsd: Record<string, number>;
}

export function buildPortfolioPlan(input: PortfolioBuilderPlanInput): PortfolioBuilderLine[] {
  const { preset, capitalThb, usdThbRate, pricesUsd } = input;

  if (capitalThb <= 0 || usdThbRate <= 0) {
    return [];
  }

  const lines: PortfolioBuilderLine[] = [];

  for (const bucket of preset.buckets) {
    const bucketCapitalThb = capitalThb * (bucket.targetAllocationPct / 100);
    const perTickerCapitalThb = bucketCapitalThb / bucket.tickers.length;

    for (const ticker of bucket.tickers) {
      const priceUsd = pricesUsd[ticker];
      if (priceUsd === undefined || priceUsd <= 0) {
        continue;
      }
      const capitalUsd = perTickerCapitalThb / usdThbRate;
      const shares = capitalUsd / priceUsd;
      lines.push({ ticker, bucketLabel: bucket.label, capitalThb: perTickerCapitalThb, capitalUsd, priceUsd, shares });
    }
  }

  return lines;
}
