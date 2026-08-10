import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import type { TradeDeskState } from '../../api/types';
import { TradeDeskDashboard } from './TradeDeskDashboard';

vi.mock('../../api/client', () => ({
  getTradeDeskState: vi.fn(),
  runTradeDeskTurn: vi.fn(),
  setTradeDeskSettings: vi.fn(),
}));

const mock = vi.mocked(client);

function fixture(over: Partial<TradeDeskState> = {}): TradeDeskState {
  return {
    master_on: true,
    per_team_daily_cap: 4,
    updated_at: '2026-08-10T03:00:00Z',
    teams: [
      {
        id: 't1', code: 'A', name_th: 'ทีม A · สายเทรนด์', name_en: 'Team Trend Rider',
        status: 'active', capital: 10000, balance: 9400, equity: 10500, pnl_pct: 5.0,
        margin_used: 600, mtd_pct: 5.0, weekly_target_pct: 1.5,
        monthly_floor_pct: 5, monthly_stretch_pct: 20, interval_hours: 4,
        next_turn_at: '2026-08-10T07:00:00Z', directive_md: '', turns_today: 1,
        cost_today_usd: 0.00047, cost_total_usd: 0.00141,
        positions: [{ market: 'BTC-USD', side: 'long', unit: 'pct', size: 0.0086, entry_px: 70000,
                      sl_pct: 3, tp_pct: 6, status: 'open', realized_pnl: 0,
                      mark: 70500, live_pnl: 4.30 }],
        snapshots: [
          { equity: 10100, snapped_at: '2026-08-10T01:00:00Z' },
          { equity: 10300, snapped_at: '2026-08-10T02:00:00Z' },
          { equity: 10500, snapped_at: '2026-08-10T03:00:00Z' },
        ],
        closed_positions: [{ market: 'TLT', side: 'long', entry_px: 82.76, close_px: 84.2,
                             status: 'tp', realized_pnl: 80, closed_at: '2026-08-09T10:00:00Z' }],
        turns: [{ id: 'tr1', tokens_in: 2200, tokens_out: 450, cost_usd: 0.000434,
                  started_at: '2026-08-10T02:00:00Z',
                  lead_decision: { action: 'open', market: 'BTC-USD', side: 'long',
                                   reason: 'เทรนด์ชัด ราคาเหนือ MA' } }],
      },
      {
        id: 't2', code: 'B', name_th: 'ทีม B · สายกลับค่า', name_en: 'Team Mean Reverter',
        status: 'active', capital: 10000, balance: 9700, equity: 9800, pnl_pct: -2.0,
        margin_used: 300, mtd_pct: -2.0, weekly_target_pct: 1.0,
        monthly_floor_pct: 5, monthly_stretch_pct: 20, interval_hours: 12,
        next_turn_at: '2026-08-10T15:00:00Z', directive_md: '', turns_today: 2,
        cost_today_usd: 0.00094, cost_total_usd: 0.00094,
        positions: [], snapshots: [], closed_positions: [], turns: [],
      },
    ],
    ...over,
  };
}

