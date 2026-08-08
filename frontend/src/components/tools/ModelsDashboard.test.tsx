import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { ModelsDashboard } from './ModelsDashboard';
import type { ModelsDashboard as ModelsData } from '../../api/types';

function makeModel(id: string, score: number, status: string, rank: number) {
  return {
    model_id: id,
    rank,
    score,
    confidence: 90,
    status,
    factors: { market_structure: 10, macro: 15, news: 0, confirmation: 5, risk_penalty: -2 },
    conditions: [
      { name: 'US10Y Yield', logic: '10Y > 4.5%', weight: 25, score: 40 },
      { name: 'DXY', logic: 'USD strong', weight: 20, score: 70 },
    ],
    available: true,
  };
}

function makeData(): ModelsData {
  return {
    models: [
      makeModel('fed-pivot', 53.6, 'building', 1),
      makeModel('yield-shock', 22.4, 'inactive', 2),
      makeModel('bank-run', 7.5, 'inactive', 3),
    ],
    meta: [
      {
        model_id: 'fed-pivot',
        name_th: 'โมเดล Fed เปลี่ยนท่าที / Duration Rally',
        name_en: 'Fed Pivot',
        short_th: 'Fed เปลี่ยนท่าที',
        short_en: 'Fed Pivot',
        concept_th: 'จับจังหวะ Fed ส่งสัญญาณ Dovish → Yield ลง',
        concept_en: 'Fed turns dovish',
        trade_direction: 'Long NAS100/US500, Long Gold, Short USDJPY',
        regime_th: 'ช่วงที่ Fed เปลี่ยนท่าทีจาก hawkish → dovish',
        regime_en: 'Fed shifting',
        phase: 'policy-pivot',
        color: '#a78bfa',
        signal_map: [
          { asset: 'NAS100', category: 'macro', direction: 'long', reason: 'Growth rally' },
          { asset: 'USDJPY', category: 'forex', direction: 'short', reason: 'Yen strong' },
        ],
      },
      {
        model_id: 'yield-shock',
        name_th: 'โมเดล Yield ช็อก',
        name_en: 'Yield Shock',
        short_th: 'Yield ช็อก',
        short_en: 'Yield Shock',
        concept_th: 'จับช่วง Yield พุ่งแรง',
        concept_en: 'Yields spike',
        trade_direction: 'Short NAS100',
        regime_th: 'bond sell-off',
        regime_en: 'bond sell-off',
        phase: 'yield-shock',
        color: '#f97316',
        signal_map: [{ asset: 'NAS100', category: 'macro', direction: 'short', reason: 'Sell' }],
      },
      {
        model_id: 'bank-run',
        name_th: 'โมเดลแบงก์รัน',
        name_en: 'Bank Run',
        short_th: 'แบงก์รัน',
        short_en: 'Bank Run',
        concept_th: 'จับช่วงเงินฝากไหลออก',
        concept_en: 'Deposit flight',
        trade_direction: 'Long Gold, Short Banks',
        regime_th: 'banking stress',
        regime_en: 'banking stress',
        phase: 'banking-stress',
        color: '#34d399',
        signal_map: [{ asset: 'XAUUSD', category: 'macro', direction: 'long', reason: 'Safe haven' }],
      },
    ],
    factor_caps: { market_structure: 25, macro: 30, news: 15, confirmation: 20, risk_penalty: 15 },
    factor_labels_th: { macro: 'ข้อมูลมหภาค', news: 'ข่าวสาร', confirmation: 'สัญญาณยืนยัน', risk_penalty: 'บทลงโทษความเสี่ยง', market_structure: 'โครงสร้างตลาด' },
    status_meta: { building: { en: 'Building', th: 'กำลังก่อตัว' }, inactive: { en: 'Inactive', th: 'ไม่ทำงาน' } },
    thresholds: { building: 40, active: 60 },
    history: [
      { recorded_at: '08/08 09:00', scores: { 'fed-pivot': 50, 'yield-shock': 20, 'bank-run': 8 } },
      { recorded_at: '08/08 10:00', scores: { 'fed-pivot': 53.6, 'yield-shock': 22.4, 'bank-run': 7.5 } },
    ],
    updated_at: '08/08/2026 12:00:00 UTC',
    data_sources: ['FRED (fredgraph.csv)', 'Yahoo Finance (yfinance)'],
  };
}

