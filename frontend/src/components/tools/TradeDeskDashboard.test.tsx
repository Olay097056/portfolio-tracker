import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TradeDeskDashboard } from './TradeDeskDashboard';
import * as client from '../../api/client';

vi.mock('../../api/client', () => ({
  getTradeDeskState: vi.fn(),
  getHyperliquidMarkets: vi.fn(),
  triggerTradeDeskTurn: vi.fn(),
}));

const MOCK_STATE = {
  teams: [{
    code: 'DEEPSEEK', name_th: 'ทีม DeepSeek', name_en: 'Team DeepSeek',
    status: 'active', capital: 10000, balance: 9000, equity: 10800,
    pnl_pct: 8.0, margin_used: 1000,
    weekly_target_pct: 1.5, weekly_kpi_pct: 1.5,
    next_turn_at: '2026-08-12T15:00:00Z', turns_today: 3,
    cost_today_usd: 0.003, cost_total_usd: 0.05,
  }],
  positions: {
    open: [{ id: '1', symbol: 'BTC', side: 'long', size_pct: 5, entry_price: 63500, mark_price: null, sl_pct: 5, tp_pct: 10, live_pnl: 2.5, opened_at: '2026-08-12T14:00:00Z' }],
    closed: [],
  },
  turns: [{ id: 't1', agenda: 'test', consensus: 'consensus', lead_decision: { action: 'hold', rationale: 'wait' }, tokens_in: 1000, tokens_out: 300, cost_usd: 0.001, trigger: 'manual', started_at: '2026-08-12T14:00:00Z' }],
  updated_at: '2026-08-12T14:30:00Z',
};

const MOCK_MARKETS = {
  markets: [{ symbol: 'BTC', category: 'crypto', mark_price: 63700, mid_price: 63700, change_24h_pct: 1.5, funding_rate: 0.001, open_interest: 1000000, volume_24h: 500, max_leverage: 40 }],
  total: 1, by_category: { crypto: 1, stocks: 0, macro: 0, fx: 0 }, updated_at: '2026-08-12T14:30:00Z',
};

describe('TradeDeskDashboard', () => {
  beforeEach(() => {
    vi.mocked(client.getTradeDeskState).mockResolvedValue(MOCK_STATE as never);
    vi.mocked(client.getHyperliquidMarkets).mockResolvedValue(MOCK_MARKETS as never);
  });

  it('renders team card with equity and P&L', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getByText('ทีม DeepSeek')).toBeTruthy());
    expect(screen.getAllByText('Equity').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P&L').length).toBeGreaterThan(0);
  });

  it('renders open positions table', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getAllByText('BTC').length).toBeGreaterThan(1));
    expect(screen.getByText('LONG')).toBeTruthy();
  });

  it('renders turn history', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getByText(/HOLD/)).toBeTruthy());
    expect(screen.getByText('consensus')).toBeTruthy();
  });

  it('shows manual turn button', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getByText(/สั่งเทิร์นเอง/)).toBeTruthy());
  });
});
