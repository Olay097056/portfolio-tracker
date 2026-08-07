// frontend/src/components/PriceChart.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceChart } from './PriceChart';

// Mock lightweight-charts with CandlestickSeries, HistogramSeries, LineSeries, and ColorType
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(),
  CandlestickSeries: 'candlestick-series-definition',
  HistogramSeries: 'histogram-series-definition',
  LineSeries: 'line-series-definition',
  ColorType: { Solid: 'solid' },
}));

// Helper: build a mock OHLCV point
function ohlcv(time: string | number, close: number) {
  return { time, open: close * 0.995, high: close * 1.01, low: close * 0.99, close, volume: 1000000 };
}

describe('PriceChart', () => {
  let setData: ReturnType<typeof vi.fn>;
  let createPriceLine: ReturnType<typeof vi.fn>;
  let removePriceLine: ReturnType<typeof vi.fn>;
  let priceToCoordinate: ReturnType<typeof vi.fn>;
  let coordinateToPrice: ReturnType<typeof vi.fn>;
  let addSeries: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let priceScale: ReturnType<typeof vi.fn>;
  let timeScale: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setData = vi.fn();
    createPriceLine = vi.fn(() => ({ applyOptions: vi.fn() }));
    removePriceLine = vi.fn();
    priceToCoordinate = vi.fn(() => null);
    coordinateToPrice = vi.fn(() => null);

    // Each addSeries call returns a series mock. The first call is CandlestickSeries,
    // subsequent ones are volume/BB line series.
    addSeries = vi.fn(() => ({
      setData,
      createPriceLine,
      removePriceLine,
      priceToCoordinate,
      coordinateToPrice,
      applyOptions: vi.fn(),
    }));
    remove = vi.fn();
    priceScale = vi.fn(() => ({ applyOptions: vi.fn() }));
    timeScale = vi.fn(() => ({ fitContent: vi.fn() }));

    vi.mocked(createChart).mockReturnValue({
      addSeries,
      remove,
      priceScale,
      timeScale,
      resize: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a chart with multiple series on mount (candlestick + volume + BB)', () => {
    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(createChart).toHaveBeenCalledTimes(1);
    // candlestick + volume histogram + 3 BB lines = 5 series
    expect(addSeries).toHaveBeenCalledTimes(5);
  });

  it('resolves the chart background/text/grid colors from the current theme CSS variables at creation time, not literal var() strings', () => {
    document.documentElement.style.setProperty('--card-bg', '#123456');
    document.documentElement.style.setProperty('--text', '#abcdef');
    document.documentElement.style.setProperty('--border', 'rgba(1, 2, 3, 0.5)');

    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(createChart).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        layout: expect.objectContaining({
          background: { type: 'solid', color: '#123456' },
          textColor: '#abcdef',
        }),
      }),
    );

    document.documentElement.style.removeProperty('--card-bg');
    document.documentElement.style.removeProperty('--text');
    document.documentElement.style.removeProperty('--border');
  });

  it('falls back to hardcoded default colors when the theme CSS variables are unset', () => {
    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(createChart).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        layout: expect.objectContaining({
          background: { type: 'solid', color: '#13192b' },
          textColor: '#e2e8f0',
        }),
      }),
    );
  });

  it('calls setData with OHLC data when points are provided', () => {
    render(
      <PriceChart
        points={[ohlcv('2026-01-02', 100), ohlcv('2026-01-05', 101.5)]}
        loading={false}
        error={null}
        zones={[]}
      />,
    );

    // First addSeries call is CandlestickSeries — its setData should be called with OHLC shape
    const candleSetData = addSeries.mock.results[0].value.setData;
    expect(candleSetData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ time: '2026-01-02', open: expect.any(Number), high: expect.any(Number), low: expect.any(Number), close: 100 }),
        expect.objectContaining({ time: '2026-01-05', close: 101.5 }),
      ]),
    );
  });

  it('does not call setData when points is null', () => {
    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);
    // None of the series should have had setData called
    for (const result of addSeries.mock.results) {
      expect(result.value.setData).not.toHaveBeenCalled();
    }
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
        points={[ohlcv(1735808400, 100), ohlcv(1735808700, 101.5)]}
        loading={false}
        error={null}
        zones={[]}
      />,
    );

    const candleSetData = addSeries.mock.results[0].value.setData;
    expect(candleSetData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ time: 1735808400, close: 100 }),
        expect.objectContaining({ time: 1735808700, close: 101.5 }),
      ]),
    );
  });

  it('removes the chart on unmount', () => {
    const { unmount } = render(<PriceChart points={null} loading={false} error={null} zones={[]} />);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('creates a price line for each zone with the right price, kind-based color, and title', () => {
    const pl1 = { applyOptions: vi.fn() };
    const pl2 = { applyOptions: vi.fn() };
    let lineCount = 0;
    createPriceLine = vi.fn(() => (lineCount++ === 0 ? pl1 : pl2));
    addSeries = vi.fn(() => ({
      setData,
      createPriceLine,
      removePriceLine,
      priceToCoordinate,
      coordinateToPrice,
    }));
    vi.mocked(createChart).mockReturnValue({ addSeries, remove, priceScale, timeScale, resize: vi.fn() } as unknown as ReturnType<typeof createChart>);

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
    expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 95, color: '#14b8a6', title: 'S (3)' }));
    expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 110, color: '#f59e0b', title: 'R (2)' }));
  });

  it('renders a freestyle zone in a color distinct from support and resistance, prefixed F', () => {
    createPriceLine = vi.fn((_args: { color: string; title: string }) => ({ applyOptions: vi.fn() }));
    addSeries = vi.fn(() => ({ setData, createPriceLine, removePriceLine, priceToCoordinate, coordinateToPrice }));
    vi.mocked(createChart).mockReturnValue({ addSeries, remove, priceScale, timeScale, resize: vi.fn() } as unknown as ReturnType<typeof createChart>);

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
    createPriceLine = vi.fn((_args: { title: string }) => ({ applyOptions: vi.fn() }));
    addSeries = vi.fn(() => ({ setData, createPriceLine, removePriceLine, priceToCoordinate, coordinateToPrice }));
    vi.mocked(createChart).mockReturnValue({ addSeries, remove, priceScale, timeScale, resize: vi.fn() } as unknown as ReturnType<typeof createChart>);

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
    createPriceLine = vi.fn(() => ({ applyOptions: vi.fn() }));
    addSeries = vi.fn(() => ({ setData, createPriceLine, removePriceLine, priceToCoordinate, coordinateToPrice }));
    vi.mocked(createChart).mockReturnValue({ addSeries, remove, priceScale, timeScale, resize: vi.fn() } as unknown as ReturnType<typeof createChart>);

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
    const firstLine = { applyOptions: vi.fn() };
    removePriceLine = vi.fn();
    createPriceLine = vi.fn().mockReturnValueOnce(firstLine).mockReturnValue({ applyOptions: vi.fn() });
    addSeries = vi.fn(() => ({ setData, createPriceLine, removePriceLine, priceToCoordinate, coordinateToPrice }));
    vi.mocked(createChart).mockReturnValue({ addSeries, remove, priceScale, timeScale, resize: vi.fn() } as unknown as ReturnType<typeof createChart>);

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
    const firstLine = { applyOptions: vi.fn() };
    removePriceLine = vi.fn();
    createPriceLine = vi.fn().mockReturnValueOnce(firstLine);
    addSeries = vi.fn(() => ({ setData, createPriceLine, removePriceLine, priceToCoordinate, coordinateToPrice }));
    vi.mocked(createChart).mockReturnValue({ addSeries, remove, priceScale, timeScale, resize: vi.fn() } as unknown as ReturnType<typeof createChart>);

    const { rerender } = render(
      <PriceChart points={null} loading={false} error={null} zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]} />,
    );
    expect(createPriceLine).toHaveBeenCalledTimes(1);

    rerender(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(removePriceLine).toHaveBeenCalledWith(firstLine);
    expect(createPriceLine).toHaveBeenCalledTimes(1);
  });

  it('does not create any price lines when zones is empty', () => {
    createPriceLine = vi.fn(() => ({ applyOptions: vi.fn() }));
    addSeries = vi.fn(() => ({ setData, createPriceLine, removePriceLine, priceToCoordinate, coordinateToPrice }));
    vi.mocked(createChart).mockReturnValue({ addSeries, remove, priceScale, timeScale, resize: vi.fn() } as unknown as ReturnType<typeof createChart>);

    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);
    expect(createPriceLine).not.toHaveBeenCalled();
  });

  describe('drag interaction', () => {
    function makeDragSetup(zonePrice = 95) {
      const priceLine = { applyOptions: vi.fn() };
      const pl = vi.fn(() => priceLine);
      const ptc = vi.fn((p: number) => (p === zonePrice ? 50 : null));
      const ctp = vi.fn((y: number) => 200 - y);
      const rpl = vi.fn();
      addSeries = vi.fn(() => ({
        setData: vi.fn(),
        createPriceLine: pl,
        removePriceLine: rpl,
        priceToCoordinate: ptc,
        coordinateToPrice: ctp,
      }));
      vi.mocked(createChart).mockReturnValue({ addSeries, remove, priceScale, timeScale, resize: vi.fn() } as unknown as ReturnType<typeof createChart>);
      return { priceLine, createPriceLine: pl, priceToCoordinate: ptc, coordinateToPrice: ctp };
    }

    it("starts a drag on mousedown within tolerance of a zone's line, and repositions that zone's price line live via applyOptions on mousemove", () => {
      const { priceLine } = makeDragSetup();
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
      const { priceLine } = makeDragSetup();
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
      const { priceLine } = makeDragSetup();
      const onZoneDragEnd = vi.fn();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      render(<PriceChart points={null} loading={false} error={null} zones={[zone]} onZoneDragEnd={onZoneDragEnd} />);

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });
      fireEvent.mouseUp(window, { clientY: 30 });

      expect(onZoneDragEnd).toHaveBeenCalledTimes(1);
      expect(onZoneDragEnd).toHaveBeenCalledWith(zone, 170);
      expect(priceLine.applyOptions).toHaveBeenCalled();
    });

    it('calls onZoneDragMove on every mousemove while dragging, with the live price', () => {
      makeDragSetup();
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
      const { priceLine } = makeDragSetup();
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

    it("resets the price line to the zone's original price on mouseup, after the live-drag applyOptions calls, regardless of whether the commit succeeds", () => {
      const { priceLine } = makeDragSetup();
      const onZoneDragEnd = vi.fn();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      render(<PriceChart points={null} loading={false} error={null} zones={[zone]} onZoneDragEnd={onZoneDragEnd} />);

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });
      fireEvent.mouseUp(window, { clientY: 30 });

      const calls = priceLine.applyOptions.mock.calls;
      expect(calls[0]).toEqual([{ price: 160 }]);
      expect(calls[calls.length - 1]).toEqual([{ price: 95 }]);
      expect(onZoneDragEnd).toHaveBeenCalledWith(zone, 170);
    });

    it('removes its window mouse listeners on unmount', () => {
      const { priceLine } = makeDragSetup();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      const { unmount } = render(<PriceChart points={null} loading={false} error={null} zones={[zone]} />);
      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });

      unmount();
      fireEvent.mouseMove(window, { clientY: 30 });

      expect(priceLine.applyOptions).not.toHaveBeenCalled();
    });

    it('calls preventDefault and stopPropagation on mousedown when a zone line is hit, to suppress the chart panning/scaling underneath the drag', () => {
      makeDragSetup();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      render(<PriceChart points={null} loading={false} error={null} zones={[zone]} />);

      const container = screen.getByTestId('price-chart');
      const rect = container.getBoundingClientRect();
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY: rect.top + 50 });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      container.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
      expect(stopPropagationSpy).toHaveBeenCalledTimes(1);
    });

    it('does not call preventDefault or stopPropagation on mousedown when no zone line is hit, so ordinary chart panning/zooming is unaffected', () => {
      makeDragSetup();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      render(<PriceChart points={null} loading={false} error={null} zones={[zone]} />);

      const container = screen.getByTestId('price-chart');
      const rect = container.getBoundingClientRect();
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY: rect.top + 200 });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      container.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(stopPropagationSpy).not.toHaveBeenCalled();
    });
  });
});
