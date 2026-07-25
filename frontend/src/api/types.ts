// frontend/src/api/types.ts
export interface Portfolio {
  id: number;
  name: string;
  cash_usd: number;
  target_allocation_pct: number | null;
  created_at: string;
}

export interface PortfolioCreateInput {
  name: string;
  cash_usd?: number;
  target_allocation_pct?: number | null;
}

export interface PortfolioUpdateInput {
  name?: string;
  cash_usd?: number;
  target_allocation_pct?: number | null;
}

export interface Holding {
  id: number;
  portfolio_id: number;
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  target_allocation_pct: number | null;
  realized_pnl_usd: number;
  created_at: string;
  updated_at: string;
}

export interface HoldingCreateInput {
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  target_allocation_pct?: number | null;
}

export interface HoldingUpdateInput {
  ticker?: string;
  shares?: number;
  avg_cost_usd?: number;
  target_allocation_pct?: number | null;
  realized_pnl_usd?: number;
}

export interface HoldingStats {
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  current_price: number;
  value: number;
  current_pct: number;
  target_pct: number | null;
  deviation_pp: number | null;
  severity: 'green' | 'yellow' | 'red' | null;
  unrealized_pnl: number;
  realized_pnl: number;
}

export interface PortfolioSummary {
  id: number;
  name: string;
  cash_usd: number;
  target_allocation_pct: number | null;
  holdings_value: number;
  total_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  holdings: HoldingStats[];
}

export interface MarketData {
  price: number | null;
  dividend_yield_pct: number | null;
  growth_rate_pct: number | null;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  category: string | null;
  created_at: string;
}

export interface WatchlistItemCreateInput {
  ticker: string;
  category?: string | null;
}

export type ScanPeriod = '1d' | '1w' | '1m';

export interface PriceSignalRow {
  ticker: string;
  percent_change_pct: number | null;
  rsi_14: number | null;
  volume_ratio: number | null;
  distance_from_sma50_pct: number | null;
  bb_width_pct: number | null;
  bb_width_percentile: number | null;
  atr_pct: number | null;
}

export interface DividendSignalRow {
  ticker: string;
  price: number | null;
  gross_yield_pct: number | null;
  payment_frequency: number | null;
  dividend_growth_pct: number | null;
}
