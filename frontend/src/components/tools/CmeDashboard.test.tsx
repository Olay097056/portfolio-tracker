import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CmeDashboard } from './CmeDashboard';
import * as client from '../../api/client';

vi.mock('../../api/client', () => ({
  getCmeZone: vi.fn(),
}));

const payload = {
  fedwatch: {
    zq_price: 96.24, implied_rate: 3.76, effr: 3.63, diff_bp: 13.0,
    prob_hike_pct: 52.0, prob_hold_pct: 48.0, prob_cut_pct: 0.0,
    outcome: 'hike', size: '+25bp', source: 'ZQ',
  },
  gold_flow: {
    trade_date: '20260810', future_volume: 142327, option_volume: 51472,
    future_oi: 400331, option_oi: 797501, source: 'CME public API (รายวัน)',
  },
  crypto_iv: {
    BTC: { instrument: 'BTC-X', iv: 58.11, oi: 100 },
    ETH: { instrument: 'ETH-X', iv: 67.52, oi: 50 },
    SOL: null,
    XRP: null,
  },
  cot: [
    { series_id: 'cot_gold_mm_net', name_th: 'COT ทองคำ', value: 130766 },
  ],
  updated_at: '11/08/2026 12:00:00 UTC',
  data_sources: ['CME', 'Deribit'],
};

describe('CmeDashboard', () => {
  beforeEach(() => {
    vi.mocked(client.getCmeZone).mockResolvedValue(payload as never);
  });

  it('renders FedWatch cards with probabilities', async () => {
    render(<CmeDashboard />);
    await waitFor(() => expect(screen.getAllByText(/FedWatch/).length).toBeGreaterThan(0));
    expect(screen.getByText('3.76%')).toBeTruthy();
    expect(screen.getByText('52%')).toBeTruthy();
    expect(screen.getByText('ขึ้น 52%')).toBeTruthy();
    expect(screen.getByText('คง 48%')).toBeTruthy();
    expect(screen.getByText('ลง 0%')).toBeTruthy();
  });

  it('renders gold flow with exact reference values', async () => {
    render(<CmeDashboard />);
    await waitFor(() => expect(screen.getByText(/ทองคำ CME/)).toBeTruthy());
    expect(screen.getByText('400,331')).toBeTruthy();
    expect(screen.getByText('797,501')).toBeTruthy();
    expect(screen.getByText('142,327')).toBeTruthy();
  });

  it('renders crypto IV with — for SOL/XRP', async () => {
    render(<CmeDashboard />);
    await waitFor(() => expect(screen.getByText(/ความผันผวนคาดการณ์/)).toBeTruthy());
    expect(screen.getByText('58.1%')).toBeTruthy();
    expect(screen.getByText('67.5%')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('renders COT table', async () => {
    render(<CmeDashboard />);
    await waitFor(() => expect(screen.getByText('COT ทองคำ')).toBeTruthy());
    expect(screen.getByText('130,766')).toBeTruthy();
  });
});
