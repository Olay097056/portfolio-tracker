import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { BoardroomSignalsDashboard } from './BoardroomSignalsDashboard';
import type { BoardroomStance, BoardroomStancesPayload } from '../../api/types';

vi.mock('../../api/client', () => ({
  getBoardroomStances: vi.fn(),
}));

const mockClient = client as unknown as { getBoardroomStances: ReturnType<typeof vi.fn> };

function makeStance(over: Partial<BoardroomStance>): BoardroomStance {
  return {
    id: 'st_1', meeting_id: 'm_1', asset: 'XAUUSD', price_key: 'XAUUSD', source: 'alias',
    unit: 'pct', direction: 'long', price_at: 4400, current: 4620, pnl: 5,
    dd: -1.2, due_at: '2026-09-01T00:00:00.000Z', started_at: '2026-08-01T00:00:00.000Z',
    horizon_days: 30, confidence: 70, consensus: 'contested', qualified: true,
    reason: 'r', unit_mismatch: false, state: 'pending', verdict: null,
    checks: [{ k: 'd1', correct: null, change_pct: null, unit: 'pct' },
             { k: 'd3', correct: null, change_pct: null, unit: 'pct' },
             { k: 'd7', correct: null, change_pct: null, unit: 'pct' }],
    ...over,
  };
}

function makePayload(stances: BoardroomStance[], statsOver: Record<string, unknown> = {}): BoardroomStancesPayload {
  return {
    stances,
    stats: {
      pending_count: stances.filter((s) => s.qualified && s.state === 'pending').length,
      settled_count: 0, win_rate: null, win_rate_display: null,
      wins: 0, losses: 0, pushes: 0, n: 0, cold_start: true,
      pnl_live: { pct: null, bp: null, pct_n: 0, bp_n: 0 },
      pnl_realized: { pct: null, bp: null, pct_n: 0, bp_n: 0 },
      track_record: [], checks_summary: [
        { k: 'd1', judged: 0, pct: null, wins: 0 },
        { k: 'd3', judged: 0, pct: null, wins: 0 },
        { k: 'd7', judged: 0, pct: null, wins: 0 },
      ],
      ...statsOver,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BoardroomSignalsDashboard', () => {
  it('แยกสองกลุ่ม (ราคา % / yield-สเปรด bp) จาก fixture', async () => {
    mockClient.getBoardroomStances.mockResolvedValue(makePayload([
      makeStance({ id: 's1', asset: 'XAUUSD', unit: 'pct', state: 'pending' }),
      makeStance({ id: 's2', asset: 'US10Y', unit: 'bp', price_at: 4.66, current: 4.70, pnl: 4, state: 'pending' }),
    ]));
    render(<BoardroomSignalsDashboard />);
    await screen.findByText('กลุ่มราคา (%)');
    expect(screen.getByText('กลุ่ม Yield / สเปรด (bp)')).toBeTruthy();
    expect(screen.getByText('XAUUSD')).toBeTruthy();
    expect(screen.getByText('US10Y')).toBeTruthy();
  });

  it('สลับแท็บ นับถอยหลัง ↔ สรุปแล้ว', async () => {
    mockClient.getBoardroomStances.mockResolvedValue(makePayload([
      makeStance({ id: 's1', asset: 'XAUUSD', state: 'pending' }),
      makeStance({ id: 's2', asset: 'US10Y', unit: 'bp', price_at: 4.66, current: 4.70, pnl: 4,
                   state: 'settled', verdict: 'win' }),
    ]));
    render(<BoardroomSignalsDashboard />);
    await screen.findByText('XAUUSD');
    expect(screen.queryByText('US10Y')).toBeNull(); // settled ไม่อยู่ในแท็บนับถอยหลัง
    fireEvent.click(screen.getByText('สรุปแล้ว'));
    await screen.findByText('US10Y');
    expect(screen.queryByText('XAUUSD')).toBeNull();
  });

  it('จุดตรวจที่ยังไม่ถึงเวลาแสดง "ยังไม่ถึงเวลา"', async () => {
    mockClient.getBoardroomStances.mockResolvedValue(makePayload([
      makeStance({ id: 's1', asset: 'XAUUSD', state: 'pending' }),
    ]));
    render(<BoardroomSignalsDashboard />);
    await screen.findByText('XAUUSD');
    expect(screen.getByText(/ยังไม่ถึงเวลา/)).toBeTruthy();
  });

  it('P&L สีถูก (บวกเขียว/ลบแดง) + ราคาดึงไม่ได้ → "—"', async () => {
    mockClient.getBoardroomStances.mockResolvedValue(makePayload([
      makeStance({ id: 's1', asset: 'XAUUSD', pnl: 5, state: 'pending' }),
      makeStance({ id: 's2', asset: 'USOIL', direction: 'short', price_at: 80, current: 85, pnl: -6.25,
                   state: 'pending' }),
      makeStance({ id: 's3', asset: 'BTC-USD', current: null, pnl: null, state: 'unresolved', price_key: null }),
    ]));
    render(<BoardroomSignalsDashboard />);
    await screen.findByText('XAUUSD');
    const plus = screen.getByText('+5.00%');
    expect(plus.style.color).toBe('rgb(52, 211, 153)'); // emerald
    const minus = screen.getByText('-6.25%');
    expect(minus.style.color).toBe('rgb(248, 113, 113)'); // red
    // ราคาดึงไม่ได้ → "—" (ราคาปัจจุบัน) + ป้ายตรวจไม่ได้
    expect(screen.getByText('ตรวจไม่ได้ — ไม่มีราคา')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('empty state ทั้งสองแท็บ', async () => {
    mockClient.getBoardroomStances.mockResolvedValue(makePayload([]));
    render(<BoardroomSignalsDashboard />);
    await screen.findByText('ยังไม่มีสัญญาณนับถอยหลัง');
    fireEvent.click(screen.getByText('สรุปแล้ว'));
    await screen.findByText('ยังไม่มีสัญญาณที่สรุปแล้ว');
  });

  it('สถิติตอนข้อมูลน้อยไม่โชว์เปอร์เซ็นต์ (cold start)', async () => {
    mockClient.getBoardroomStances.mockResolvedValue(makePayload([], {
      cold_start: true, win_rate: null, n: 3, wins: 2, losses: 1,
    }));
    render(<BoardroomSignalsDashboard />);
    await screen.findByText('รอข้อมูลเพิ่ม');
    expect(screen.getByText(/ยังสะสมสถิติไม่พอ/)).toBeTruthy();
  });

  it('มุมมอง (ไม่เข้าบัญชี) แยกจากสัญญาณ', async () => {
    mockClient.getBoardroomStances.mockResolvedValue(makePayload([
      makeStance({ id: 's1', asset: 'XAUUSD', state: 'pending', qualified: true }),
      makeStance({ id: 's2', asset: 'GBPUSD', state: 'pending', qualified: false, confidence: 55 }),
    ]));
    render(<BoardroomSignalsDashboard />);
    await screen.findByText('XAUUSD');
    // header "มุมมอง (ไม่เข้าบัญชี)" + disclaimer — เจอได้หลายจุด
    expect(screen.getAllByText(/มุมมอง \(ไม่เข้าบัญชี\)/).length).toBeGreaterThan(0);
  });
});
