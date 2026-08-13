import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OverviewDashboard } from './OverviewDashboard';
import * as client from '../../api/client';

vi.mock('../../api/client', () => ({
  getOverviewDashboard: vi.fn(),
  refreshOverviewBrief: vi.fn(),
}));

const brief = {
  brief_md: 'ตลาดเข้าสู่ช่วง recovery ความมั่นใจ 90%',
  recommendations: ['ถือทองคำต่อ', 'หลีกเลี่ยงบอนด์ยาว', 'Short USD/JPY'],
  scenarios: ['CPI แรง → US10Y วิ่ง 4.8%', 'CPI ต่ำ → หุ้นวิ่ง', 'PPI แย่ → DXY ทะลุ 100'],
  key_events: [
    { date: '2026-08-12', date_th: '12 ส.ค. 2026 19:30 น.', title: 'Core CPI m/m', impact: 'High', forecast: '0.2%', previous: '0.0%' },
  ],
  model_used: 'deepseek-v4-flash',
  generated_at: '2026-08-11T09:15:00Z',
};

const payload = {
  regime: {
    phase: 'recovery',
    phase_th: 'ฟื้นตัว',
    phase_en: 'Recovery',
    top_model_id: 'recovery-reflation',
    top_model_name_th: 'โมเดลฟื้นตัว / รีเฟลชัน',
    top_model_name_en: null,
    top_model_score: 62.3,
    top_model_status: 'active',
    top_model_trade_direction: 'Long NAS100/US500, Long Oil, Short Gold, Short JPY',
    top_model_color: '#38bdf8',
    confidence: 90,
    gap_to_second: 4.3,
    is_transition_zone: true,
    triggers: [{ name: 'VIX falling < 18', strength: 85 }],
    updated_at: null,
  },
  models: [
    { rank: 1, model_id: 'recovery-reflation', name_th: 'โมเดลฟื้นตัว / รีเฟลชัน', short_th: 'ฟื้นตัว', score: 62.3, status: 'active', confidence: 90, color: '#38bdf8' },
    { rank: 2, model_id: 'inflation-oil', name_th: 'โมเดลน้ำมันพุ่ง-เงินเฟ้อ', short_th: 'เงินเฟ้อ-น้ำมัน', score: 46.2, status: 'building', confidence: 89, color: '#f59e0b' },
  ],
  key_figures: [
    { series_id: 'us10y', name_th: 'ผลตอบแทนพันธบัตรสหรัฐ 10 ปี', value: 4.699, unit: '%', change_pct: null, change_val: 0 },
    { series_id: 'vix', name_th: 'ดัชนีความผันผวน VIX', value: 15.51, unit: 'index', change_pct: 0.06, change_val: null },
    { series_id: 'xauusd', name_th: 'ทองคำ', value: 4376, unit: 'USD', change_pct: -1.22, change_val: null },
    { series_id: 'us_banking_stress_index', name_th: 'ดัชนีความเสี่ยงแบงก์รัน', value: null, unit: 'index', change_pct: null, change_val: null },
  ],
  yield_curve: [
    { tenor: '13W', yield: 3.718 },
    { tenor: '2Y', yield: 4.25 },
    { tenor: '10Y', yield: 4.699 },
    { tenor: '30Y', yield: 5.243 },
  ],
  country_risk: {
    top: [
      { country_code: 'LA', score: 68, level: 'high' },
      { country_code: 'RU', score: 58, level: 'high' },
      { country_code: 'TR', score: 51, level: 'medium' },
    ],
    total: 27,
  },
  warnings: [],
  brief,
  updated_at: '11/08/2026 12:00:00 UTC',
  data_sources: ['FRED', 'Yahoo Finance'],
};

