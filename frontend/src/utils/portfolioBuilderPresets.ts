export interface PortfolioBuilderBucket {
  label: string;
  targetAllocationPct: number;
  tickers: string[];
}

export interface PortfolioBuilderPreset {
  id: string;
  name: string;
  description: string;
  buckets: PortfolioBuilderBucket[];
}

export const PORTFOLIO_BUILDER_PRESETS: PortfolioBuilderPreset[] = [
  {
    id: 'beginner',
    name: 'Beginner — Simple Starter',
    description:
      'A simple two-fund starting point: mostly broad US market exposure with a bond cushion to smooth out volatility. Good for a first portfolio you do not want to fuss over.',
    buckets: [
      { label: 'Total US Market', targetAllocationPct: 70, tickers: ['VTI', 'SPY'] },
      { label: 'Bonds', targetAllocationPct: 30, tickers: ['BND'] },
    ],
  },
  {
    id: 'conservative',
    name: 'Conservative — Capital Preservation',
    description:
      'Bond-heavy for stability, with modest US and international equity exposure for some growth. Suited to a lower risk tolerance or a shorter time horizon.',
    buckets: [
      { label: 'Bonds', targetAllocationPct: 50, tickers: ['BND'] },
      { label: 'Total US Market', targetAllocationPct: 30, tickers: ['VTI', 'SPY'] },
      { label: 'International', targetAllocationPct: 20, tickers: ['VXUS'] },
    ],
  },
  {
    id: 'growth',
    name: 'Growth — Long-Term Aggressive',
    description:
      'Tilted toward growth and technology exposure alongside broad US market coverage. Suited to a higher risk tolerance and a long investment horizon.',
    buckets: [
      { label: 'US Growth', targetAllocationPct: 50, tickers: ['QQQ', 'VUG'] },
      { label: 'Total US Market', targetAllocationPct: 50, tickers: ['VTI', 'SPY'] },
    ],
  },
];
