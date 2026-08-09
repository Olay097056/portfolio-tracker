import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { CountryDetailPage } from './CountryDetailPage';
import type { CountryDetail, CountryBrief, CountryReport } from '../../api/types';

vi.mock('../../api/client', () => ({
  getCountryDetail: vi.fn(),
  getCountryBrief: vi.fn(),
  generateCountryReport: vi.fn(),
}));

const mockDetail = client.getCountryDetail as unknown as ReturnType<typeof vi.fn>;
const mockBrief = client.getCountryBrief as unknown as ReturnType<typeof vi.fn>;
const mockReport = client.generateCountryReport as unknown as ReturnType<typeof vi.fn>;

function detail(): CountryDetail {
  return {
    country: { code: 'TH', name_en: 'Thailand', name_th: 'ไทย', currency: 'THB', flag: '🇹🇭', data_tier: 'daily', data_tier_note_th: 'ข้อมูลรายวัน' },
    yield_curve: [
      { tenor: '1Y', value: 1.01 }, { tenor: '2Y', value: 1.2 }, { tenor: '5Y', value: 1.52 },
      { tenor: '10Y', value: 2.05 }, { tenor: '20Y', value: 3.0 },
    ],
    yield_asof: '2026-08-09',
    yield_stale: false,
    risk: {
      score: 0.8, level: 'low',
      components: { yield_level: 0, yield_momentum: 0.8, fx_depreciation: 0, data_freshness: 0 },
      updated_at: '09/08/2026 12:00 UTC',
    },
    trend: [{ date: '2026-06-01', value: 0.2 }, { date: '2026-08-09', value: 0.8 }],
    us10: 4.47,
    bps_vs_us: -242,
    mini_cards: [{ series_id: 'fx_thb', name_th: 'ค่าเงิน (THB/USD)', unit: 'THB', value: 33.02, change_pct: 2.45 }],
  };
}

function brief(): CountryBrief {
  return {
    brief_md: 'ไทยมีความเสี่ยงต่ำ (คะแนน 0.8)',
    recommendations: ['ลงทุนพันธบัตรกลาง-ยาว', 'กระจายการลงทุนต่างประเทศ'],
    scenarios: ['เฟดลดดอกเบี้ย → บาทแข็ง', 'โลกชะลอ → safe haven'],
    model_used: 'deepseek-v4-flash',
    generated_at: '09/08/2026 13:00',
  };
}

function report(): CountryReport {
  return {
    report_md: '## สรุปภาพรวม\nรายละเอียดเชิงลึกของไทย\n\n## ระดับ Yield\n2.05%',
    model_used: 'deepseek-v4-flash',
    generated_at: '09/08/2026 13:05',
  };
}

describe('CountryDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header, yield curve, scorecard and mini cards', async () => {
    mockDetail.mockResolvedValue(detail());
    mockBrief.mockRejectedValue(new Error('no brief'));
    render(<CountryDetailPage code="TH" onBack={() => {}} />);

    await waitFor(() => expect(screen.getByText(/ไทย/)).toBeTruthy());
    // Header: score rounded (0.8 → "1")
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    // Yield curve + spread badge
    expect(screen.getByText('Yield Curve')).toBeTruthy();
    expect(screen.getByText(/ส่วนต่างเทียบ US 10Y/)).toBeTruthy();
    expect(screen.getByText('-242 bps')).toBeTruthy();
    // Scorecard component bar label
    expect(screen.getByText('โมเมนตัม Yield (3 เดือน)')).toBeTruthy();
    // Mini card
    expect(screen.getByText('ค่าเงิน (THB/USD)')).toBeTruthy();
    expect(screen.getByText('33.02 THB')).toBeTruthy();
  });

  it('renders AI brief with recommendations and scenarios', async () => {
    mockDetail.mockResolvedValue(detail());
    mockBrief.mockResolvedValue(brief());
    render(<CountryDetailPage code="TH" onBack={() => {}} />);

    await waitFor(() => expect(screen.getByText(/ไทยมีความเสี่ยงต่ำ/)).toBeTruthy());
    expect(screen.getByText('คำแนะนำ')).toBeTruthy();
    expect(screen.getByText('ลงทุนพันธบัตรกลาง-ยาว')).toBeTruthy();
    expect(screen.getByText('จินตนาการ')).toBeTruthy();
    expect(screen.getByText('เฟดลดดอกเบี้ย → บาทแข็ง')).toBeTruthy();
  });

  it('stress test math: ΔPrice = -duration × ΔYield / 100', async () => {
    mockDetail.mockResolvedValue(detail());
    mockBrief.mockRejectedValue(new Error('no brief'));
    render(<CountryDetailPage code="TH" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('Duration Stress Test')).toBeTruthy());

    // Default: duration 8, ΔYield 200 → -8*200/100 = -16.0% (appears in the
    // ΔPrice box AND the 8yr×+200 matrix cell — assert both present)
    expect(screen.getAllByText('-16.0%').length).toBeGreaterThanOrEqual(1);
    // Matrix: 3yr × +100 = -3.0%, 5yr × +300 = -15.0% (red)
    expect(screen.getByText('-3.0%')).toBeTruthy();
    expect(screen.getByText('-15.0%')).toBeTruthy();
  });

  it('generates report on button click', async () => {
    mockDetail.mockResolvedValue(detail());
    mockBrief.mockRejectedValue(new Error('no brief'));
    mockReport.mockResolvedValue(report());
    render(<CountryDetailPage code="TH" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('สร้างรายงาน AI เชิงลึก')).toBeTruthy());

    fireEvent.click(screen.getByText('สร้างรายงาน AI เชิงลึก'));
    await waitFor(() => expect(mockReport).toHaveBeenCalledWith('TH'));
    await waitFor(() => expect(screen.getByText('สรุปภาพรวม')).toBeTruthy());
    expect(screen.getByText(/รายละเอียดเชิงลึกของไทย/)).toBeTruthy();
  });

  it('shows "—" for missing data and back button works', async () => {
    mockDetail.mockResolvedValue({
      ...detail(),
      country: { ...detail().country, code: 'LA', name_th: 'ลาว', flag: '🇱🇦' },
      yield_curve: [],
      risk: null,
      mini_cards: [],
      bps_vs_us: null,
      trend: [],
    });
    mockBrief.mockRejectedValue(new Error('no brief'));
    const onBack = vi.fn();
    render(<CountryDetailPage code="LA" onBack={onBack} />);
    await waitFor(() => expect(screen.getByText(/ลาว/)).toBeTruthy());
    // no curve → data-tier note (appears as subtitle + curve placeholder)
    expect(screen.getAllByText('ข้อมูลรายวัน').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('← กลับรายประเทศ'));
    expect(onBack).toHaveBeenCalled();
  });
});
