import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as client from '../../api/client';
import type { MacroDashboard as MacroDashboardData } from '../../api/types';
import { MacroDashboard } from './MacroDashboard';

function makeData(overrides: Partial<MacroDashboardData> = {}): MacroDashboardData {
  return {
    yield_curve: {
      points: [
        { tenor: '13W', series_id: 'us13w', yield: 3.71, prev: 3.86, change_bps: -2.0, date: '2026-08-06', available: true },
        { tenor: '1Y', series_id: 'us1y', yield: 4.06, prev: 4.06, change_bps: 3.0, date: '2026-08-06', available: true },
        { tenor: '2Y', series_id: 'us2y', yield: 4.25, prev: 4.19, change_bps: 7.0, date: '2026-08-06', available: true },
        { tenor: '5Y', series_id: 'us5y', yield: 4.36, prev: 4.27, change_bps: -3.0, date: '2026-08-06', available: true },
        { tenor: '10Y', series_id: 'us10y', yield: 4.69, prev: 4.55, change_bps: 6.0, date: '2026-08-06', available: true },
        { tenor: '20Y', series_id: 'us20y', yield: 5.22, prev: 5.05, change_bps: 4.0, date: '2026-08-06', available: true },
        { tenor: '30Y', series_id: 'us30y', yield: 5.21, prev: 5.05, change_bps: 5.0, date: '2026-08-06', available: true },
      ],
      spread_10y2y_bps: 44.0,
      inverted: false,
    },
    gold_cme: {
      oi: null,
      oi_chg: null,
      vol: null,
      opt_oi: null,
      spark: [],
      available: false,
      note: 'CME data has no free public source',
    },
    sections: [
      {
        key: 'treasuryYields',
        title_th: 'ผลตอบแทนพันธบัตรสหรัฐ',
        title_en: 'US Treasury Yields',
        items: [
          { series_id: 'us10y', name_th: 'ผลตอบแทนพันธบัตรสหรัฐ 10 ปี', name_en: 'US 10-Year Yield', unit: '%', value: 4.69, change_val: 0.06, change_pct: null, trend: 'up', recorded_at: '2026-08-06', available: true },
        ],
      },
      {
        key: 'moneyMarketRates',
        title_th: 'อัตราดอกเบี้ยตลาดเงิน',
        title_en: 'Money Market Rates',
        items: [
          { series_id: 'us_sofr', name_th: 'อัตรา SOFR', name_en: 'SOFR', unit: '%', value: 3.65, change_val: 0.01, change_pct: null, trend: 'up', recorded_at: '2026-08-06', available: true },
        ],
      },
      {
        key: 'macroIndicators',
        title_th: 'ตัวชี้วัดมหภาค',
        title_en: 'Macro Indicators',
        items: [
          { series_id: 'dxy', name_th: 'ดัชนีดอลลาร์', name_en: 'Dollar Index (DXY)', unit: 'index', value: 99.6, change_val: null, change_pct: -0.37, trend: 'down', recorded_at: '2026-08-07', available: true },
        ],
      },
      {
        key: 'creditSpreads',
        title_th: 'เครดิตและการคลัง',
        title_en: 'Credit & Fiscal',
        items: [
          { series_id: 'us_hy_spread', name_th: 'ส่วนต่างพันธบัตร High Yield', name_en: 'HY Spread (OAS)', unit: 'bps', value: 271, change_val: -4.0, change_pct: null, trend: 'down', recorded_at: '2026-08-06', available: true },
        ],
      },
      {
        key: 'bankingIndicators',
        title_th: 'ตัวชี้วัดภาคการธนาคาร',
        title_en: 'Banking Indicators',
        items: [
          { series_id: 'us_stlfsi', name_th: 'ดัชนีความตึงเครียดการเงิน', name_en: 'St. Louis Fed Financial Stress Index', unit: 'index', value: -0.51, change_val: null, change_pct: null, trend: 'flat', recorded_at: '2026-07-31', available: true },
        ],
      },
    ],
    updated_at: '08/08/2026 10:00:00 UTC',
    data_sources: ['FRED (fredgraph.csv)', 'Yahoo Finance (yfinance)'],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MacroDashboard', () => {
  it('renders the reference-page structure: header, yield curve, 5 sections', async () => {
    vi.spyOn(client, 'getMacroDashboard').mockResolvedValue(makeData());

    render(<MacroDashboard />);

    await waitFor(() => {
      expect(screen.getByText('ข้อมูลมหภาค')).toBeTruthy();
      expect(screen.getByText('รีเฟรชอัตโนมัติทุก 5 นาที')).toBeTruthy();
      // Yield curve panel + legend + spread
      expect(screen.getByText('Yield Curve (13W → 30Y)')).toBeTruthy();
      expect(screen.getByText('10Y-2Y:')).toBeTruthy();
      expect(screen.getByText('44 bps')).toBeTruthy();
      // All five section titles in order
      const titles = ['ผลตอบแทนพันธบัตรสหรัฐ', 'อัตราดอกเบี้ยตลาดเงิน', 'ตัวชี้วัดมหภาค', 'เครดิตและการคลัง', 'ตัวชี้วัดภาคการธนาคาร'];
      titles.forEach((t) => expect(screen.getByText(t)).toBeTruthy());
      // Real values + Thai card names
      expect(screen.getByText('ผลตอบแทนพันธบัตรสหรัฐ 10 ปี')).toBeTruthy();
      expect(screen.getAllByText('4.69%').length).toBeGreaterThan(0);
      expect(screen.getByText('271')).toBeTruthy(); // HY spread bps
      expect(screen.getByText('99.60')).toBeTruthy(); // DXY
      expect(screen.getByText('-4 bps')).toBeTruthy(); // HY change
      // Gold CME placeholder is honest about missing data
      expect(screen.getByText('ทองคำ CME — สัญญา/วอลุ่ม')).toBeTruthy();
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
      // Source badges
      expect(screen.getByText(/FRED \(fredgraph\.csv\)/)).toBeTruthy();
    });
  });

  it('shows the inverted-curve warning banner when 10Y < 2Y', async () => {
    vi.spyOn(client, 'getMacroDashboard').mockResolvedValue(
      makeData({ yield_curve: { ...makeData().yield_curve, spread_10y2y_bps: -15.0, inverted: true } }),
    );

    render(<MacroDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Curve พลิกกลับ \(Inverted\)/)).toBeTruthy();
      expect(screen.getByText(/10Y ต่ำกว่า 2Y/)).toBeTruthy();
      // "-15 bps" appears both in the warning banner and the curve legend.
      expect(screen.getAllByText('-15 bps').length).toBeGreaterThan(0);
    });
  });

  it('renders honest unavailable states without fabricated numbers', async () => {
    const data = makeData();
    data.yield_curve.points = data.yield_curve.points.map((p) => ({ ...p, available: false, yield: null, prev: null }));
    data.yield_curve.spread_10y2y_bps = null;
    data.sections = data.sections.map((s) => ({
      ...s,
      items: s.items.map((i) => ({ ...i, available: false, value: null, change_val: null, change_pct: null })),
    }));
    data.data_sources = [];
    vi.spyOn(client, 'getMacroDashboard').mockResolvedValue(data);

    render(<MacroDashboard />);

    await waitFor(() => {
      // Section cards show the unavailable label, not a value.
      expect(screen.getAllByText('ไม่มีข้อมูล').length).toBe(5);
      expect(screen.queryByText('4.69%')).toBeNull();
      expect(screen.queryByText('271')).toBeNull();
      // No inverted banner without a spread.
      expect(screen.queryByText(/Curve พลิกกลับ/)).toBeNull();
      // Curve panel shows the insufficient-data placeholder.
      expect(screen.getByText(/ไม่มีข้อมูลเส้นอัตราผลตอบแทนเพียงพอ/)).toBeTruthy();
    });
  });

  it('refresh button calls refreshMacroDashboard and re-renders', async () => {
    const getSpy = vi.spyOn(client, 'getMacroDashboard').mockResolvedValue(makeData());
    const refreshSpy = vi.spyOn(client, 'refreshMacroDashboard').mockResolvedValue(
      makeData({ updated_at: '08/08/2026 11:00:00 UTC' }),
    );

    render(<MacroDashboard />);

    await waitFor(() => expect(screen.getByText('ข้อมูลมหภาค')).toBeTruthy());

    screen.getByRole('button', { name: /รีเฟรช/ }).click();

    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledTimes(1); // initial load only
      expect(screen.getByText(/อัปเดตล่าสุด 08\/08\/2026 11:00:00 UTC/)).toBeTruthy();
    });
  });

  it('renders a retry state when the initial fetch fails', async () => {
    vi.spyOn(client, 'getMacroDashboard').mockRejectedValue(new Error('network down'));

    render(<MacroDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/โหลดข้อมูลไม่สำเร็จ/)).toBeTruthy();
      expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeTruthy();
    });
  });
});
