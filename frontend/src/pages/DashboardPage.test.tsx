// frontend/src/pages/DashboardPage.test.tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DashboardPage } from './DashboardPage';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(),
  CandlestickSeries: 'candlestick-series-definition',
  HistogramSeries: 'histogram-series-definition',
  LineSeries: 'line-series-definition',
  ColorType: { Solid: 'solid' },
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
      remove: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
      timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
      resize: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a ticker dropdown with none selected, listing the deduplicated union of holdings and watchlist tickers', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([
      { id: 1, name: 'Core', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'listHoldings').mockResolvedValue([
      {
        id: 1,
        portfolio_id: 1,
        ticker: 'VTI',
        shares: 1,
        avg_cost_usd: 1,
        target_allocation_pct: null,
        realized_pnl_usd: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/ticker/i)).toHaveValue('');
    expect(screen.getByRole('option', { name: 'VTI' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'AAPL' })).toBeInTheDocument();
  });

  it('issues no chart request until a ticker is selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    const getChartDataSpy = vi.spyOn(client, 'getChartData');

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(getChartDataSpy).not.toHaveBeenCalled();
  });

  it('fetches and renders the chart for the ticker once selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '1Y'));
  });

  it('remounts the chart (fresh createChart, old instance removed) when the selected ticker changes', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'MSFT', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] });

    const firstRemove = vi.fn();
    const secondRemove = vi.fn();
    vi.mocked(createChart)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
        remove: firstRemove,
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        resize: vi.fn(),
      } as unknown as ReturnType<typeof createChart>)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
        remove: secondRemove,
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        resize: vi.fn(),
      } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'MSFT' } });

    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(2));
    expect(firstRemove).toHaveBeenCalledTimes(1);
  });

  it('never draws the outgoing ticker stale data onto the freshly-remounted chart when the new ticker fetch fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'MSFT', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] })
      .mockRejectedValueOnce(new client.ApiError(502, 'upstream error'));

    const firstSetData = vi.fn();
    const secondSetData = vi.fn();
    vi.mocked(createChart)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: firstSetData, createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
        remove: vi.fn(),
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        resize: vi.fn(),
      } as unknown as ReturnType<typeof createChart>)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: secondSetData, createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
        remove: vi.fn(),
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        resize: vi.fn(),
      } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() =>
      expect(firstSetData).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ time: '2026-01-02', close: 100 })]),
      ),
    );

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'MSFT' } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('upstream error'));
    // The new (second) chart instance must never have been fed AAPL's stale data — the failed
    // MSFT fetch means it should never be called with data at all.
    expect(secondSetData).not.toHaveBeenCalled();
  });

  it('shows a range button row once a ticker is selected, defaulting to 1 year', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(screen.queryByRole('group', { name: /range/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(screen.getByRole('group', { name: /range/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '1 year' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '5 years' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('refetches with the new range when a range button is clicked', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '1Y'));

    fireEvent.click(screen.getByRole('button', { name: '5 years' }));

    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '5Y'));
    expect(screen.getByRole('button', { name: '5 years' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1 year' })).toHaveAttribute('aria-pressed', 'false');
  });

  // Paired with the 'never draws the previous range stale data' test below — this one proves the
  // key/remount half of the range-change fix (that changing range alone produces a fresh chart
  // instance), that one proves the points-reset half (that the fresh instance never gets fed the
  // outgoing range's stale data). Neither test alone proves both halves are correct: if the
  // points-reset half regressed, this test would still pass since it only checks that remounting
  // happens, not what data the new instance receives.
  it('remounts the chart when only the range changes for the same ticker', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] });

    const firstRemove = vi.fn();
    const secondRemove = vi.fn();
    vi.mocked(createChart)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
        remove: firstRemove,
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        resize: vi.fn(),
      } as unknown as ReturnType<typeof createChart>)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
        remove: secondRemove,
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        resize: vi.fn(),
      } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '5 years' }));

    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(2));
    expect(firstRemove).toHaveBeenCalledTimes(1);
  });

  // Paired with the 'remounts the chart when only the range changes' test above — this one proves
  // the points-reset half of the range-change fix, that one proves the key/remount half. This test
  // would pass vacuously (with no real coverage) if only the key/remount half were reverted: a
  // chart that never remounts also never gets a second chart instance for the
  // `secondSetData.not.toHaveBeenCalled()` assertion below to check.
  it('never draws the previous range stale data onto the freshly-remounted chart when the new range fetch fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] })
      .mockRejectedValueOnce(new client.ApiError(502, 'upstream error'));

    const firstSetData = vi.fn();
    const secondSetData = vi.fn();
    vi.mocked(createChart)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: firstSetData, createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
        remove: vi.fn(),
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        resize: vi.fn(),
      } as unknown as ReturnType<typeof createChart>)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: secondSetData, createPriceLine: vi.fn(), removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
        remove: vi.fn(),
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        resize: vi.fn(),
      } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(firstSetData).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ time: '2026-01-02', close: 100 })])
    ));

    fireEvent.click(screen.getByRole('button', { name: '5 years' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('upstream error'));
    expect(secondSetData).not.toHaveBeenCalled();
  });

  it('shows a message instead of a dropdown when there are no tickers anywhere', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/no tickers to chart/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/ticker/i)).not.toBeInTheDocument();
  });

  it('shows an alert instead of the empty-state message when the ticker list fails to load', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockRejectedValue(new Error('backend is down'));

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('backend is down'));
    expect(screen.queryByText(/no tickers to chart/i)).not.toBeInTheDocument();
  });

  it('passes zones from the fetch through to the chart', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    const createPriceLine = vi.fn();
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() })),
      remove: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
      timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
      resize: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }],
      zones: [{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }],
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 95 })));
  });

  it('shows S, R, and Freestyle buttons and a zone list once a ticker is selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^r$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /freestyle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recompute defaults/i })).toBeInTheDocument();
    expect(screen.getByText(/no support\/resistance zones/i)).toBeInTheDocument();
  });

  it('clicking S adds a support zone at the last point\'s close price and refetches', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] })
      .mockResolvedValueOnce({
        points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }],
        zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
      });
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([
      { id: 1, price: 100, kind: 'support', strength: null, source: 'manual' },
    ]);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));

    await waitFor(() => expect(freezeSpy).toHaveBeenCalledWith('AAPL', '1Y', [{ kind: 'support', price: 100 }]));
    await waitFor(() => expect(client.getChartData).toHaveBeenCalledTimes(2));
  });

  it('Recompute defaults does nothing without confirmation and clears zones when confirmed', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }],
      zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
    });
    const deleteAllSpy = vi.spyOn(client, 'deleteAllZones').mockResolvedValue(undefined);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /recompute defaults/i })).toBeInTheDocument());

    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /recompute defaults/i }));
    expect(deleteAllSpy).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: /recompute defaults/i }));
    await waitFor(() => expect(deleteAllSpy).toHaveBeenCalledWith('AAPL', '1Y'));
  });

  it('disables the S/R/Freestyle/Recompute buttons while a zone mutation is in flight, then re-enables them', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] });
    let resolveFreeze: (value: client.Zone[]) => void;
    vi.spyOn(client, 'freezeZones').mockReturnValue(
      new Promise((resolve) => {
        resolveFreeze = resolve;
      }),
    );

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /^r$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /freestyle/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /recompute defaults/i })).toBeDisabled();
    expect(screen.getByText(/working/i)).toBeInTheDocument();

    resolveFreeze!([{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }]);

    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: /^r$/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /freestyle/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /recompute defaults/i })).not.toBeDisabled();
    expect(screen.queryByText(/working/i)).not.toBeInTheDocument();
  });

  it('a second click on S while the first is still in flight does not fire a second freeze call', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }], zones: [] });
    let resolveFreeze: (value: client.Zone[]) => void;
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockReturnValue(
      new Promise((resolve) => {
        resolveFreeze = resolve;
      }),
    );

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));

    await waitFor(() => expect(freezeSpy).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveFreeze!([{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }]);
      await Promise.resolve();
    });

    expect(freezeSpy).toHaveBeenCalledTimes(1);
  });

  it('deleting a zone from the list calls deleteZone and refetches', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }],
      zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
    });
    const deleteSpy = vi.spyOn(client, 'deleteZone').mockResolvedValue(undefined);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(1));
  });

  it('dragging a zone updates the zone list price live, then commits via dragZonePrice on mouseup', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }],
      zones: [{ id: 1, price: 95, kind: 'support', strength: null, source: 'manual' }],
    });
    const updateSpy = vi
      .spyOn(client, 'updateZone')
      .mockResolvedValue({ id: 1, price: 160, kind: 'support', strength: null, source: 'manual' });
    const priceLine = { applyOptions: vi.fn() };
    const createPriceLine = vi.fn(() => priceLine);
    const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
    const coordinateToPrice = vi.fn((y: number) => 200 - y);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice })),
      remove: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
      timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
      resize: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByLabelText('support zone price')).toBeInTheDocument());
    expect(screen.getByLabelText('support zone price')).toHaveValue(95);

    fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
    fireEvent.mouseMove(window, { clientY: 43 });

    expect(screen.getByLabelText('support zone price')).toHaveValue(157);

    fireEvent.mouseUp(window, { clientY: 40 });

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(1, 160));
  });

  it('disables chart dragging while a zone mutation is already in flight', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }],
      zones: [{ id: 1, price: 95, kind: 'support', strength: null, source: 'manual' }],
    });
    let resolveDelete: () => void;
    vi.spyOn(client, 'deleteZone').mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const updateSpy = vi.spyOn(client, 'updateZone');
    const priceLine = { applyOptions: vi.fn() };
    const createPriceLine = vi.fn(() => priceLine);
    const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
    const coordinateToPrice = vi.fn((y: number) => 200 - y);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice })),
      remove: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
      timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
      resize: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeDisabled());

    fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
    fireEvent.mouseUp(window, { clientY: 40 });

    expect(updateSpy).not.toHaveBeenCalled();

    resolveDelete!();
  });

  it('dragging an auto zone freezes the whole zone set with the dragged zone at its new price', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }],
      zones: [
        { id: null, price: 95, kind: 'support', strength: 3, source: 'auto' },
        { id: null, price: 110, kind: 'resistance', strength: 2, source: 'auto' },
      ],
    });
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([]);
    const priceLine = { applyOptions: vi.fn() };
    const createPriceLine = vi.fn(() => priceLine);
    const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : price === 110 ? 20 : null));
    const coordinateToPrice = vi.fn((y: number) => 200 - y);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice })),
      remove: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
      timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
      resize: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByTestId('price-chart')).toBeInTheDocument());
    await waitFor(() => expect(createPriceLine).toHaveBeenCalledTimes(2));

    fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
    fireEvent.mouseUp(window, { clientY: 40 });

    await waitFor(() =>
      expect(freezeSpy).toHaveBeenCalledWith('AAPL', '1Y', [
        { kind: 'support', price: 160 },
        { kind: 'resistance', price: 110 },
      ]),
    );
  });

  it('shows the current price and a signed, colored change readout computed from the last two points', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [
        { time: '2026-01-01', open: 100, high: 100, low: 100, close: 100, volume: 1000000 },
        { time: '2026-01-02', open: 105, high: 105, low: 105, close: 105, volume: 1000000 },
      ],
      zones: [],
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(screen.getByText('105.00')).toBeInTheDocument());
    const change = screen.getByText('+5.00 (+5.00%)');
    expect(change).toBeInTheDocument();
    expect(change).toHaveStyle({ color: 'var(--green)' });
  });

  it('shows a negative change in red when the price is down', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [
        { time: '2026-01-01', open: 100, high: 100, low: 100, close: 100, volume: 1000000 },
        { time: '2026-01-02', open: 95, high: 95, low: 95, close: 95, volume: 1000000 },
      ],
      zones: [],
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    const change = await screen.findByText('-5.00 (-5.00%)');
    expect(change).toHaveStyle({ color: 'var(--red)' });
  });

  it('omits the price change readout (rather than showing zero or fabricating one) when there is only one point', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000000 }],
      zones: [],
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(screen.getByRole('group', { name: /range/i })).toBeInTheDocument());
    expect(screen.queryByText(/%\)/)).not.toBeInTheDocument();
  });

  describe('AI Technical Signal UI Components in DashboardPage', () => {
    it('renders Confidence Score Bar and Rating Badge when a ticker is selected', async () => {
      vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
      vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000000 + i * 10000,
      }));
      vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones: [] });

      render(<DashboardPage />);
      await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

      await waitFor(() => expect(screen.getByText(/AI Technical Signal \(AAPL\)/i)).toBeInTheDocument());
      expect(screen.getByText(/Confidence Score/i)).toBeInTheDocument();
      expect(screen.getByText(/STRONG CONVICTION|BULLISH SETUP|NEUTRAL|WEAK|BEARISH/i)).toBeInTheDocument();
    });

    it('always shows an accuracy disclosure alongside the confidence score, not hidden behind a tooltip', async () => {
      vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
      vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000000 + i * 10000,
      }));
      vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones: [] });

      render(<DashboardPage />);
      await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

      await waitFor(() => expect(screen.getByText(/Confidence Score/i)).toBeInTheDocument());
      // wayfinder ticket 02 (investor-upgrades map) — numbers must trace back to
      // backend/app/backtest/results/model_fit_report.md, not be restated from memory.
      expect(screen.getByText(/แม่นยำในอดีตประมาณ 62-63%/)).toBeInTheDocument();
      expect(screen.getByText(/ไม่ใช่การรับประกันผลในอนาคต/)).toBeInTheDocument();
    });

    it('shows an earnings warning chip when the next earnings date is within the 14-day window', async () => {
      vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
      vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000000 + i * 10000,
      }));
      vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones: [] });
      vi.spyOn(client, 'getNextEarnings').mockResolvedValue({ ticker: 'AAPL', next_earnings_date: '2026-08-20', days_until: 7 });

      render(<DashboardPage />);
      await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

      await waitFor(() => expect(screen.getByText(/ประกาศงบใน 7 วัน/)).toBeInTheDocument());
    });

    it('shows no earnings chip when the next earnings date is outside the 14-day window', async () => {
      vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
      vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000000 + i * 10000,
      }));
      vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones: [] });
      vi.spyOn(client, 'getNextEarnings').mockResolvedValue({ ticker: 'AAPL', next_earnings_date: '2026-11-01', days_until: 90 });

      render(<DashboardPage />);
      await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

      await waitFor(() => expect(screen.getByText(/Confidence Score/i)).toBeInTheDocument());
      expect(screen.queryByText(/ประกาศงบใน/)).not.toBeInTheDocument();
    });

    it('shows no earnings chip when the ticker has no known earnings date', async () => {
      vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
      vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000000 + i * 10000,
      }));
      vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones: [] });
      vi.spyOn(client, 'getNextEarnings').mockResolvedValue({ ticker: 'AAPL', next_earnings_date: null, days_until: null });

      render(<DashboardPage />);
      await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

      await waitFor(() => expect(screen.getByText(/Confidence Score/i)).toBeInTheDocument());
      expect(screen.queryByText(/ประกาศงบใน/)).not.toBeInTheDocument();
    });

    it('renders the 4 Trading Setup cards (Entry Zone, Target Price TP, Stop Loss SL, Risk-Reward R:R)', async () => {
      vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
      vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000000,
      }));
      vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones: [] });

      render(<DashboardPage />);
      await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

      await waitFor(() => expect(screen.getByText(/Entry Zone/i)).toBeInTheDocument());
      expect(screen.getByText(/Target Price TP/i)).toBeInTheDocument();
      expect(screen.getByText(/Stop Loss SL/i)).toBeInTheDocument();
      expect(screen.getByText(/Risk-Reward R:R/i)).toBeInTheDocument();
    });

    it('renders Metric Chips Bar displaying live technical indicators', async () => {
      vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
      vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000000,
      }));
      const zones = [
        { id: 1, kind: 'support' as const, price: 95, strength: null, source: 'manual' as const },
        { id: 2, kind: 'resistance' as const, price: 150, strength: null, source: 'manual' as const },
      ];
      vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones });

      render(<DashboardPage />);
      await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

      await waitFor(() => expect(screen.getByText(/Live Indicators:/i)).toBeInTheDocument());
      expect(screen.getByText(/RSI 14:/i)).toBeInTheDocument();
      expect(screen.getByText(/MACD:/i)).toBeInTheDocument();
      expect(screen.getByText(/Nearest S:/i)).toBeInTheDocument();
      expect(screen.getByText(/Nearest R:/i)).toBeInTheDocument();
    });

    it('reacts dynamically to currency toggle (USD vs THB) with zero NaN safety', async () => {
      vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
      vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000000,
      }));
      vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones: [] });

      render(<DashboardPage />);
      await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

      await waitFor(() => expect(screen.getByText(/Entry Zone/i)).toBeInTheDocument());

      // Toggle currency to THB
      const thbBtn = screen.getByRole('button', { name: /THB \(฿\)/i });
      fireEvent.click(thbBtn);

      // Verify THB currency symbol appears in UI
      await waitFor(() => expect(screen.getAllByText(/฿/i).length).toBeGreaterThan(0));

      // Verify zero NaN safety across rendered document
      expect(document.body.innerHTML).not.toContain('NaN');
    });
  });
});




