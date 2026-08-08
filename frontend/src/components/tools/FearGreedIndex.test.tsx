import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as client from '../../api/client';
import type { FearGreed } from '../../api/types';
import { FearGreedIndex, colorForScore, bandLabelForScore } from './FearGreedIndex';

function makeData(overrides: Partial<FearGreed> = {}): FearGreed {
  return {
    score: 63.7,
    rating: 'greed',
    updated_at: '2026-08-07T23:59:47+00:00',
    previous_close: 59.7,
    previous_1_week: 45.2,
    previous_1_month: 39.8,
    previous_1_year: 54.7,
    history: [
      { t: 1754611200000, value: 58.4 },
      { t: 1786147187000, value: 63.7 },
    ],
    indicators: [
      {
        key: 'market_momentum',
        label: 'Market Momentum (S&P 500 vs 125-day avg)',
        score: 79.8,
        rating: 'extreme greed',
        latest_value: 7757.64,
        series: [
          { t: 1, value: 7700 },
          { t: 2, value: 7757.64 },
        ],
      },
      {
        key: 'market_volatility',
        label: 'Market Volatility (VIX vs 50-day avg)',
        score: 50.0,
        rating: 'neutral',
        latest_value: 14.9,
        series: [
          { t: 1, value: 15.2 },
          { t: 2, value: 14.9 },
        ],
      },
    ],
    source: 'cnn',
    ...overrides,
  };
}

describe('band helpers', () => {
  it('maps scores to CNN\'s bands', () => {
    expect(bandLabelForScore(10)).toBe('Extreme Fear');
    expect(bandLabelForScore(30)).toBe('Fear');
    expect(bandLabelForScore(50)).toBe('Neutral');
    expect(bandLabelForScore(63.7)).toBe('Greed');
    expect(bandLabelForScore(90)).toBe('Extreme Greed');
  });

  it('gives fear and greed visibly different colours', () => {
    expect(colorForScore(10)).not.toBe(colorForScore(90));
  });
});

describe('FearGreedIndex', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the score, rating and gauge once loaded', async () => {
    vi.spyOn(client, 'getFearGreed').mockResolvedValue(makeData());

    render(<FearGreedIndex />);

    await waitFor(() => expect(screen.getByText('64')).toBeInTheDocument());
    expect(screen.getAllByText(/Greed/).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Fear and Greed score 64 out of 100, greed/ })).toBeInTheDocument();
  });

  it('renders a card per component indicator with its own raw latest value', async () => {
    vi.spyOn(client, 'getFearGreed').mockResolvedValue(makeData());

    render(<FearGreedIndex />);

    await waitFor(() => expect(screen.getByText(/Market Momentum/)).toBeInTheDocument());
    expect(screen.getByText(/Market Volatility/)).toBeInTheDocument();
    // The raw reading, not the 0-100 score -- they are different quantities.
    expect(screen.getByText('7,757.64')).toBeInTheDocument();
    expect(screen.getByText('14.9')).toBeInTheDocument();
  });

  it('shows the four historical comparison points when CNN supplies them', async () => {
    vi.spyOn(client, 'getFearGreed').mockResolvedValue(makeData());

    render(<FearGreedIndex />);

    await waitFor(() => expect(screen.getByText('ปิดครั้งก่อน')).toBeInTheDocument());
    expect(screen.getByText('60')).toBeInTheDocument(); // previous close 59.7
    expect(screen.getByText('45')).toBeInTheDocument(); // 1 week
    expect(screen.getByText('40')).toBeInTheDocument(); // 1 month
  });

  it('labels the source as CNN when the index came from CNN', async () => {
    vi.spyOn(client, 'getFearGreed').mockResolvedValue(makeData());

    render(<FearGreedIndex />);

    await waitFor(() => expect(screen.getByText('ข้อมูลจาก CNN')).toBeInTheDocument());
    expect(screen.queryByText(/ดัชนีสำรองที่แอปนี้คำนวณเอง/)).not.toBeInTheDocument();
  });

  it('warns clearly that the fallback score is a different index, not CNN\'s', async () => {
    vi.spyOn(client, 'getFearGreed').mockResolvedValue(
      makeData({
        source: 'computed',
        score: 71.2,
        previous_close: null,
        previous_1_week: null,
        previous_1_month: null,
        previous_1_year: null,
        history: [],
      })
    );

    render(<FearGreedIndex />);

    await waitFor(() => expect(screen.getByText('คำนวณสำรองโดยแอปนี้')).toBeInTheDocument());
    expect(screen.getByText(/คะแนนจะไม่ตรงกับของ CNN/)).toBeInTheDocument();
    // No comparison cards on this source -- they'd be fabricated.
    expect(screen.queryByText('ปิดครั้งก่อน')).not.toBeInTheDocument();
  });

  it('surfaces an error instead of a blank gauge when the API fails', async () => {
    vi.spyOn(client, 'getFearGreed').mockRejectedValue(new Error('503'));

    render(<FearGreedIndex />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/ไม่สามารถดึงข้อมูล/));
  });

  it('omits the history chart when there is no history to plot', async () => {
    vi.spyOn(client, 'getFearGreed').mockResolvedValue(makeData({ history: [] }));

    render(<FearGreedIndex />);

    await waitFor(() => expect(screen.getByText('64')).toBeInTheDocument());
    expect(screen.queryByRole('img', { name: /over the past year/ })).not.toBeInTheDocument();
  });
});