describe('ModelsDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all six model cards with scores and statuses', async () => {
    vi.spyOn(client, 'getModelsDashboard').mockResolvedValue(makeData());

    render(<ModelsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('โมเดลทำกำไร')).toBeTruthy();
      expect(screen.getByText('โมเดล Fed เปลี่ยนท่าที / Duration Rally')).toBeTruthy();
      expect(screen.getByText('โมเดล Yield ช็อก')).toBeTruthy();
      expect(screen.getByText('โมเดลแบงก์รัน')).toBeTruthy();
    });
    // Scores + status badges
    expect(screen.getAllByText('53.6').length).toBeGreaterThan(0);
    expect(screen.getByText('กำลังก่อตัว')).toBeTruthy();
    expect(screen.getAllByText('ไม่ทำงาน').length).toBeGreaterThan(0);
    // Rank badges
    expect(screen.getByText('#1')).toBeTruthy();
    // Confidence labels
    expect(screen.getAllByText(/ความมั่นใจ/).length).toBeGreaterThan(0);
    // Factor labels
    expect(screen.getAllByText('โครงสร้างตลาด').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ข้อมูลมหภาค').length).toBeGreaterThan(0);
  });

  it('expands a card to show trade direction, regime, conditions and signal map', async () => {
    vi.spyOn(client, 'getModelsDashboard').mockResolvedValue(makeData());

    render(<ModelsDashboard />);

    await waitFor(() => expect(screen.getByText('โมเดล Fed เปลี่ยนท่าที / Duration Rally')).toBeTruthy());
    fireEvent.click(screen.getByText('โมเดล Fed เปลี่ยนท่าที / Duration Rally'));

    await waitFor(() => {
      expect(screen.getByText('ทิศทางเทรด')).toBeTruthy();
      expect(screen.getByText('Long NAS100/US500, Long Gold, Short USDJPY')).toBeTruthy();
      expect(screen.getByText('เหมาะกับ Regime')).toBeTruthy();
      expect(screen.getByText('เงื่อนไข Activation')).toBeTruthy();
      expect(screen.getByText('US10Y Yield')).toBeTruthy();
      expect(screen.getByText('สินทรัพย์ที่เทรด')).toBeTruthy();
      expect(screen.getByText('NAS100')).toBeTruthy();
    });
    // Collapse again
    fireEvent.click(screen.getByText('โมเดล Fed เปลี่ยนท่าที / Duration Rally'));
    await waitFor(() => expect(screen.queryByText('ทิศทางเทรด')).toBeNull());
  });

  it('renders the 30-day score history chart with threshold labels', async () => {
    vi.spyOn(client, 'getModelsDashboard').mockResolvedValue(makeData());

    render(<ModelsDashboard />);

    await waitFor(() => expect(screen.getByText('ประวัติคะแนนโมเดล (30 วัน)')).toBeTruthy());
    expect(screen.getByText('เกณฑ์ก่อตัว (40)')).toBeTruthy();
    expect(screen.getByText('เกณฑ์ทำงาน (60)')).toBeTruthy();
    // Legend uses short Thai names
    expect(screen.getByText('Fed เปลี่ยนท่าที')).toBeTruthy();
    expect(screen.getByText('Yield ช็อก')).toBeTruthy();
  });

  it('shows the empty-history placeholder when there is no data yet', async () => {
    const data = makeData();
    data.history = [];
    vi.spyOn(client, 'getModelsDashboard').mockResolvedValue(data);

    render(<ModelsDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/ยังไม่มีข้อมูลสะสม/)).toBeTruthy();
    });
  });

  it('refresh button calls refreshModelsDashboard and re-renders', async () => {
    vi.spyOn(client, 'getModelsDashboard').mockResolvedValue(makeData());
    const refreshSpy = vi.spyOn(client, 'refreshModelsDashboard').mockResolvedValue(
      makeData(),
    );

    render(<ModelsDashboard />);

    await waitFor(() => expect(screen.getByText('โมเดลทำกำไร')).toBeTruthy());
    fireEvent.click(screen.getByText('รีเฟรช'));
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled());
  });

  it('shows the retry state when loading fails', async () => {
    vi.spyOn(client, 'getModelsDashboard').mockRejectedValue(new Error('offline'));

    render(<ModelsDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/โหลดข้อมูลโมเดลไม่สำเร็จ/)).toBeTruthy();
      expect(screen.getByText('ลองใหม่')).toBeTruthy();
    });
  });
});
