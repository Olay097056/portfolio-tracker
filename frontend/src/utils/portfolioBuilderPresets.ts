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
    id: 'growth',
    name: 'Aggressive Growth',
    description:
      'High growth portfolio tilted heavily toward tech, innovation, and broad US market index ETFs. Designed for long-term capital appreciation and high risk tolerance.',
    buckets: [
      { label: 'US Tech & Growth', targetAllocationPct: 60, tickers: ['QQQ', 'VUG'] },
      { label: 'Total US Market', targetAllocationPct: 40, tickers: ['VTI', 'SPY'] },
    ],
  },
  {
    id: 'dividend',
    name: 'Dividend Income',
    description:
      'Cash flow focused portfolio investing in dividend growth leaders, high-yield equities, and covered-call option ETFs for robust monthly passive income.',
    buckets: [
      { label: 'Dividend Quality Growth', targetAllocationPct: 40, tickers: ['SCHD'] },
      { label: 'High Dividend Yield', targetAllocationPct: 30, tickers: ['VYM'] },
      { label: 'Option & Monthly Income', targetAllocationPct: 30, tickers: ['JEPI'] },
    ],
  },
  {
    id: 'conservative',
    name: 'Conservative',
    description:
      'Bond-heavy portfolio focused on capital preservation, volatility control, and steady income with modest US and international stock exposure.',
    buckets: [
      { label: 'Bonds & Fixed Income', targetAllocationPct: 50, tickers: ['BND'] },
      { label: 'Total US Market', targetAllocationPct: 30, tickers: ['VTI', 'SPY'] },
      { label: 'International Markets', targetAllocationPct: 20, tickers: ['VXUS'] },
    ],
  },
];
