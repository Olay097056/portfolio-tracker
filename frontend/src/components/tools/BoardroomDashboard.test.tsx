import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { BoardroomDashboard } from './BoardroomDashboard';
import type { BoardroomMeeting, BoardroomMeetingDetail } from '../../api/types';

vi.mock('../../api/client', () => ({
  listBoardroomMeetings: vi.fn(),
  getBoardroomMeeting: vi.fn(),
  createBoardroomMeeting: vi.fn(),
  resumeBoardroomMeeting: vi.fn(),
}));

const mockClient = client as unknown as {
  listBoardroomMeetings: ReturnType<typeof vi.fn>;
  getBoardroomMeeting: ReturnType<typeof vi.fn>;
  createBoardroomMeeting: ReturnType<typeof vi.fn>;
  resumeBoardroomMeeting: ReturnType<typeof vi.fn>;
};

function makeMeeting(overrides: Partial<BoardroomMeeting> = {}): BoardroomMeeting {
  return {
    id: 'm_1',
    status: 'completed',
    phase: 'resolution',
    current_turn: 20,
    turn_plan: JSON.stringify([
      { phase: 'opening', seat: 'ceo', kind: 'opening' },
      { phase: 'research', seat: 'scout', kind: 'research' },
      { phase: 'briefing', seat: 'macro', kind: 'brief' },
      { phase: 'debate_r1', seat: 'macro', kind: 'rebuttal' },
      { phase: 'verification', seat: 'challenger_a', kind: 'review' },
      { phase: 'resolution', seat: 'ceo', kind: 'resolution' },
    ]),
    agenda: 'ประเมินทิศทางบอนด์สหรัฐหลังน้ำมันช็อก',
    trigger_type: 'manual',
    mode: 'full',
    llm_calls: 23,
    tokens_in: 126530,
    tokens_out: 22824,
    error: null,
    created_at: '2026-08-09T12:00:00Z',
    updated_at: '2026-08-09T12:05:00Z',
    ended_at: '2026-08-09T12:05:00Z',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<BoardroomMeetingDetail> = {}): BoardroomMeetingDetail {
  return {
    ...makeMeeting(),
    resolution_md: '# ฉบับวิเคราะห์เต็ม\n\n## สรุป\nบอนด์นิ่ง ทองขึ้น',
    resolution_json: JSON.stringify({
      plain: {
        summary: 'ตลาดยังไม่ panic น้ำมันช็อกแต่บอนด์นิ่ง',
        proven: ['US10Y อยู่ที่ 4.69% ณ เปิดประชุม', 'ทองคำขึ้นมาที่ 4399.7'],
        unproven: ['HY จะกว้างขึ้นจากน้ำมัน'],
        watch: ['ราคาน้ำมัน Brent'],
        outlook: 'จับตา breakeven',
      },
      claim_summary: { verified: 2, failed: 1, unverified: 1 },
      stances: [
        { asset: 'US10Y', stance: 'neutral', confidence: 55, horizon: 'short', horizon_days: 30, price_at: 4.69, reason: 'ข้อมูลจริง' },
        { asset: 'XAUUSD', stance: 'long', confidence: 70, horizon: 'medium', horizon_days: 60, price_at: 4399.7, reason: 'ทองขึ้น' },
      ],
      verification: [
        { claim: 'US10Y 4.69%', verdict: 'true' },
        { claim: 'HY จะกว้าง 80bp', verdict: 'false' },
      ],
    }),
    messages: [
      {
        id: 'msg1', turn: 1, phase: 'opening', seat_id: 'ceo', seat_name: 'เจมส์ (CEO)',
        kind: 'opening', content_md: 'วาระ: ประเมินทิศทางบอนด์\nคำถามหลัก:\n1. ...', status: 'ok',
        error: null, tokens_in: 4043, tokens_out: 500, created_at: '2026-08-09T12:00:00Z',
      },
      {
        id: 'msg2', turn: 2, phase: 'briefing', seat_id: 'macro', seat_name: 'นักเศรษฐศาสตร์มหภาค',
        kind: 'brief', content_md: 'จุดยืน: US10Y long (ความมั่นใจ 65%)', status: 'ok',
        error: null, tokens_in: 1000, tokens_out: 200, created_at: '2026-08-09T12:00:30Z',
      },
    ],
    claims: [
      {
        id: 'c1', seat_id: 'macro', phase: 'briefing', claim_text: 'US10Y อยู่ที่ 4.69%',
        metric: 'us10y', verdict: 'verified', sub_reason: null, reason: 'อ้าง 4.69 — จริง 4.69', checks: null,
      },
      {
        id: 'c2', seat_id: 'credit', phase: 'briefing', claim_text: 'HY spread กว้างขึ้น 80bp',
        metric: 'us_hy_spread', verdict: 'failed', sub_reason: 'wrong_value', reason: 'อ้าง 80bp — จริง -9bp', checks: null,
      },
      {
        id: 'c3', seat_id: 'macro', phase: 'briefing', claim_text: 'เฟดกำลังจะเปลี่ยนท่าที',
        metric: null, verdict: 'unverifiable', sub_reason: 'opinion', reason: 'เป็นความเห็น', checks: null,
      },
    ],
    seats: [
      { seat_id: 'ceo', position_key: 'ceo', provider: 'deepseek', model: 'deepseek-v4-flash', name_th: 'เจมส์ (CEO)', name_en: 'James (CEO)', enabled: 1, sort: 0 },
      { seat_id: 'scout', position_key: 'research', provider: 'deepseek', model: 'deepseek-v4-flash', name_th: 'แมวมอง (วิจัยภายนอก)', name_en: 'Scout', enabled: 1, sort: 1 },
      { seat_id: 'macro', position_key: 'macro', provider: 'deepseek', model: 'deepseek-v4-flash', name_th: 'นักเศรษฐศาสตร์มหภาค', name_en: 'Macro', enabled: 1, sort: 2 },
      { seat_id: 'credit', position_key: 'credit', provider: 'deepseek', model: 'deepseek-v4-flash', name_th: 'นักวิเคราะห์เครดิต/บอนด์', name_en: 'Credit', enabled: 1, sort: 3 },
      { seat_id: 'technical', position_key: 'technical', provider: 'deepseek', model: 'deepseek-v4-flash', name_th: 'นักวิเคราะห์เทคนิคอล', name_en: 'Technical', enabled: 1, sort: 4 },
      { seat_id: 'challenger_a', position_key: 'challenger', provider: 'deepseek', model: 'deepseek-v4-flash', name_th: 'ผู้ท้าทาย A', name_en: 'Challenger A', enabled: 1, sort: 5 },
      { seat_id: 'challenger_b', position_key: 'challenger', provider: 'deepseek', model: 'deepseek-v4-flash', name_th: 'ผู้ท้าทาย B', name_en: 'Challenger B', enabled: 1, sort: 6 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.listBoardroomMeetings.mockResolvedValue({ meetings: [makeMeeting()] });
});

describe('BoardroomDashboard', () => {
  it('แสดง empty state เมื่อไม่มีประชุม', async () => {
    mockClient.listBoardroomMeetings.mockResolvedValue({ meetings: [] });
    render(<BoardroomDashboard />);
    expect(await screen.findByText(/ยังไม่มีการประชุม/)).toBeTruthy();
  });

  it('แสดงรายการประชุม + ป้ายสถานะ + ต้นทุน', async () => {
    mockClient.listBoardroomMeetings.mockResolvedValue({
      meetings: [
        makeMeeting({ id: 'm1', status: 'completed', agenda: 'ประชุมแรก' }),
        makeMeeting({ id: 'm2', status: 'failed', agenda: 'ประชุมที่ล้ม', error: 'เกินเพดานคอล' }),
      ],
    });
    render(<BoardroomDashboard />);
    expect(await screen.findByText('ประชุมแรก')).toBeTruthy();
    expect(screen.getByText('ประชุมที่ล้ม')).toBeTruthy();
    // ป้ายสถานะเป็น <span>; ชิปตัวกรอง (9.4) ใช้ข้อความเดียวกันแต่เป็น <button>
    // จึงเจาะจงว่านับเฉพาะ badge ไม่ใช่ชิป — ไม่งั้นเทสต์ผ่านได้ทั้งที่ badge หาย
    const badges = screen.getAllByText(/^(เสร็จสิ้น|ล้มเหลว)$/).filter((el) => el.tagName === 'SPAN');
    expect(badges.map((el) => el.textContent).sort()).toEqual(['ล้มเหลว', 'เสร็จสิ้น']);
    expect(screen.getAllByText(/เรียก AI: 23/).length).toBeGreaterThan(0);
  });

  it('ปุ่มเปิดประชุมเรียก API ถูกต้อง + ปิดเมื่อวาระว่าง', async () => {
    mockClient.createBoardroomMeeting.mockResolvedValue(makeMeeting({ id: 'm_new' }));
    mockClient.getBoardroomMeeting.mockResolvedValue(makeDetail({ id: 'm_new', status: 'running' }));
    render(<BoardroomDashboard />);
    await screen.findByText('ประเมินทิศทางบอนด์สหรัฐหลังน้ำมันช็อก');

    fireEvent.click(screen.getByText('＋ เปิดประชุม'));
    const textarea = screen.getByPlaceholderText(/พิมพ์วาระ\/โจทย์/);
    const submit = screen.getByText('เปิดประชุม').closest('button')!;
    expect(submit.disabled).toBe(true); // วาระว่าง → ปิด

    fireEvent.change(textarea, { target: { value: 'ประเมินทองคำหลัง CPI' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mockClient.createBoardroomMeeting).toHaveBeenCalledWith({
        agenda: 'ประเมินทองคำหลัง CPI',
        trigger_type: 'manual',
        mode: 'full',
      });
    });
    // เปิดแล้วดึง detail มาดูสด
    await waitFor(() => expect(mockClient.getBoardroomMeeting).toHaveBeenCalledWith('m_new'));
  });

  it('แสดงมติ + ป้ายผลตรวจสอบ 3 แบบจาก fixture', async () => {
    mockClient.getBoardroomMeeting.mockResolvedValue(makeDetail());
    render(<BoardroomDashboard />);
    await screen.findByText('ประเมินทิศทางบอนด์สหรัฐหลังน้ำมันช็อก');

    fireEvent.click(screen.getByText('ประเมินทิศทางบอนด์สหรัฐหลังน้ำมันช็อก'));
    // headings carry emoji prefixes (👑/✅) — match by regex
    expect(await screen.findByText(/มติที่ประชุม/)).toBeTruthy();
    expect(screen.getByText(/ข้อสรุปที่พิสูจน์แล้ว/)).toBeTruthy();
    expect(screen.getByText('US10Y อยู่ที่ 4.69% ณ เปิดประชุม')).toBeTruthy();
    // stances (asset name + badge both contain the symbol)
    expect(screen.getAllByText(/XAUUSD/).length).toBeGreaterThan(0);
    // verification labels (claims section group headers + resolution verification)
    expect(screen.getAllByText(/ผ่านการพิสูจน์/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ขัดกับข้อมูลจริง/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ตรวจไม่ได้/).length).toBeGreaterThan(0);
    // 2.2 safety: Boardroom stance confidence still uses "ความมั่นใจ" (AI confidence on stance, not data completeness)
    expect(screen.getByText(/จุดยืน: US10Y long \(ความมั่นใจ 65%\)/)).toBeTruthy();
  });

  it('ประชุม failed แสดง error + ปุ่มประชุมต่อเรียก API', async () => {
    mockClient.getBoardroomMeeting.mockResolvedValue(
      makeDetail({ id: 'm2', status: 'failed', error: 'เกินเพดานคอล — ตัดประชุม' }),
    );
    mockClient.resumeBoardroomMeeting.mockResolvedValue(makeMeeting({ id: 'm2', status: 'running' }));
    render(<BoardroomDashboard />);
    await screen.findByText('ประเมินทิศทางบอนด์สหรัฐหลังน้ำมันช็อก');

    fireEvent.click(screen.getByText('ประเมินทิศทางบอนด์สหรัฐหลังน้ำมันช็อก'));
    expect(await screen.findByText(/เกินเพดานคอล/)).toBeTruthy();

    fireEvent.click(screen.getByText(/ประชุมต่อ/));
    await waitFor(() => expect(mockClient.resumeBoardroomMeeting).toHaveBeenCalledWith('m2'));
  });
});

describe('BoardroomDashboard — ตัวกรองคลังประชุม (9.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.listBoardroomMeetings.mockResolvedValue({
      meetings: [makeMeeting({ id: 'm1', status: 'completed', agenda: 'ประชุมแรก' })],
    });
  });

  it('ไม่มีตัวกรอง = ไม่ส่งพารามิเตอร์ (ยิงครั้งเดียว)', async () => {
    render(<BoardroomDashboard />);
    await screen.findByText('ประชุมแรก');
    expect(mockClient.listBoardroomMeetings).toHaveBeenCalledTimes(1);
    expect(mockClient.listBoardroomMeetings).toHaveBeenCalledWith();
  });

  it('กด "ล้มเหลว" → ส่ง status=failed ไป API (กรองที่ server ไม่ใช่ในหน้า)', async () => {
    render(<BoardroomDashboard />);
    await screen.findByText('ประชุมแรก');

    mockClient.listBoardroomMeetings.mockResolvedValue({
      meetings: [makeMeeting({ id: 'mf', status: 'failed', agenda: 'ประชุมที่ล้ม' })],
    });
    const chips = screen.getAllByText('ล้มเหลว').filter((el) => el.tagName === 'BUTTON');
    expect(chips).toHaveLength(1);
    fireEvent.click(chips[0]);

    await waitFor(() =>
      expect(mockClient.listBoardroomMeetings).toHaveBeenCalledWith('failed', null));
    expect(await screen.findByText('ประชุมที่ล้ม')).toBeTruthy();
  });

  it('กรองตามที่มา → ส่ง trigger_type', async () => {
    render(<BoardroomDashboard />);
    await screen.findByText('ประชุมแรก');
    const chip = screen.getAllByText('เปิดจากข่าว').filter((el) => el.tagName === 'BUTTON')[0];
    fireEvent.click(chip);
    await waitFor(() =>
      expect(mockClient.listBoardroomMeetings).toHaveBeenCalledWith(null, 'news'));
  });

  it('กรองแล้วไม่พบ → ข้อความบอก ไม่ใช่หน้าว่าง', async () => {
    render(<BoardroomDashboard />);
    await screen.findByText('ประชุมแรก');
    mockClient.listBoardroomMeetings.mockResolvedValue({ meetings: [] });
    fireEvent.click(screen.getAllByText('ล้มเหลว').filter((el) => el.tagName === 'BUTTON')[0]);
    expect(await screen.findByText('ไม่พบประชุมที่ตรงกับตัวกรอง')).toBeTruthy();
  });

  it('กรองแล้วแผงประชุมสดต้องไม่หาย (ยังล็อกปุ่มเปิดประชุมอยู่)', async () => {
    // รายการไม่กรองมีประชุมที่กำลังรัน — ถ้ากรอง "ล้มเหลว" แล้วเขียนทับ state เดิม
    // แผงสดจะหายและปุ่มเปิดประชุมจะปลดล็อกทั้งที่ยังประชุมค้างอยู่
    mockClient.listBoardroomMeetings.mockResolvedValue({
      meetings: [makeMeeting({ id: 'run1', status: 'running', agenda: 'ประชุมที่กำลังรัน' })],
    });
    render(<BoardroomDashboard />);
    // ปรากฏ 2 ที่: แผงประชุมสด + แถวในคลัง
    expect((await screen.findAllByText(/ประชุมที่กำลังรัน/)).length).toBe(2);

    mockClient.listBoardroomMeetings.mockResolvedValue({ meetings: [] });
    fireEvent.click(screen.getAllByText('ล้มเหลว').filter((el) => el.tagName === 'BUTTON')[0]);
    await screen.findByText('ไม่พบประชุมที่ตรงกับตัวกรอง');
    expect(screen.getAllByText(/ประชุมที่กำลังรัน/).length).toBeGreaterThan(0);
  });
});
