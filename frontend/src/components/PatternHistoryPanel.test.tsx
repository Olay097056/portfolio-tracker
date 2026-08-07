import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PatternHistoryPanel } from './PatternHistoryPanel';
import type { PatternHistoryState } from '../hooks/usePatternHistory';

describe('PatternHistoryPanel', () => {
  it('renders nothing while idle or loading', () => {
    const { container: idleContainer } = render(<PatternHistoryPanel state={{ status: 'idle' }} />);
    expect(idleContainer.querySelector('[data-testid="pattern-history"]')).not.toBeInTheDocument();

    const { container: loadingContainer } = render(<PatternHistoryPanel state={{ status: 'loading' }} />);
    expect(loadingContainer.querySelector('[data-testid="pattern-history"]')).not.toBeInTheDocument();
  });

  it('shows a not-enough-history message', () => {
    render(<PatternHistoryPanel state={{ status: 'not-enough-history' }} />);
    expect(screen.getByText(/ยังไม่มีข้อมูลราคาย้อนหลังพอ/)).toBeInTheDocument();
  });

  it('shows an error message', () => {
    render(<PatternHistoryPanel state={{ status: 'error', message: 'x' }} />);
    expect(screen.getByText(/ดึงข้อมูลสถิติย้อนหลังไม่สำเร็จ/)).toBeInTheDocument();
  });

  it('shows count-only when win_rate is null (below minimum sample)', () => {
    const state: PatternHistoryState = {
      status: 'success',
      result: {
        ticker: 'NEWCO',
        signal_type: 'BULLISH',
        total_matches: 3,
        resolved_count: 3,
        win_count: 2,
        loss_count: 1,
        win_rate: null,
        avg_win_pct: 5,
        avg_loss_pct: -3,
        conflict_matches: null,
      },
    };
    render(<PatternHistoryPanel state={state} />);
    expect(screen.getByText(/เจอสถานการณ์แบบนี้มาก่อน 3 ครั้ง/)).toBeInTheDocument();
    expect(screen.getByText(/ยังสะสมข้อมูลไม่พอจะสรุปเป็น % ได้/)).toBeInTheDocument();
  });

  it('shows full stats with win rate when enough samples exist', () => {
    const state: PatternHistoryState = {
      status: 'success',
      result: {
        ticker: 'NVDA',
        signal_type: 'BULLISH',
        total_matches: 12,
        resolved_count: 12,
        win_count: 7,
        loss_count: 5,
        win_rate: 7 / 12,
        avg_win_pct: 8.2,
        avg_loss_pct: -4.1,
        conflict_matches: 3,
      },
    };
    render(<PatternHistoryPanel state={state} />);
    expect(screen.getByText(/เจอสถานการณ์แบบนี้มาก่อน 12 ครั้ง/)).toBeInTheDocument();
    expect(screen.getByText(/ชนะ 7 ครั้ง/)).toBeInTheDocument();
    expect(screen.getByText(/แพ้ 5/)).toBeInTheDocument();
    expect(screen.getByText(/ชนะ 58%/)).toBeInTheDocument();
    expect(screen.getByText(/3 ครั้งมีสัญญาณขัดแย้ง/)).toBeInTheDocument();
  });

  it('omits the conflict line when conflict_matches is null', () => {
    const state: PatternHistoryState = {
      status: 'success',
      result: {
        ticker: 'NVDA',
        signal_type: 'BULLISH',
        total_matches: 12,
        resolved_count: 12,
        win_count: 7,
        loss_count: 5,
        win_rate: 7 / 12,
        avg_win_pct: 8.2,
        avg_loss_pct: -4.1,
        conflict_matches: null,
      },
    };
    render(<PatternHistoryPanel state={state} />);
    expect(screen.queryByText(/มีสัญญาณขัดแย้ง/)).not.toBeInTheDocument();
  });
});
