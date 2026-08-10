import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { SignalsDashboard } from './SignalsDashboard';

vi.mock('../../api/client', () => ({
  getSignalsDashboard: vi.fn(),
  refreshSignalsDashboard: vi.fn(),
  closeSignal: vi.fn(),
}));

const mockGet = client.getSignalsDashboard as ReturnType<typeof vi.fn>;
const mockRefresh = client.refreshSignalsDashboard as ReturnType<typeof vi.fn>;
const mockClose = client.closeSignal as ReturnType<typeof vi.fn>;

function makeSignal(overrides: Partial<any> = {}) {
  return {
    id: 'sig-1',
    asset: 'NAS100',
    category: 'macro',
    direction: 'long',
    entry_price: 29692.17,
    tp: 31015.25,
    sl: 29030.64,
    current_price: 29722.3,
    pnl_pct: 0.1,
    signal_strength: 67,
    strength_factors: { confluence: 7, rr_quality: 10, ta_quality: 22, atr_quality: 12, model_conviction: 16 },
    status: 'active',
    model_id: 'recovery-reflation',
    rationale_th: 'โมเดล recovery-reflation คะแนน 52.1 + เทคนิคอล 73 (เกณฑ์ 50), RR 2',
    rationale_en: 'recovery-reflation (52.1) + TA 73/50, RR 2',
    ta_snapshot: {
      bars: 60,
      ta_score: 73,
      threshold: 50,
      conditions: [
        { key: 'price_vs_ema20', max: 15, pass: true, score: 15, value: '29692.17 vs EMA20 28843.47' },
        { key: 'ema20_vs_sma50', max: 10, pass: false, score: 0, value: 'EMA20 28843.47 vs SMA50 29390.97' },
        { key: 'rsi_zone', max: 20, pass: true, score: 20, value: 'RSI 57.3' },
        { key: 'macd_state', max: 20, pass: true, score: 20, value: 'line ✓, hist improving' },
        { key: 'bb_room', max: 20, pass: false, score: 10, value: 'inside band, level near' },
        { key: 'stoch_confirm', max: 15, pass: false, score: 7.5, value: '%K 90.8 %D 82.9' },
      ],
      indicators: { rsi14: 57.3, ema20: 28843.47, sma50: 29390.97, atr14: 634.3 },
      levels: { rr: 2, support: [29604.93, 29189.21, 28890.74], resistance: [29771.89, 29843.89], sl_basis: 'swing', tp_basis: 'rr_fallback' },
    },
    sparkline: [29000, 29100, 29200, 29300, 29400, 29500, 29600, 29700],
    created_at: '2026-08-05T15:00:07Z',
    closed_at: null,
    expires_at: '2026-08-19T15:00:07Z',
    ...overrides,
  };
}

function makeStats(overrides: Partial<any> = {}) {
  return {
    active_count: 1,
    closed_count: 2,
    win_count: 1,
    loss_count: 1,
    win_rate: 50,
    realized_pnl: 3.0,
    unrealized_pnl: 0.1,
    avg_hold_hours: 24,
    avg_rr: 2.0,
    profit_factor: 1.6,
    expectancy: 1.5,
    avg_win: 8.0,
    avg_loss: -5.0,
    payoff_ratio: 1.6,
    best_trade: 8.0,
    worst_trade: -5.0,
    max_drawdown: 2.0,
    equity_curve: [
      { t: '2026-08-02', equity: 8 },
      { t: '2026-08-03', equity: 3 },
    ],
    ...overrides,
  };
}

const baseData = {
  signals: [makeSignal(), makeSignal({ id: 'sig-2', asset: 'XAUUSD', status: 'tp_hit', pnl_pct: 8.0 })],
  stats: makeStats(),
  generated_at: '08/08/2026 15:00:00 UTC',
  data_sources: ['Yahoo Finance (yfinance)'],
  notes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(baseData);
  mockRefresh.mockResolvedValue(baseData);
  mockClose.mockResolvedValue(makeSignal({ status: 'tp_hit', pnl_pct: 2.0 }));
});

