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
    render(<PriceChart points={null} loading={false} error={null} />);

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
      />,
    );

    expect(setData).toHaveBeenCalledWith([
      { time: '2026-01-02', value: 100 },
      { time: '2026-01-05', value: 101.5 },
    ]);
  });

  it('does not call setData when points is null', () => {
    render(<PriceChart points={null} loading={false} error={null} />);

    expect(setData).not.toHaveBeenCalled();
  });

  it('shows a loading status while loading', () => {
    render(<PriceChart points={null} loading={true} error={null} />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('shows an error message when error is set', () => {
    render(<PriceChart points={null} loading={false} error="No chart data available for BADTICKER." />);

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
      />,
    );

    expect(setData).toHaveBeenCalledWith([
      { time: 1735808400, value: 100 },
      { time: 1735808700, value: 101.5 },
    ]);
  });

  it('removes the chart on unmount', () => {
    const { unmount } = render(<PriceChart points={null} loading={false} error={null} />);

    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
