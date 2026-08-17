import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EquityChart, NextTurnCountdown } from './TradeDeskCharts';
import * as client from '../../api/client';

vi.mock('../../api/client', () => ({
  getTeamEquity: vi.fn(),
  getTradeDeskState: vi.fn(),
  getHyperliquidMarkets: vi.fn(),
  triggerTradeDeskTurn: vi.fn(),
  setTeamDirective: vi.fn(),
}));

describe('EquityChart (11.4)', () => {
  it('renders SVG chart when 2+ points', async () => {
    vi.mocked(client.getTeamEquity).mockResolvedValue({
      points: [
        { date: '2026-08-10', equity: 10000 },
        { date: '2026-08-11', equity: 10300 },
        { date: '2026-08-12', equity: 10800 },
      ],
    } as never);
    render(<EquityChart teamCode="DEEPSEEK" />);
    await waitFor(() => expect(screen.getByTestId('equity-chart')).toBeTruthy());
    // % mode shows +8.00%
    expect(screen.getByText(/\+8\.00%/)).toBeTruthy();
    // SVG <polygon>/<polyline> points must be bare coordinate pairs — path
    // commands (M/L) are illegal there and React logs "Expected number".
    for (const el of Array.from(document.querySelectorAll('polygon, polyline'))) {
      const pts = el.getAttribute('points') ?? '';
      expect(pts).toMatch(/^[\d.,\s]+$/);
      expect(pts).not.toMatch(/[MLml]/);
    }
  });

  it('shows empty state — no fake chart when <2 points', async () => {
    vi.mocked(client.getTeamEquity).mockResolvedValue({ points: [{ date: '2026-08-12', equity: 10000 }] } as never);
    render(<EquityChart teamCode="DEEPSEEK" />);
    await waitFor(() => expect(screen.getByTestId('equity-empty')).toBeTruthy());
    expect(screen.queryByTestId('equity-chart')).toBeNull();
  });

  it('switches mode % ↔ $', async () => {
    vi.mocked(client.getTeamEquity).mockResolvedValue({
      points: [
        { date: '2026-08-10', equity: 10000 },
        { date: '2026-08-12', equity: 10800 },
      ],
    } as never);
    render(<EquityChart teamCode="DEEPSEEK" />);
    await waitFor(() => expect(screen.getByTestId('equity-chart')).toBeTruthy());
    fireEvent.click(screen.getByText('$ equity'));
    expect(screen.getByText(/\$800\.00/)).toBeTruthy();
  });
});

describe('NextTurnCountdown (11.6)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows countdown HH:MM:SS when future time', () => {
    const future = new Date(Date.now() + 3 * 3600000 + 5 * 60000 + 10 * 1000).toISOString();
    render(<NextTurnCountdown nextTurnAt={future} />);
    expect(screen.getByTestId('next-turn-countdown')).toBeTruthy();
    expect(screen.getByText(/03:05:10/)).toBeTruthy();
  });

  it('shows ถึงกำหนดแล้ว when past time (no negative numbers)', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    render(<NextTurnCountdown nextTurnAt={past} />);
    expect(screen.getByText(/ถึงกำหนดแล้ว/)).toBeTruthy();
    expect(screen.queryByText(/-/)).toBeNull();
  });

  it('shows — when null', () => {
    render(<NextTurnCountdown nextTurnAt={null} />);
    expect(screen.getByText(/เทิร์นถัดไป: —/)).toBeTruthy();
  });
});
