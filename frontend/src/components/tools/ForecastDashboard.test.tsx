import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { ForecastDashboard } from './ForecastDashboard';
import type { SimulateResponse } from '../../api/types';

vi.mock('../../api/client', () => ({
  getModelsDashboard: vi.fn(),
  simulateModels: vi.fn(),
}));

const mockClient = client as unknown as {
  getModelsDashboard: ReturnType<typeof vi.fn>;
  simulateModels: ReturnType<typeof vi.fn>;
};

function makeResponse(overrides: { bankRunScore?: number; bankRunDelta?: number } = {}): SimulateResponse {
  const bankRunScore = overrides.bankRunScore ?? 44.2;
  const bankRunDelta = overrides.bankRunDelta ?? 32.5;
  const base: SimulateResponse['simulated'] = [
    { model_id: 'yield-shock', score: 56.9, status: 'active', confidence: 82, delta: 0, factors: { market_structure: 17.6, macro: 27.3, news: 0, confirmation: 12.1, risk_penalty: 0 } },
    { model_id: 'bank-run', score: 11.7, status: 'inactive', confidence: 91, delta: 0, factors: { market_structure: 5, macro: 6.7, news: 0, confirmation: 0, risk_penalty: 0 } },
    { model_id: 'credit-panic', score: 5.6, status: 'inactive', confidence: 78, delta: 0, factors: { market_structure: 2, macro: 3.6, news: 0, confirmation: 0, risk_penalty: 0 } },
    { model_id: 'inflation-oil', score: 33.7, status: 'inactive', confidence: 75, delta: 0, factors: { market_structure: 10, macro: 23.7, news: 0, confirmation: 0, risk_penalty: 0 } },
    { model_id: 'fed-pivot', score: 16.3, status: 'inactive', confidence: 88, delta: 0, factors: { market_structure: 6, macro: 10.3, news: 0, confirmation: 0, risk_penalty: 0 } },
    { model_id: 'recovery-reflation', score: 41.2, status: 'building', confidence: 80, delta: 0, factors: { market_structure: 12, macro: 29.2, news: 0, confirmation: 0, risk_penalty: 0 } },
  ];
  const sim = base.map((m) => ({ ...m }));
  sim[1] = { ...sim[1], score: bankRunScore, status: bankRunScore >= 40 ? 'building' : 'inactive', delta: bankRunDelta, factors: { ...sim[1].factors, news: 13.5 } };
  return {
    baseline: base,
    simulated: sim.sort((a, b) => b.score - a.score),
    missing_base: ['us_hy_spread'],
    simulated_at: '09/08/2026 15:30:00 UTC',
    slider_specs: {
      fedBps: { min: -200, max: 200, step: 25, default: 0, unit: 'bps', label_th: 'Fed ขึ้น/ลดดอกเบี้ย' },
      depositPct: { min: -3, max: 1, step: 0.25, default: 0, unit: '%', label_th: 'เงินฝากแบงก์ (2 สัปดาห์)' },
      auctionBtc: { min: 1.8, max: 3.2, step: 0.1, default: 2.5, unit: 'x', label_th: 'ประมูล 10Y Bid-to-Cover' },
      vixPts: { min: -10, max: 30, step: 1, default: 0, unit: 'pts', label_th: 'VIX เปลี่ยน' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.getModelsDashboard.mockResolvedValue({
    models: [], meta: [], factor_caps: {}, factor_labels_th: {},
    status_meta: {}, thresholds: { building: 40, active: 60 }, history: [], updated_at: '', data_sources: [],
  });
  mockClient.simulateModels.mockResolvedValue(makeResponse());
});

describe('ForecastDashboard', () => {
  it('renders header, sliders from backend specs and preset buttons', async () => {
    render(<ForecastDashboard />);
    await waitFor(() => expect(screen.getByText('จำลองสถานการณ์')).toBeTruthy());
    await waitFor(() => expect(mockClient.simulateModels).toHaveBeenCalled());
    // Slider labels from backend specs appear (once loaded)
    await waitFor(() => expect(screen.getByText('Fed ขึ้น/ลดดอกเบี้ย')).toBeTruthy());
    // Presets are present
    expect(screen.getByText('🏦 เฟดช็อก')).toBeTruthy();
    expect(screen.getByText('🏃 เงินฝากไหลออก')).toBeTruthy();
    // Banner + disclaimer (simulated ≠ real)
    expect(screen.getAllByText(/สถานการณ์สมมติ/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows model cards ranked with score → simulated and delta', async () => {
    render(<ForecastDashboard />);
    await waitFor(() => expect(screen.getAllByText(/ผลกระทบต่อคะแนนโมเดล/).length).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(screen.getByText('44.2')).toBeTruthy());
    expect(screen.getAllByText(/กำลังก่อตัว/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows amber warning when missing_base is non-empty', async () => {
    render(<ForecastDashboard />);
    await waitFor(() => expect(screen.getByText(/ไม่มีค่าฐานสดของ/)).toBeTruthy());
    expect(screen.getByText(/us_hy_spread/)).toBeTruthy();
  });

  it('shows the trading-signals section when a model crosses the 40 threshold', async () => {
    render(<ForecastDashboard />);
    await waitFor(() => expect(screen.getAllByText(/ผลต่อสัญญาณเทรด/).length).toBeGreaterThanOrEqual(1));
    // bank-run 11.7 -> 44.2 = crosses 40 -> eligible signal
    expect(screen.getAllByText(/มีสิทธิ์เกิด/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/ยังต้องรอ TA ยืนยัน/).length).toBeGreaterThanOrEqual(1);
  });

  it('debounces slider input (250ms) then fires one simulate call', async () => {
    render(<ForecastDashboard />);
    await waitFor(() => expect(mockClient.simulateModels).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    const slider = screen.getAllByRole('slider')[0];
    fireEvent.change(slider, { target: { value: '100' } });
    fireEvent.change(slider, { target: { value: '50' } });
    // no call yet (debounce pending)
    expect(mockClient.simulateModels).toHaveBeenCalledTimes(1);
    // advance past the debounce window and flush the promise chain
    await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); await Promise.resolve(); });
    expect(mockClient.simulateModels).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('applying a preset fires simulate with those overrides', async () => {
    render(<ForecastDashboard />);
    await waitFor(() => expect(mockClient.simulateModels).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('🏃 เงินฝากไหลออก'));
    await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); await Promise.resolve(); });
    expect(mockClient.simulateModels).toHaveBeenCalledTimes(2);
    const lastCall = mockClient.simulateModels.mock.calls[1][0] as Record<string, number>;
    expect(lastCall['depositPct']).toBe(-2.5);
    expect(lastCall['news-bank-run']).toBe(90);
    vi.useRealTimers();
  });

  it('reset returns all sliders to defaults and fires simulate', async () => {
    render(<ForecastDashboard />);
    await waitFor(() => expect(mockClient.simulateModels).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('🏃 เงินฝากไหลออก'));
    await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); await Promise.resolve(); });
    expect(mockClient.simulateModels).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText(/รีเซ็ตค่าทั้งหมด/));
    await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); await Promise.resolve(); });
    expect(mockClient.simulateModels).toHaveBeenCalledTimes(3);
    const lastCall = mockClient.simulateModels.mock.calls[2][0] as Record<string, number>;
    expect(Object.keys(lastCall)).toHaveLength(0); // all defaults -> no overrides
    vi.useRealTimers();
  });
});