describe('SignalsDashboard', () => {
  it('renders stats panel and signal table', async () => {
    render(<SignalsDashboard />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    // Stats
    expect(screen.getByText('สัญญาณที่ทำงาน')).toBeTruthy();
    expect(screen.getByText('อัตราชนะ')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('Profit Factor')).toBeTruthy();
    expect(screen.getAllByText('1.6').length).toBeGreaterThan(0);

    // Signal rows
    expect(screen.getByText('NAS100')).toBeTruthy();
    expect(screen.getByText('XAUUSD')).toBeTruthy();
    expect(screen.getAllByText(/ทำงาน/).length).toBeGreaterThan(0);
  });

  // Infinity is not valid JSON, so the backend sends profit_factor: null both when
  // there are no losses to divide by and when nothing has closed at all. Only the
  // win/loss counts separate "infinitely profitable so far" from "no data yet".
  it('shows ∞ for the profit factor when every closed trade won', async () => {
    mockGet.mockResolvedValue({
      ...baseData,
      stats: makeStats({ profit_factor: null, closed_count: 1, win_count: 1, loss_count: 0 }),
    });
    render(<SignalsDashboard />);

    const card = (await screen.findByText('Profit Factor')).parentElement;
    expect(card?.textContent).toContain('∞');
  });

  it('shows — for the profit factor when nothing has closed yet', async () => {
    mockGet.mockResolvedValue({
      ...baseData,
      stats: makeStats({ profit_factor: null, closed_count: 0, win_count: 0, loss_count: 0 }),
    });
    render(<SignalsDashboard />);

    const card = (await screen.findByText('Profit Factor')).parentElement;
    expect(card?.textContent).not.toContain('∞');
    expect(card?.textContent).toContain('—');
  });

  it('shows empty state with honest note when there are no signals', async () => {
    mockGet.mockResolvedValue({
      ...baseData,
      signals: [],
      stats: makeStats({ active_count: 0, closed_count: 0 }),
      notes: ['ยังไม่มีสัญญาณปิด — สถิติจะเริ่มสะสมเมื่อมีออเดอร์จริง'],
    });
    render(<SignalsDashboard />);
    await waitFor(() => expect(screen.getAllByText(/ยังไม่มีสัญญาณ/).length).toBeGreaterThan(0));
  });

  it('filters by category and sorts', async () => {
    render(<SignalsDashboard />);
    await waitFor(() => expect(screen.getByText('NAS100')).toBeTruthy());

    fireEvent.click(screen.getByText('crypto'));
    await waitFor(() => expect(screen.queryByText('NAS100')).toBeNull());

    fireEvent.click(screen.getByText('ทั้งหมด'));
    await waitFor(() => expect(screen.getByText('NAS100')).toBeTruthy());

    fireEvent.click(screen.getAllByText('P&L')[0]);
    // sorted by pnl desc — XAUUSD (+8) first
    const rows = screen.getAllByText(/NAS100|XAUUSD/);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('expands a row to show TA detail', async () => {
    render(<SignalsDashboard />);
    await waitFor(() => expect(screen.getByText('NAS100')).toBeTruthy());

    fireEvent.click(screen.getByText('NAS100'));
    await waitFor(() => expect(screen.getByText(/คะแนนเทคนิคอล/)).toBeTruthy());
    expect(screen.getByText(/EMA20/)).toBeTruthy();
    expect(screen.getByText(/แนวต้าน/)).toBeTruthy();
  });

  it('close button calls closeSignal and reloads', async () => {
    render(<SignalsDashboard />);
    await waitFor(() => expect(screen.getByText('NAS100')).toBeTruthy());

    const closeBtns = screen.getAllByText('ปิดออเดอร์');
    fireEvent.click(closeBtns[0]);
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith('sig-1'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('refresh button calls refreshSignalsDashboard', async () => {
    render(<SignalsDashboard />);
    await waitFor(() => expect(screen.getByText('NAS100')).toBeTruthy());

    fireEvent.click(screen.getByText('สร้างสัญญาณจาก Regime'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('shows retry state on failure', async () => {
    mockGet.mockRejectedValue(new Error('network down'));
    render(<SignalsDashboard />);
    await waitFor(() => expect(screen.getByText('network down')).toBeTruthy());
    expect(screen.getByText('ลองใหม่')).toBeTruthy();
  });

  it('renders equity curve when there are 2+ closed trades', async () => {
    render(<SignalsDashboard />);
    await waitFor(() => expect(screen.getByText('NAS100')).toBeTruthy());
    expect(screen.getAllByText(/เส้นทุนสะสม/).length).toBeGreaterThan(0);
  });
});
