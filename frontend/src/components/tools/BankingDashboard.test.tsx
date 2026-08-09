import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { BankingDashboard } from './BankingDashboard';
import type { BankingDashboard as BankingDashboardData } from '../../api/types';

vi.mock('../../api/client', () => ({
  getBankingDashboard: vi.fn(),
  refreshBankingDashboard: vi.fn(),
}));

const mockGet = client.getBankingDashboard as unknown as ReturnType<typeof vi.fn>;
const mockRefresh = client.refreshBankingDashboard as unknown as ReturnType<typeof vi.fn>;

function fixture(): BankingDashboardData {
  return {
    funding: [
      { series_id: 'us_sofr', name_th: 'SOFR', name_en: 'SOFR', unit: '%', value: 5.30, change_bps: 1.0, recorded_at: '2026-08-08T12:00:00Z', available: true },
      { series_id: 'us_effr', name_th: 'EFFR', name_en: 'EFFR', unit: '%', value: 5.28, change_bps: 0.0, recorded_at: '2026-08-08T12:00:00Z', available: true },
      { series_id: 'us_obfr', name_th: 'OBFR', name_en: 'OBFR', unit: '%', value: 5.28, change_bps: 0.0, recorded_at: '2026-08-08T12:00:00Z', available: true },
      { series_id: 'us_sofr_effr_spread', name_th: 'SOFR-EFFR Spread', name_en: 'SOFR-EFFR Spread', unit: 'bps', value: 2.0, change_bps: null, recorded_at: '2026-08-08T12:00:00Z', available: true },
    ],
    stat_cards: {
      us_bank_deposits: { series_id: 'us_bank_deposits', value: 19.4, change_pct: -0.5, recorded_at: '2026-08-08T12:00:00Z', available: true },
      us_discount_window: { series_id: 'us_discount_window', value: 0.0, change_pct: 0.0, recorded_at: '2026-08-08T12:00:00Z', available: true },
      kre: { price: 50.0, change_pct: -2.0 },
      bkx: { price: 180.0, change_pct: 1.5 },
    },
    gauge: {
      value: 42.5,
      status: 'building',
      zones: [
        { max: 40, color: '#10b981' },
        { max: 70, color: '#f59e0b' },
        { max: 100, color: '#ef4444' },
      ],
      partial_inputs: false,
      recorded_at: '2026-08-08T12:00:00Z',
    },
    deposit_flow: [
      { date: '2026-07-25', value: 5.0 },
      { date: '2026-08-01', value: -2.0 },
      { date: '2026-08-08', value: 10.0 },
    ],
    sofr_effr_spread: [
      { date: '2026-08-06', value: 2.0 },
      { date: '2026-08-07', value: 3.0 },
      { date: '2026-08-08', value: 4.0 },
    ],
    model: {
      model_id: 'bank-run',
      score: 42.5,
      status: 'building',
      name_th: 'โมเดลแบงก์รัน / วิกฤตธนาคาร',
      name_en: 'Bank Run',
      concept_th: 'เงินฝากไหลออกจากระบบ',
      trade_direction: 'Short banks / buy UST',
      regime_th: 'วิกฤต',
      color: '#34d399',
    },
    updated_at: '09/08/2026 12:00:00 UTC',
    data_sources: ['FRED (fredgraph.csv)', 'Yahoo Finance (yfinance)'],
  };
}

describe('BankingDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders gauge, funding cards, stat cards, charts and model card', async () => {
    mockGet.mockResolvedValue(fixture());
    render(<BankingDashboard />);

    await waitFor(() => expect(screen.getByText('วิกฤตแบงก์รัน')).toBeTruthy());

    // Gauge value + status badge (appears in both gauge and model card)
    expect(screen.getAllByText('42.5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('กำลังก่อตัว')).toBeTruthy();
    // Funding cards
    expect(screen.getByText('SOFR')).toBeTruthy();
    expect(screen.getByText('+1.0 bps')).toBeTruthy();
    expect(screen.getByText('EFFR')).toBeTruthy();
    // Stat cards
    expect(screen.getByText('เงินฝากธนาคารรวม')).toBeTruthy();
    expect(screen.getByText('Fed Discount Window')).toBeTruthy();
    expect(screen.getByText('KRE (Regional Banks)')).toBeTruthy();
    expect(screen.getByText('BKX (KBW Banks)')).toBeTruthy();
    // Chart headers
    expect(screen.getByText('กระแสเงินฝาก (WoW %)')).toBeTruthy();
    expect(screen.getByText('ความตึงตลาดเงินระยะสั้น — SOFR-EFFR (bps)')).toBeTruthy();
    // Model card concept
    expect(screen.getByText('เงินฝากไหลออกจากระบบ')).toBeTruthy();
  });

  it('renders the no-data placeholder when gauge is missing', async () => {
    const f = fixture();
    f.gauge.value = null;
    mockGet.mockResolvedValue(f);
    render(<BankingDashboard />);
    await waitFor(() => expect(screen.getByText('ยังไม่มีข้อมูลดัชนี')).toBeTruthy());
  });

  it('renders the partial-inputs badge when flagged', async () => {
    const f = fixture();
    f.gauge.partial_inputs = true;
    mockGet.mockResolvedValue(f);
    render(<BankingDashboard />);
    await waitFor(() => expect(screen.getByText(/ข้อมูลเข้าไม่ครบ/)).toBeTruthy());
  });

  it('renders em-dash for missing values instead of fabricating', async () => {
    const f = fixture();
    f.stat_cards.kre = null;
    f.stat_cards.bkx = null;
    mockGet.mockResolvedValue(f);
    render(<BankingDashboard />);
    await waitFor(() => expect(screen.getByText('KRE (Regional Banks)')).toBeTruthy());
    // Two stat cards now show "—" for price; assert at least one em-dash in the KRE/BKX area
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('refresh button calls refreshBankingDashboard and re-renders', async () => {
    mockGet.mockResolvedValue(fixture());
    mockRefresh.mockResolvedValue(fixture());
    render(<BankingDashboard />);
    await waitFor(() => expect(screen.getByText('วิกฤตแบงก์รัน')).toBeTruthy());
    fireEvent.click(screen.getByText('↻ รีเฟรช'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('shows retry state when loading fails', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    render(<BankingDashboard />);
    await waitFor(() => expect(screen.getByText('โหลดข้อมูลไม่สำเร็จ')).toBeTruthy());
    expect(screen.getByText('ลองใหม่')).toBeTruthy();
  });
});
