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
