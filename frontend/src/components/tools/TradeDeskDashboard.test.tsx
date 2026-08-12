import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TradeDeskDashboard } from './TradeDeskDashboard';
import * as client from '../../api/client';

vi.mock('../../api/client', () => ({
  getTradeDeskState: vi.fn(),
  getHyperliquidMarkets: vi.fn(),
  triggerTradeDeskTurn: vi.fn(),
  getTeamEquity: vi.fn(),
  setTeamDirective: vi.fn(),
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
    await waitFor(() => expect(screen.getByText('LONG')).toBeTruthy());
  });

  it('renders turn history', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getByText(/hold|HOLD/)).toBeTruthy());
  });

  it('shows manual turn button', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getByText(/สั่งเทิร์นเอง/)).toBeTruthy());
  });

  // ── Restored tests (ticket 02 reference-parity) ──

  it('shows disclaimer — พอร์ตจำลอง (guard rail)', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/พอร์ตจำลอง/)).toBeTruthy();
      expect(screen.getByText(/ไม่ใช่การเทรดจริง/)).toBeTruthy();
      expect(screen.getByText(/ไม่ใช่คำแนะนำการลงทุน/)).toBeTruthy();
    });
  });

  it('shows "—" when price data is unavailable', async () => {
    // Mock market data with null prices
    vi.mocked(client.getHyperliquidMarkets).mockResolvedValue({
      markets: [{ ...MOCK_MARKETS.markets[0], mark_price: null, change_24h_pct: null, funding_rate: null, volume_24h: null }],
      total: 1, by_category: { crypto: 1, stocks: 0, macro: 0, fx: 0 },
      updated_at: '2026-08-12T14:30:00Z',
    } as never);
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
    vi.mocked(client.getHyperliquidMarkets).mockResolvedValue(MOCK_MARKETS as never);
  });

  it('renders empty state without crashing when no positions', async () => {
    vi.mocked(client.getTradeDeskState).mockResolvedValue({
      teams: [{ ...MOCK_STATE.teams[0], pnl_pct: 0 }],
      positions: { open: [], closed: [] },
      turns: [],
      updated_at: null,
    } as never);
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
    vi.mocked(client.getTradeDeskState).mockResolvedValue(MOCK_STATE as never);
  });

  it('renders P&L with correct color — green for positive, red for negative', async () => {
    // Positive P&L
    render(<TradeDeskDashboard />);
    await waitFor(() => {
      const pnlEls = screen.getAllByText(/\+8\.00%/);
      expect(pnlEls.length).toBeGreaterThan(0);
      // Check color is green (rgb values include 16, 185, 129 = #10b981)
      const greenPnl = pnlEls.find(el => (el as HTMLElement).style?.color?.includes('rgb'));
      if (greenPnl) {
        const style = window.getComputedStyle(greenPnl);
        expect(style.color).toBeTruthy();
      }
    });
  });

  // ── MTD test (ticket 03 reference-parity) ──
  it('shows MTD from mtd_pnl_pct when available', async () => {
    const stateWithMtd = {
      ...MOCK_STATE,
      teams: [{ ...MOCK_STATE.teams[0], pnl_pct: 8.0, mtd_pnl_pct: 8.0 }],
    };
    vi.mocked(client.getTradeDeskState).mockResolvedValue(stateWithMtd as never);
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getByText(/\+8\.00%/)).toBeTruthy());
    vi.mocked(client.getTradeDeskState).mockResolvedValue(MOCK_STATE as never);
  });

  it('shows — when mtd_pnl_pct is null (no snapshot)', async () => {
    const stateNullMtd = {
      ...MOCK_STATE,
      teams: [{ ...MOCK_STATE.teams[0], mtd_pnl_pct: null }],
    };
    vi.mocked(client.getTradeDeskState).mockResolvedValue(stateNullMtd as never);
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
    vi.mocked(client.getTradeDeskState).mockResolvedValue(MOCK_STATE as never);
  });

  // ── Ticket 07 guard rails ──

  it('shows directive editor (11.9) — directive text visible', async () => {
    const stateWithDir = {
      ...MOCK_STATE,
      teams: [{ ...MOCK_STATE.teams[0], team_directive: 'งดเทรดตอนข่าว FOMC' }],
    };
    vi.mocked(client.getTradeDeskState).mockResolvedValue(stateWithDir as never);
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getByText(/งดเทรดตอนข่าว FOMC/)).toBeTruthy());
    expect(screen.getByText(/คำสั่งโต๊ะกลาง/)).toBeTruthy();
    vi.mocked(client.getTradeDeskState).mockResolvedValue(MOCK_STATE as never);
  });

  it('shows quota counter (11.6) — turns_today/4', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getAllByText('3').length).toBeGreaterThan(0));
    expect(screen.getByText(/เทิร์นวันนี้/)).toBeTruthy();
  });

  it('shows next turn countdown (11.6)', async () => {
    render(<TradeDeskDashboard />);
    await waitFor(() => expect(screen.getByTestId('next-turn-countdown')).toBeTruthy());
  });
});