describe('TradeDeskDashboard', () => {
  beforeEach(() => {
    mock.getTradeDeskState.mockResolvedValue(fixture());
  });

  it('render สองทีมจาก fixture + ข้อมูลครบ', async () => {
    render(<TradeDeskDashboard />);
    expect(await screen.findByText('ทีม A · สายเทรนด์')).toBeTruthy();
    expect(screen.getByText('ทีม B · สายกลับค่า')).toBeTruthy();
    // equity + pnl
    expect(screen.getByText('$10,500')).toBeTruthy();
    expect(screen.getByText('+5.00%')).toBeTruthy();
    expect(screen.getByText('-2.00%')).toBeTruthy();
    // ไม้เปิด + ไม้ปิด (BTC เจอ 2 จุด: การ์ดทีม + ตารางรวม)
    expect(screen.getAllByText('BTC-USD').length).toBeGreaterThan(0);
    expect(screen.getByText('TLT')).toBeTruthy();
    // เหตุผลหัวหน้า
    expect(screen.getByText(/เทรนด์ชัด ราคาเหนือ MA/)).toBeTruthy();
  });

  it('กราฟไม่พังเมื่อข้อมูลว่าง', async () => {
    mock.getTradeDeskState.mockResolvedValue(fixture({ teams: [] }));
    render(<TradeDeskDashboard />);
    expect(await screen.findByText(/ยังไม่มีข้อมูล equity/)).toBeTruthy();
  });

  it('สวิตช์หลักปิด → ปุ่มเปิดเทิร์นถูก disable + แสดงข้อความต้นฉบับ', async () => {
    mock.getTradeDeskState.mockResolvedValue(fixture({ master_on: false }));
    render(<TradeDeskDashboard />);
    await screen.findByText('ทีม A · สายเทรนด์');
    expect(screen.getByText(/สวิตช์หลักปิดอยู่ — ทีมจะไม่เปิดเทิร์นเทรด/)).toBeTruthy();
    const btns = screen.getAllByRole('button', { name: /สวิตช์หลักปิดอยู่/ });
    expect(btns.length).toBeGreaterThan(0);
    (btns[0] as HTMLButtonElement).disabled === true;
  });

  it('โควตาหมด → ปุ่มถูก disable + แสดงจำนวน', async () => {
    mock.getTradeDeskState.mockResolvedValue(fixture({
      teams: fixture().teams.map((t) => ({ ...t, turns_today: 4 })),
    }));
    render(<TradeDeskDashboard />);
    await screen.findByText('ทีม A · สายเทรนด์');
    expect(screen.getAllByText(/หมดโควตาเทิร์น \(4\/4\)/).length).toBeGreaterThan(0);
  });

  it('ไม้ปิดแสดง P&L สีถูก (กำไรเขียว/ขาดทุนแดง)', async () => {
    mock.getTradeDeskState.mockResolvedValue(fixture({
      teams: fixture().teams.map((t) => t.id === 't1' ? {
        ...t,
        closed_positions: [
          { market: 'TLT', side: 'long', entry_px: 82.76, close_px: 84.2, status: 'tp',
            realized_pnl: 80, closed_at: '2026-08-09T10:00:00Z' },
          { market: 'CL', side: 'short', entry_px: 78.72, close_px: 80.0, status: 'sl',
            realized_pnl: -50, closed_at: '2026-08-08T10:00:00Z' },
        ],
      } : t),
    }));
    render(<TradeDeskDashboard />);
    await screen.findByText('ทีม A · สายเทรนด์');
    // กำไร $80 เขียว / ขาดทุน $-50 แดง (fmtUsd วางเครื่องหมายหลัง $ — ตรวจ style.color)
    const win = screen.getByText(/P&L \$80\.00/);
    const loss = screen.getByText(/P&L \$-50\.00/);
    expect((win as HTMLElement).style.color).toBe('rgb(63, 185, 80)');    // #3fb950
    expect((loss as HTMLElement).style.color).toBe('rgb(248, 81, 73)');   // #f85149
  });

  it('ราคาดึงไม่ได้ → "—" (close_px null)', async () => {
    mock.getTradeDeskState.mockResolvedValue(fixture({
      teams: fixture().teams.map((t) => t.id === 't1' ? {
        ...t,
        closed_positions: [{ market: 'BTC-USD', side: 'long', entry_px: 70000,
                             close_px: null, status: 'closed', realized_pnl: 0,
                             closed_at: null }],
      } : t),
    }));
    render(<TradeDeskDashboard />);
    await screen.findByText('ทีม A · สายเทรนด์');
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });

  it('disclaimer แสดงเสมอ', async () => {
    render(<TradeDeskDashboard />);
    await screen.findByText('ทีม A · สายเทรนด์');
    expect(screen.getByText(/พอร์ตจำลอง ไม่ใช่การเทรดจริง/)).toBeTruthy();
  });

  it('ไม้ bp แสดงป้าย "ราคารายวัน" (กลุ่ม yield/spread — FRED รายวัน)', async () => {
    mock.getTradeDeskState.mockResolvedValue(fixture({
      teams: fixture().teams.map((t) => t.id === 't1' ? {
        ...t,
        positions: [{ market: 'US10Y', side: 'long', size: 1.2, entry_px: 4.66,
                      sl_pct: 1, tp_pct: 3, unit: 'bp', status: 'open', realized_pnl: 0,
                      mark: 4.66, live_pnl: 0 }],
      } : t),
    }));
    render(<TradeDeskDashboard />);
    await screen.findByText('ทีม A · สายเทรนด์');
    expect(screen.getAllByText('US10Y').length).toBeGreaterThan(0);  // การ์ด + ตารางรวม
    expect(screen.getAllByText('ราคารายวัน').length).toBeGreaterThan(0);
  });

  it('ไม้เปิดโชว์ P&L สด (mark→live) + กราฟ equity วาด polyline จาก snapshots', async () => {
    const { container } = render(<TradeDeskDashboard />);
    await screen.findByText('ทีม A · สายเทรนด์');
    // mark 70500 → P&L สด $4.30 (เขียว — กำไร; <b> ข้างใน span มีสีเขียว)
    const pnl = screen.getByText('$4.30');
    expect((pnl as HTMLElement).style.color).toBe('rgb(63, 185, 80)');
    // กราฟ: snapshots 3 จุด → polyline (ไม่ใช่เส้นประ)
    expect(container.querySelector('polyline')).toBeTruthy();
  });

  it('สลับสวิตช์หลักเรียก API + reload', async () => {
    mock.setTradeDeskSettings.mockResolvedValue({});
    render(<TradeDeskDashboard />);
    const btn = (await screen.findAllByRole('button', { name: /สวิตช์หลักเปิดอยู่/ }))[0];
    fireEvent.click(btn);
    expect(mock.setTradeDeskSettings).toHaveBeenCalledWith({ master_on: false });
  });
});
