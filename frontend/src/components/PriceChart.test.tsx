// frontend/src/components/PriceChart.test.tsx
import { render, screen } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceChart } from './PriceChart';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(),
  LineSeries: 'line-series-definition',
}));

describe('PriceChart', () => {
  let setData: ReturnType<typeof vi.fn>;
  let addSeries: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setData = vi.fn();
    addSeries = vi.fn(() => ({ setData }));
    remove = vi.fn();
    vi.mocked(createChart).mockReturnValue({ addSeries, remove } as unknown as ReturnType<typeof createChart>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a chart with a single line series on mount', () => {
    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(createChart).toHaveBeenCalledTimes(1);
    expect(addSeries).toHaveBeenCalledTimes(1);
  });

  it('calls setData with close mapped to value when points are provided', () => {
    render(
      <PriceChart
        points={[
          { time: '2026-01-02', close: 100 },
          { time: '2026-01-05', close: 101.5 },
        ]}
        loading={false}
        error={null}
        zones={[]}
      />,
    );

    expect(setData).toHaveBeenCalledWith([
      { time: '2026-01-02', value: 100 },
      { time: '2026-01-05', value: 101.5 },
    ]);
  });

  it('does not call setData when points is null', () => {
    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(setData).not.toHaveBeenCalled();
  });

  it('shows a loading status while loading', () => {
    render(<PriceChart points={null} loading={true} error={null} zones={[]} />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('shows an error message when error is set', () => {
    render(<PriceChart points={null} loading={false} error="No chart data available for BADTICKER." zones={[]} />);

    expect(screen.getByRole('alert')).toHaveTextContent('No chart data available for BADTICKER.');
  });

  it('passes a numeric time through to setData for intraday points', () => {
    render(
      <PriceChart
        points={[
          { time: 1735808400, close: 100 },
          { time: 1735808700, close: 101.5 },
        ]}
        loading={false}
        error={null}
        zones={[]}
      />,
    );

    expect(setData).toHaveBeenCalledWith([
      { time: 1735808400, value: 100 },
      { time: 1735808700, value: 101.5 },
    ]);
  });

  it('removes the chart on unmount', () => {
    const { unmount } = render(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('creates a price line for each zone with the right price, kind-based color, and title', () => {
    const createPriceLine = vi.fn(() => ({}));
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn() });

    render(
      <PriceChart
        points={null}
        loading={false}
        error={null}
        zones={[
          { price: 95, kind: 'support', strength: 3, source: 'auto' },
          { price: 110, kind: 'resistance', strength: 2, source: 'auto' },
        ]}
      />,
    );

    expect(createPriceLine).toHaveBeenCalledTimes(2);
    expect(createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({ price: 95, color: '#14b8a6', title: 'S (3)' }),
    );
    expect(createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({ price: 110, color: '#f59e0b', title: 'R (2)' }),
    );
  });

  it('removes stale price lines before drawing new ones when zones change', () => {
    const removePriceLine = vi.fn();
    const firstLine = { id: 'first' };
    const createPriceLine = vi.fn().mockReturnValueOnce(firstLine).mockReturnValue({ id: 'second' });
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine });

    const { rerender } = render(
      <PriceChart points={null} loading={false} error={null} zones={[{ price: 95, kind: 'support', strength: 3, source: 'auto' }]} />,
    );
    expect(createPriceLine).toHaveBeenCalledTimes(1);

    rerender(
      <PriceChart points={null} loading={false} error={null} zones={[{ price: 96, kind: 'support', strength: 4, source: 'auto' }]} />,
    );

    expect(removePriceLine).toHaveBeenCalledWith(firstLine);
    expect(createPriceLine).toHaveBeenCalledTimes(2);
  });

  it('removes existing price lines and creates no new ones when zones goes from non-empty to empty', () => {
    const removePriceLine = vi.fn();
    const firstLine = { id: 'first' };
    const createPriceLine = vi.fn().mockReturnValueOnce(firstLine);
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine });

    const { rerender } = render(
      <PriceChart points={null} loading={false} error={null} zones={[{ price: 95, kind: 'support', strength: 3, source: 'auto' }]} />,
    );
    expect(createPriceLine).toHaveBeenCalledTimes(1);

    rerender(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(removePriceLine).toHaveBeenCalledWith(firstLine);
    expect(createPriceLine).toHaveBeenCalledTimes(1);
  });

  it('does not create any price lines when zones is empty', () => {
    const createPriceLine = vi.fn();
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn() });

    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(createPriceLine).not.toHaveBeenCalled();
  });
});
