// frontend/src/components/PriceChart.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
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
          { id: null, price: 95, kind: 'support', strength: 3, source: 'auto' },
          { id: null, price: 110, kind: 'resistance', strength: 2, source: 'auto' },
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

  it('renders a freestyle zone in a color distinct from support and resistance, prefixed F', () => {
    const createPriceLine = vi.fn((_args: { color: string; title: string }) => ({}));
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn() });

    render(
      <PriceChart
        points={null}
        loading={false}
        error={null}
        zones={[{ id: 7, price: 102, kind: 'freestyle', strength: null, source: 'manual' }]}
      />,
    );

    expect(createPriceLine).toHaveBeenCalledTimes(1);
    const call = createPriceLine.mock.calls[0][0];
    expect(call.color).not.toBe('#14b8a6');
    expect(call.color).not.toBe('#f59e0b');
    expect(call.title).toBe('F');
  });

  it('omits the (n) suffix entirely for a zone with null strength, never rendering "(null)"', () => {
    const createPriceLine = vi.fn((_args: { title: string }) => ({}));
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn() });

    render(
      <PriceChart
        points={null}
        loading={false}
        error={null}
        zones={[
          { id: 1, price: 95, kind: 'support', strength: null, source: 'manual' },
          { id: 2, price: 110, kind: 'resistance', strength: null, source: 'manual' },
          { id: 3, price: 102, kind: 'freestyle', strength: null, source: 'manual' },
        ]}
      />,
    );

    const titles = createPriceLine.mock.calls.map((call) => call[0].title);
    for (const title of titles) {
      expect(title).not.toContain('(null)');
      expect(title).not.toContain('(');
    }
    expect(titles).toEqual(['S', 'R', 'F']);
  });

  it('still formats "S (n)" / "R (n)" for zones with a numeric strength (regression)', () => {
    const createPriceLine = vi.fn(() => ({}));
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn() });

    render(
      <PriceChart
        points={null}
        loading={false}
        error={null}
        zones={[
          { id: null, price: 95, kind: 'support', strength: 3, source: 'auto' },
          { id: null, price: 110, kind: 'resistance', strength: 2, source: 'auto' },
        ]}
      />,
    );

    expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 95, title: 'S (3)' }));
    expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 110, title: 'R (2)' }));
  });

  it('removes stale price lines before drawing new ones when zones change', () => {
    const removePriceLine = vi.fn();
    const firstLine = { id: 'first' };
    const createPriceLine = vi.fn().mockReturnValueOnce(firstLine).mockReturnValue({ id: 'second' });
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine });

    const { rerender } = render(
      <PriceChart points={null} loading={false} error={null} zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]} />,
    );
    expect(createPriceLine).toHaveBeenCalledTimes(1);

    rerender(
      <PriceChart points={null} loading={false} error={null} zones={[{ id: null, price: 96, kind: 'support', strength: 4, source: 'auto' }]} />,
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
      <PriceChart points={null} loading={false} error={null} zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]} />,
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

  describe('drag interaction', () => {
    it("starts a drag on mousedown within tolerance of a zone's line, and repositions that zone's price line live via applyOptions on mousemove", () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });

      render(
        <PriceChart
          points={null}
          loading={false}
          error={null}
          zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]}
        />,
      );

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });

      expect(priceLine.applyOptions).toHaveBeenCalledWith({ price: 160 });
    });

    it('ignores a mousedown that is not within tolerance of any zone line', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn(() => 50);
      const coordinateToPrice = vi.fn(() => 999);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });

      render(
        <PriceChart
          points={null}
          loading={false}
          error={null}
          zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]}
        />,
      );

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 200 });
      fireEvent.mouseMove(window, { clientY: 190 });

      expect(priceLine.applyOptions).not.toHaveBeenCalled();
    });

    it('commits the final price via onZoneDragEnd exactly once on mouseup', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });
      const onZoneDragEnd = vi.fn();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      render(<PriceChart points={null} loading={false} error={null} zones={[zone]} onZoneDragEnd={onZoneDragEnd} />);

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });
      fireEvent.mouseUp(window, { clientY: 30 });

      expect(onZoneDragEnd).toHaveBeenCalledTimes(1);
      expect(onZoneDragEnd).toHaveBeenCalledWith(zone, 170);
    });

    it('calls onZoneDragMove on every mousemove while dragging, with the live price', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });
      const onZoneDragMove = vi.fn();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      render(<PriceChart points={null} loading={false} error={null} zones={[zone]} onZoneDragMove={onZoneDragMove} />);

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });
      fireEvent.mouseMove(window, { clientY: 35 });

      expect(onZoneDragMove).toHaveBeenNthCalledWith(1, zone, 160);
      expect(onZoneDragMove).toHaveBeenNthCalledWith(2, zone, 165);
    });

    it('does not start a drag when disabled is true', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });
      const onZoneDragEnd = vi.fn();

      render(
        <PriceChart
          points={null}
          loading={false}
          error={null}
          zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]}
          onZoneDragEnd={onZoneDragEnd}
          disabled
        />,
      );

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });
      fireEvent.mouseUp(window, { clientY: 40 });

      expect(priceLine.applyOptions).not.toHaveBeenCalled();
      expect(onZoneDragEnd).not.toHaveBeenCalled();
    });

    it('removes its window mouse listeners on unmount', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      const { unmount } = render(<PriceChart points={null} loading={false} error={null} zones={[zone]} />);
      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });

      unmount();
      fireEvent.mouseMove(window, { clientY: 30 });

      expect(priceLine.applyOptions).not.toHaveBeenCalled();
    });
  });
});