describe('OverviewDashboard', () => {
  beforeEach(() => {
    vi.mocked(client.getOverviewDashboard).mockResolvedValue(payload as never);
  });

  it('renders AI brief + recommendations + scenarios + events', async () => {
    render(<OverviewDashboard />);
    await waitFor(() => expect(screen.getByText(/ตลาดเข้าสู่ช่วง recovery/)).toBeTruthy());
    expect(screen.getByText('คำแนะนำ')).toBeTruthy();
    expect(screen.getByText('ถือทองคำต่อ')).toBeTruthy();
    expect(screen.getByText('จินตนาการ')).toBeTruthy();
    expect(screen.getByText('เหตุการณ์สำคัญข้างหน้า')).toBeTruthy();
    expect(screen.getByText(/Core CPI m\/m/)).toBeTruthy();
    expect(screen.getByText(/คาด 0\.2%/)).toBeTruthy();
  });

  it('renders regime + top model + country risk', async () => {
    render(<OverviewDashboard />);
    await waitFor(() => expect(screen.getByText('ฟื้นตัว')).toBeTruthy());
    expect(screen.getByText(/ความครบของข้อมูล:/)).toBeTruthy();
    expect(screen.getByText('โซนเปลี่ยนผ่าน')).toBeTruthy();
    expect(screen.getByText('โมเดลอันดับ 1')).toBeTruthy();
    expect(screen.getAllByText('โมเดลฟื้นตัว / รีเฟลชัน').length).toBeGreaterThan(0);
    expect(screen.getAllByText('62.3').length).toBeGreaterThan(0);
    expect(screen.getByText(/Long NAS100\/US500/)).toBeTruthy();
    expect(screen.getByText('LA')).toBeTruthy();
    expect(screen.getByText('ดูเพิ่มเติม (24)')).toBeTruthy();
  });

  it('renders key figures with — for missing values', async () => {
    render(<OverviewDashboard />);
    await waitFor(() => expect(screen.getByText('ตัวเลขสำคัญ')).toBeTruthy());
    expect(screen.getByText('4.699%')).toBeTruthy();
    expect(screen.getByText('$4,376')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders yield curve + 6-model list with status badges', async () => {
    render(<OverviewDashboard />);
    await waitFor(() => expect(screen.getByText('Yield Curve — US')).toBeTruthy());
    expect(screen.getByText('โมเดลน้ำมันพุ่ง-เงินเฟ้อ')).toBeTruthy();
    expect(screen.getByText('กำลังก่อตัว')).toBeTruthy();
  });

  it('refresh brief button calls API and reloads', async () => {
    vi.mocked(client.refreshOverviewBrief).mockResolvedValue(brief as never);
    render(<OverviewDashboard />);
    await waitFor(() => expect(screen.getByText('สร้างสรุปใหม่')).toBeTruthy());
    const btn = screen.getByText('สร้างสรุปใหม่');
    btn.click();
    await waitFor(() => expect(client.refreshOverviewBrief).toHaveBeenCalled());
  });
});

describe('OverviewDashboard — % เปลี่ยนแปลงในตัวเลขสำคัญ', () => {
  it('แสดง change_pct ตามที่ backend ส่งมา ไม่คูณ 100 ซ้ำ', async () => {
    // macro_service.py:734 คำนวณ (last/prev - 1) * 100 มาแล้ว → -3.4 คือ -3.4%
    // เคยคูณซ้ำจนบน prod ขึ้น "-340.00%" (VIX) และ "+253.00%" (ทองคำ)
    (client.getOverviewDashboard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...payload,
      key_figures: [
        { series_id: 'vix', name_th: 'ดัชนีความผันผวน VIX', value: 14.76, unit: 'index', change_pct: -3.4, change_val: null },
        { series_id: 'xauusd', name_th: 'ทองคำ', value: 4494.1, unit: 'USD', change_pct: 2.53, change_val: null },
      ],
    });

    render(<OverviewDashboard />);

    expect(await screen.findByText('-3.40%')).toBeTruthy();
    expect(screen.getByText('+2.53%')).toBeTruthy();
    expect(screen.queryByText('-340.00%')).toBeNull();
    expect(screen.queryByText('+253.00%')).toBeNull();
  });
});
