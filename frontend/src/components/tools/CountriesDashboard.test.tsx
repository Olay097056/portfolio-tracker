import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { CountriesDashboard } from './CountriesDashboard';
import type { CountriesDashboard as CountriesData } from '../../api/types';

vi.mock('../../api/client', () => ({
  getCountriesDashboard: vi.fn(),
  refreshCountriesDashboard: vi.fn(),
}));

const mockGet = client.getCountriesDashboard as unknown as ReturnType<typeof vi.fn>;
const mockRefresh = client.refreshCountriesDashboard as unknown as ReturnType<typeof vi.fn>;

function country(code: string, nameTh: string, flag: string, score: number | null, yieldV: number | null, level: string | null, bps: number | null, tier: string) {
  return {
    code, name_en: code, name_th: nameTh, currency: 'XXX', flag,
    data_tier: tier, data_tier_note_th: tier === 'manual' ? 'ไม่มีตลาดรอง — ติดตามผ่านอันดับเครดิตและข่าว' : 'ข้อมูลรายวัน',
    yield_value: yieldV, yield_asof: '2026-08-09', yield_stale: false,
    chg_bp: null, score, level,
    components: score === null ? null : { yield_level: 1, yield_momentum: 1, fx_depreciation: 1, data_freshness: 1 },
    bps_vs_us: bps,
    trend: score === null ? [] : [{ date: '2026-06-01', value: 5 }, { date: '2026-08-09', value: score }],
  };
}

function fixture(): CountriesData {
  return {
    us_10y: 4.47,
    updated_at: '09/08/2026 12:00:00 UTC',
    data_sources: ['FRED (fredgraph.csv)', 'worldgovernmentbonds.com (Playwright)'],
    countries: [
      country('TH', 'ไทย', '🇹🇭', 0.8, 2.05, 'low', -242, 'daily'),
      country('TR', 'ตุรกี', '🇹🇷', 32.8, 32.24, 'medium', 2777, 'sparse'),
      country('MX', 'เม็กซิโก', '🇲🇽', 33.8, 9.45, 'medium', 498, 'daily'),
      country('LA', 'ลาว', '🇱🇦', null, null, null, null, 'manual'),
      country('US', 'สหรัฐอเมริกา', '🇺🇸', 1.5, 4.47, 'low', null, 'realtime'),
    ],
  };
}

describe('CountriesDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders all country cards with scores, yields and badges', async () => {
    mockGet.mockResolvedValue(fixture());
    render(<CountriesDashboard />);

    await waitFor(() => expect(screen.getByText('รายประเทศ')).toBeTruthy());

    expect(screen.getByText('ไทย')).toBeTruthy();
    expect(screen.getByText('ตุรกี')).toBeTruthy();
    expect(screen.getByText('เม็กซิโก')).toBeTruthy();
    expect(screen.getByText('สหรัฐอเมริกา')).toBeTruthy();
    // Risk badges
    expect(screen.getAllByText('เสี่ยงต่ำ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('เสี่ยงปานกลาง').length).toBe(2);
    // Scores (rounded to integer, like the reference — score 33.8 -> "34")
    expect(screen.getByText('34')).toBeTruthy();
    // 10Y yields
    expect(screen.getByText('2.05%')).toBeTruthy();
    expect(screen.getByText('32.24%')).toBeTruthy();
  });

  it('renders em-dash for countries with no data (never fabricated)', async () => {
    mockGet.mockResolvedValue(fixture());
    render(<CountriesDashboard />);
    await waitFor(() => expect(screen.getByText('ลาว')).toBeTruthy());
    // Laos: no score, no yield — "—" appears (score, yield, 60-day)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('ไม่มีตลาดรอง — ติดตามผ่านอันดับเครดิตและข่าว')).toBeTruthy();
    // DataTierBadge renders with color (all 4 tiers in fixture render)
    expect(screen.getByText('ข้อมูลเรียลไทม์')).toBeTruthy();     // US — realtime
    expect(screen.getAllByText('ข้อมูลรายวัน').length).toBeGreaterThanOrEqual(1); // TH, MX — daily
    expect(screen.getByText('ข้อมูลจำกัด อาจล่าช้าบางวัน')).toBeTruthy(); // TR — sparse
  });

  it('sorts by risk desc/asc', async () => {
    mockGet.mockResolvedValue(fixture());
    render(<CountriesDashboard />);
    await waitFor(() => expect(screen.getByText('รายประเทศ')).toBeTruthy());

    // default order = display order (TH first)
    const cards = () => screen.getAllByRole('button').length;
    expect(cards()).toBeGreaterThan(0);

    // Click "เสี่ยงมาก→น้อย": MX/TR (highest) first
    fireEvent.click(screen.getByText('เสี่ยงมาก→น้อย'));
    // TR and MX have the two highest scores; both still render
    expect(screen.getByText('ตุรกี')).toBeTruthy();
    expect(screen.getByText('เม็กซิโก')).toBeTruthy();
    // persisted to localStorage like the reference
    expect(localStorage.getItem('bcd-countries-sort')).toBe('desc');

    fireEvent.click(screen.getByText('เสี่ยงน้อย→มาก'));
    expect(localStorage.getItem('bcd-countries-sort')).toBe('asc');
  });

  it('refresh button calls refreshCountriesDashboard', async () => {
    mockGet.mockResolvedValue(fixture());
    mockRefresh.mockResolvedValue(fixture());
    render(<CountriesDashboard />);
    await waitFor(() => expect(screen.getByText('รายประเทศ')).toBeTruthy());
    fireEvent.click(screen.getByText('↻ รีเฟรช'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('shows retry state when loading fails', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    render(<CountriesDashboard />);
    await waitFor(() => expect(screen.getByText('โหลดข้อมูลไม่สำเร็จ')).toBeTruthy());
    expect(screen.getByText('ลองใหม่')).toBeTruthy();
  });
});
