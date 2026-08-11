import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SentimentDashboard } from './SentimentDashboard';
import * as client from '../../api/client';

vi.mock('../../api/client', () => ({
  getFearGreed: vi.fn(),
}));

const payload = {
  score: 65,
  rating: 'Greed',
  updated_at: '2026-08-11',
  previous_close: 64,
  previous_1_week: 60,
  previous_1_month: 55,
  previous_1_year: 48,
  history: [
    { t: 1778803200000, value: 40 },
    { t: 1779062400000, value: 65 },
  ],
  indicators: [
    { key: 'market_momentum', label: 'Market Momentum (S&P 500 vs 125-day avg)', score: 74.2, rating: 'greed', latest_value: 7750.27, series: [] },
    { key: 'market_volatility', label: 'Market Volatility (VIX 50-day avg)', score: 52.1, rating: 'neutral', latest_value: 15.51, series: [] },
  ],
  crypto_fear_greed: { score: 29, rating: 'Fear', updated_at: '1786406400', previous: 30 },
  source: 'cnn',
};

describe('SentimentDashboard', () => {
  beforeEach(() => {
    vi.mocked(client.getFearGreed).mockResolvedValue(payload as never);
  });

  it('renders CNN + crypto gauges', async () => {
    render(<SentimentDashboard />);
    await waitFor(() => expect(screen.getByText(/ดัชนีความกลัว-ความโลภ/)).toBeTruthy());
    expect(screen.getAllByText('65').length).toBeGreaterThan(0);
    expect(screen.getByText(/Crypto Fear & Greed/)).toBeTruthy();
    expect(screen.getByText('29')).toBeTruthy();
    expect(screen.getByText(/วานนี้: 30/)).toBeTruthy();
  });

  it('renders indicator cards with scores', async () => {
    render(<SentimentDashboard />);
    await waitFor(() => expect(screen.getByText(/Market Momentum/)).toBeTruthy());
    expect(screen.getByText(/Market Volatility/)).toBeTruthy();
    expect(screen.getAllByText('74').length).toBeGreaterThan(0);
  });

  it('renders 1-year history chart', async () => {
    render(<SentimentDashboard />);
    await waitFor(() => expect(screen.getByText('แนวโน้มย้อนหลัง')).toBeTruthy());
    expect(screen.getByText(/1 ปีก่อน: 48/)).toBeTruthy();
  });
});
